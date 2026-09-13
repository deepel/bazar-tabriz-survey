import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { config } from '../config';
import { pool, withTransaction } from '../db';
import { logger } from '../logger';
import { AppError } from '../utils/errors';
import {
  analyzeFeatures,
  analyzeGeoJsonContent,
  loadShopIndex,
  type ImportAnalysis
} from './geojson.service';

const PREVIEW_TTL_MS = 60 * 60 * 1000;
const storedPreviews = new Map<string, { filename: string; content: string; createdAt: number }>();

export interface ApplyOptions {
  failAfterInsertCount?: number;
}

/** Validates an uploaded GeoJSON and computes the import preview. */
export async function previewImport(filename: string, content: string) {
  if (content.length > config.maxGeoJsonSize) {
    throw new AppError(
      413,
      'file_too_large',
      `فایل بزرگ‌تر از حد مجاز (${Math.floor(config.maxGeoJsonSize / 1_000_000)} مگابایت) است.`
    );
  }
  prunePreviews();
  let features;
  try {
    features = analyzeGeoJsonContent(content, config.sourceEpsg);
  } catch (err) {
    throw new AppError(400, 'invalid_geojson', (err as Error).message);
  }
  const existing = await loadShopIndex(pool);
  const analysis = analyzeFeatures(features, existing, config.shopMatchDistanceMeters);

  const previewId = randomUUID();
  storedPreviews.set(previewId, { filename, content, createdAt: Date.now() });

  logger.info('geojson.import.preview', {
    previewId,
    filename,
    total: analysis.stats.totalFeatures,
    existing: analysis.stats.existingShops,
    newShops: analysis.stats.newShops,
    geometryChanges: analysis.stats.geometryChanges
  });

  return {
    previewId,
    filename,
    stats: analysis.stats,
    errors: analysis.stats.errors
  };
}

/** Applies a previously previewed import inside a single transaction. */
export async function applyImport(previewId: string, options: ApplyOptions = {}) {
  const stored = storedPreviews.get(previewId);
  if (!stored) {
    throw new AppError(404, 'preview_not_found', 'پیش‌نمایش یافت نشد. لطفاً دوباره فایل را بارگذاری کنید.');
  }
  storedPreviews.delete(previewId);

  logger.info('geojson.import.started', { previewId, filename: stored.filename });

  try {
    const summary = await withTransaction(async (client) => {
      // Re-run analysis INSIDE the transaction so counts and the database
      // state can never drift apart. Every operation below shares a client.
      const features = analyzeGeoJsonContent(stored.content, config.sourceEpsg);
      const existing = await loadShopIndex(client);
      const analysis = analyzeFeatures(features, existing, config.shopMatchDistanceMeters);

      if (analysis.stats.invalidFeatures > 0) {
        throw new AppError(
          400,
          'invalid_feature',
          `فایل شامل ${analysis.stats.invalidFeatures} ویژگی نامعتبر است. ابتدا خطاها را برطرف کنید.`
        );
      }

      let insertedNew = 0;
      for (const item of analysis.features) {
        if (item.action === 'new') {
          insertedNew += 1;
          if (
            typeof options.failAfterInsertCount === 'number' &&
            insertedNew > options.failAfterInsertCount
          ) {
            throw new Error('test-failure-injection');
          }
        }
        await upsertShop(client, item, stored.filename);
      }

      await client.query(
        `INSERT INTO app_meta (key, value) VALUES ('last_import', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [
          JSON.stringify({
            filename: stored.filename,
            appliedAt: new Date().toISOString(),
            summary: analysis.stats
          })
        ]
      );

      return analysis.stats;
    });

    logger.info('geojson.import.completed', {
      previewId,
      filename: stored.filename,
      total: summary.totalFeatures,
      newShops: summary.newShops,
      geometryChanges: summary.geometryChanges
    });
    return { filename: stored.filename, stats: summary };
  } catch (err) {
    logger.error('geojson.import.failed', {
      previewId,
      filename: stored.filename,
      message: (err as Error).message
    });
    throw err;
  }
}

function upsertShop(
  client: PoolClient,
  item: ImportAnalysis['features'][number],
  sourceFile: string
) {
  const { geometryWgs84, centroid, bbox, properties, handle, targetShopId } = item;
  return client.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (shop_id) DO UPDATE SET
       geometry = EXCLUDED.geometry,
       geom_fingerprint = EXCLUDED.geom_fingerprint,
       entity_handle = EXCLUDED.entity_handle,
       centroid_lat = EXCLUDED.centroid_lat,
       centroid_lon = EXCLUDED.centroid_lon,
       min_lon = EXCLUDED.min_lon,
       min_lat = EXCLUDED.min_lat,
       max_lon = EXCLUDED.max_lon,
       max_lat = EXCLUDED.max_lat,
       original_properties = EXCLUDED.original_properties,
       source_file = EXCLUDED.source_file,
       updated_at = now()`,
    [
      targetShopId,
      JSON.stringify(geometryWgs84),
      item.shopId,
      handle,
      centroid.lat,
      centroid.lon,
      bbox.minLon,
      bbox.minLat,
      bbox.maxLon,
      bbox.maxLat,
      JSON.stringify(properties),
      sourceFile
    ]
  );
}

function prunePreviews(): void {
  const now = Date.now();
  for (const [key, value] of storedPreviews) {
    if (now - value.createdAt > PREVIEW_TTL_MS) storedPreviews.delete(key);
  }
}