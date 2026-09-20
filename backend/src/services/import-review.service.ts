import { createHash, randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { pool, withTransaction } from '../db';
import { logger } from '../logger';
import { AppError } from '../utils/errors';
import { geometryBBox, geometryCentroid, type GeometryLike } from '../utils/geo';
import {
  analyzeGeoJsonContent,
  makeShopId,
  type ImportFeature
} from './geojson.service';
import {
  matchImportFeatures,
  type ImportFeatureMatch,
  type ImportMatchSummary,
  type ImportReviewResult,
  type MatchingNewFeature,
  type MatchingOldShop
} from './geometry-matching.service';
import { upsertShopRecord } from './import.service';

const REVIEW_TTL_MS = 60 * 60 * 1000;

/**
 * Server-side session for a GeoJSON import review.
 *
 * A preview NEVER touches shop/survey data: it only reads the existing shops
 * (with their survey name/state), runs the deterministic matching engine and
 * stores the immutable review result plus the dataset fingerprint it was
 * computed against. Explicit admin decisions (resolutions) are collected
 * separately. The whole session is in-memory, exactly like the existing
 * non-destructive import previews, and expires after an hour.
 */
export interface ReviewSession {
  previewId: string;
  filename: string;
  createdAt: number;
  /** Hash of the shops dataset this review was computed against. */
  datasetFingerprint: string;
  /** Immutable matching result from the review moment. */
  result: ImportReviewResult;
  /** Explicit admin decisions keyed by new feature index. */
  resolutions: Map<number, ImportResolution>;
}

export type ImportResolutionAction = 'same_existing_shop' | 'new_shop' | 'exclude';

export interface ImportResolution {
  action: ImportResolutionAction;
  /** Present and validated against the feature candidates when action is `same_existing_shop`. */
  oldShopId?: string;
}

const reviewSessions = new Map<string, ReviewSession>();

interface OldShopRow {
  shop_id: string;
  geometry: Record<string, unknown>;
  geom_fingerprint: string;
  entity_handle: string | null;
  shop_name: string | null;
  surveyed: boolean;
}

/** Loads every shop with its current survey name/state (source of truth: surveys). */
export async function loadOldShops(client: Pool | PoolClient): Promise<OldShopRow[]> {
  const result = await client.query<OldShopRow>(
    `SELECT s.shop_id, s.geometry, s.geom_fingerprint, s.entity_handle,
            sv.shop_name, (sv.shop_id IS NOT NULL) AS surveyed
     FROM shops s
     LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
     ORDER BY s.shop_id`
  );
  return result.rows;
}

function datasetFingerprint(rows: OldShopRow[]): string {
  const canonical = rows
    .map((r) => `${r.shop_id}|${r.geom_fingerprint}|${r.entity_handle ?? ''}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function toOldShops(rows: OldShopRow[]): MatchingOldShop[] {
  return rows.map((r) => ({
    shopId: r.shop_id,
    name: r.shop_name,
    surveyed: r.surveyed,
    handle: r.entity_handle,
    fingerprint: r.geom_fingerprint,
    geometryWgs84: r.geometry as GeometryLike
  }));
}

function toNewFeatures(features: ImportFeature[]): MatchingNewFeature[] {
  return features.map((f) => ({
    index: f.index,
    fingerprint: f.fingerprint,
    handle: f.handle,
    properties: f.properties,
    geometryWgs84: f.geometry
  }));
}

function pruneReviewSessions(): void {
  const now = Date.now();
  for (const [key, session] of reviewSessions) {
    if (now - session.createdAt > REVIEW_TTL_MS) reviewSessions.delete(key);
  }
}

function serializeResolutions(resolutions: Map<number, ImportResolution>): Record<number, ImportResolution> {
  const out: Record<number, ImportResolution> = {};
  for (const [index, resolution] of resolutions) out[index] = resolution;
  return out;
}

function blockingCount(result: ImportReviewResult, resolutions: Map<number, ImportResolution>): number {
  return result.features.filter(
    (f) => f.reviewRequired && !resolutions.has(f.newIndex)
  ).length;
}

/** Statuses whose features MUST receive an explicit decision before apply. */
export function isBlockingStatus(status: ImportFeatureMatch['status']): boolean {
  return status === 'REVIEW' || status === 'INVALID' || status === 'DUPLICATE';
}

/**
 * Runs the non-destructive import review: geometry matching against the live
 * shops + survey metadata. Never writes to the database.
 */
export async function reviewImport(
  filename: string,
  content: string
): Promise<{ previewId: string; filename: string; result: ImportReviewResult }> {
  if (content.length > config.maxGeoJsonSize) {
    throw new AppError(
      413,
      'file_too_large',
      `فایل بزرگ‌تر از حد مجاز (${Math.floor(config.maxGeoJsonSize / 1_000_000)} مگابایت) است.`
    );
  }
  pruneReviewSessions();

  let features: ImportFeature[];
  try {
    features = analyzeGeoJsonContent(content, config.sourceEpsg);
  } catch (err) {
    throw new AppError(400, 'invalid_geojson', (err as Error).message);
  }

  const rows = await loadOldShops(pool);
  const result = matchImportFeatures(toOldShops(rows), toNewFeatures(features));

  const previewId = randomUUID();
  reviewSessions.set(previewId, {
    previewId,
    filename,
    createdAt: Date.now(),
    datasetFingerprint: datasetFingerprint(rows),
    result,
    resolutions: new Map()
  });

  logger.info('geojson.import.review.started', {
    previewId,
    filename,
    total: result.summary.totalFeatures,
    existing: result.summary.existing,
    newFeatures: result.summary.newFeatures,
    reviewRequired: result.summary.reviewRequired,
    invalid: result.summary.invalid
  });

  return { previewId, filename, result };
}

type ValidatedResolution = Required<Pick<ImportResolution, 'action'>> & { oldShopId?: string };

/**
 * Records an explicit admin decision for one reviewed feature. The server is
 * authoritative: candidate shop ids are validated against the session result,
 * so a client can never smuggle in an arbitrary shop_id.
 */
export async function resolveReview(
  previewId: string,
  newIndex: number,
  raw: unknown
): Promise<{ resolutions: Record<number, ImportResolution>; pending: number }> {
  const session = reviewSessions.get(previewId);
  if (!session) {
    throw new AppError(404, 'preview_not_found', 'پیش‌نمایش یافت نشد. لطفاً دوباره فایل را بارگذاری کنید.');
  }

  const resolution = parseResolution(raw);
  const feature = session.result.features.find((f) => f.newIndex === newIndex);
  if (!feature) {
    throw new AppError(400, 'unknown_review_item', 'مورد موردنظر در پیش‌نمایش یافت نشد.');
  }

  if (feature.status === 'REVIEW') {
    if (resolution.action === 'same_existing_shop') {
      const candidateIds = feature.candidates.map((c) => c.oldShopId);
      if (!resolution.oldShopId || !candidateIds.includes(resolution.oldShopId)) {
        throw new AppError(
          400,
          'invalid_candidate',
          'مغازهٔ انتخابی در گزینه‌های پیشنهادی این مورد نیست.'
        );
      }
    } else if (resolution.action !== 'new_shop') {
      throw new AppError(400, 'unsupported_resolution', 'این تصمیم برای این مورد مجاز نیست.');
    }
  } else if (feature.status === 'INVALID' || feature.status === 'DUPLICATE') {
    if (resolution.action !== 'exclude') {
      throw new AppError(400, 'unsupported_resolution', 'این مورد فقط با حذف از فایل قابل رفع است.');
    }
  } else {
    throw new AppError(400, 'item_not_blocking', 'این مورد نیازی به تصمیم ندارد.');
  }

  session.resolutions.set(newIndex, resolution);
  logger.info('geojson.import.review.resolved', {
    previewId,
    newIndex,
    action: resolution.action,
    oldShopId: resolution.oldShopId ?? null
  });

  return {
    resolutions: serializeResolutions(session.resolutions),
    pending: blockingCount(session.result, session.resolutions)
  };
}

function parseResolution(raw: unknown): ValidatedResolution {
  const body = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const action = body.action;
  if (action !== 'same_existing_shop' && action !== 'new_shop' && action !== 'exclude') {
    throw new AppError(400, 'invalid_resolution', 'تصمیم ارسال‌شده معتبر نیست.');
  }
  const oldShopId = typeof body.oldShopId === 'string' && body.oldShopId ? body.oldShopId : undefined;
  return { action, oldShopId };
}

export interface ApplyReviewOptions {
  failAfterInsertCount?: number;
}

export interface ApplyReviewResult {
  filename: string;
  summary: ImportMatchSummary;
  applied: { newShops: number; updates: number; excluded: number };
}

function summaryForResult(result: ImportReviewResult, resolutions: Map<number, ImportResolution>): ImportMatchSummary {
  const count = (status: ImportFeatureMatch['status']): number =>
    result.features.filter((f) => f.status === status).length;
  const exact = count('EXACT_MATCH');
  const geometryChanged = count('GEOMETRY_MATCH');
  return {
    totalFeatures: result.summary.totalFeatures,
    existing: exact + geometryChanged,
    geometryChanged,
    exact,
    newFeatures: count('NEW'),
    reviewRequired: count('REVIEW'),
    invalid: count('INVALID'),
    duplicate: count('DUPLICATE'),
    oldMatched: result.summary.oldMatched,
    oldReferenced: result.summary.oldReferenced
  };
}

/**
 * Applies a fully-reviewed import inside one transaction.
 *
 * Stale protection: before any write the current shops dataset is hashed and
 * compared with the hash captured at review time. Any shop geometry, handle or
 * membership change in between means the review is no longer valid and the
 * call fails with a conflict instead of silently overwriting newer data.
 *
 * Explicit admin decisions are honored verbatim (they were validated against
 * this same dataset). Genuinely new features only get a shop_id here, at apply
 * time, never during preview. Missing old shops are never deleted.
 */
export async function applyReviewedImport(
  previewId: string,
  options: ApplyReviewOptions = {}
): Promise<ApplyReviewResult> {
  const session = reviewSessions.get(previewId);
  if (!session) {
    throw new AppError(404, 'preview_not_found', 'پیش‌نمایش یافت نشد. لطفاً دوباره فایل را بارگذاری کنید.');
  }

  logger.info('geojson.import.review.apply.started', { previewId, filename: session.filename });

  try {
    const applied = await withTransaction(async (client) => {
      const currentRows = await loadOldShops(client);
      if (datasetFingerprint(currentRows) !== session.datasetFingerprint) {
        throw new AppError(
          409,
          'stale_import_review',
          'داده‌های موجود بعد از بررسی تغییر کرده‌اند. لطفاً فایل را دوباره بارگذاری و بررسی نمایید.'
        );
      }

      const unresolved = session.result.features.filter(
        (f) => isBlockingStatus(f.status) && !session.resolutions.has(f.newIndex)
      );
      if (unresolved.length > 0) {
        throw new AppError(
          400,
          'pending_review_resolution',
          `${unresolved.length} مورد هنوز بررسی نشده است. ابتدا همه موارد را تعیین تکلیف نمایید.`
        );
      }

      let insertedNew = 0;
      let updates = 0;
      let excluded = 0;

      for (const match of session.result.features) {
        const resolution = session.resolutions.get(match.newIndex);

        if (match.status === 'INVALID' || match.status === 'DUPLICATE') {
          if (resolution?.action !== 'exclude') {
            throw new AppError(400, 'pending_review_resolution', 'یک مورد نامعتبر بدون تعیین تکلیف باقی مانده است.');
          }
          excluded += 1;
          continue;
        }

        if (match.status === 'REVIEW') {
          if (resolution?.action === 'new_shop') {
            insertedNew += 1;
            await failAfterInjected(options, insertedNew);
            await upsertShopRecord(client, storable(match), makeShopId(), session.filename);
          } else if (resolution?.action === 'same_existing_shop' && resolution.oldShopId) {
            updates += 1;
            await upsertShopRecord(client, storable(match), resolution.oldShopId, session.filename);
          } else {
            throw new AppError(400, 'pending_review_resolution', 'یک مورد بررسی، بدون تصمیم معتبر باقی مانده است.');
          }
          continue;
        }

        if (match.status === 'NEW') {
          insertedNew += 1;
          await failAfterInjected(options, insertedNew);
          await upsertShopRecord(client, storable(match), makeShopId(), session.filename);
        } else {
          // EXACT_MATCH / GEOMETRY_MATCH keep the existing shop identity.
          if (!match.matchedOldShopId) {
            throw new AppError(500, 'internal_error', 'تطابق بدون شناسهٔ فروشگاه یافت شد.');
          }
          updates += 1;
          await upsertShopRecord(client, storable(match), match.matchedOldShopId, session.filename);
        }
      }

      await client.query(
        `INSERT INTO app_meta (key, value) VALUES ('last_import', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [
          JSON.stringify({
            filename: session.filename,
            appliedAt: new Date().toISOString(),
            summary: summaryForResult(session.result, session.resolutions)
          })
        ]
      );

      return { insertedNew, updates, excluded };
    });

    reviewSessions.delete(previewId);

    logger.info('geojson.import.review.apply.completed', {
      previewId,
      filename: session.filename,
      newShops: applied.insertedNew,
      updates: applied.updates,
      excluded: applied.excluded
    });

    return {
      filename: session.filename,
      summary: summaryForResult(session.result, session.resolutions),
      applied: { newShops: applied.insertedNew, updates: applied.updates, excluded: applied.excluded }
    };
  } catch (err) {
    logger.error('geojson.import.review.apply.failed', {
      previewId,
      filename: session.filename,
      message: (err as Error).message
    });
    throw err;
  }
}

function failAfterInjected(
  options: ApplyReviewOptions,
  insertedNew: number
): void {
  if (typeof options.failAfterInsertCount === 'number' && insertedNew > options.failAfterInsertCount) {
    throw new Error('test-failure-injection');
  }
}

function storable(match: ImportFeatureMatch): Parameters<typeof upsertShopRecord>[1] {
  return {
    fingerprint: match.newFingerprint,
    handle: match.newHandle,
    properties: match.newProperties,
    geometryWgs84: match.newWgs84Geometry,
    centroid: geometryCentroid(match.newWgs84Geometry),
    bbox: geometryBBox(match.newWgs84Geometry)
  };
}