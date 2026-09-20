/**
 * Phase 2.2 — Real GeoJSON import backtest (DB-backed).
 *
 * Uses the completed Phase 2 review pipeline EXACTLY as-is against the real
 * export pair (shops-test1 = old dataset, shops-update1 = new dataset):
 *   reviewImport -> (resolve) -> applyReviewedImport, over the live test DB.
 *
 * The engine-level (DB-free) variant of this backtest lives in
 * geometry-matching.test.ts; here we additionally verify the DB-backed facts:
 * identity (shop_id) preservation, survey data preservation, and that
 * unmatched old shops are never deleted.
 */
import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db';
import { applyReviewedImport, resolveReview, reviewImport } from '../services/import-review.service';
import type { ImportFeatureMatch } from '../services/geometry-matching.service';
import { geometryBBox, geometryCentroid } from '../utils/geo';
import { countShops, countSurveys, dbDescribe, resetDb } from './helpers';

const OLD_FIXTURE = path.join(__dirname, 'fixtures', 'shops-test1.geojson');
const NEW_FIXTURE = path.join(__dirname, 'fixtures', 'shops-update1.geojson');

interface OldRow {
  shop_id: string;
  entity_handle: string | null;
  geom_fingerprint: string;
}

function log(name: string, value: unknown): void {
  console.log(`[BT] ${name} = ${JSON.stringify(value)}`);
}

function list(name: string, rows: Array<Record<string, unknown>>): void {
  console.log(`[BT] ${name}:`);
  for (const row of rows) console.log(`[BT]   ${JSON.stringify(row)}`);
}

dbDescribe('Phase 2.2 — real fixtures backtest through the DB review flow', () => {
  beforeEach(async () => await resetDb());

  it('reproduces the established numbers on the real old/new export pair', async () => {
    const oldContent = fs.readFileSync(OLD_FIXTURE, 'utf8');
    const newContent = fs.readFileSync(NEW_FIXTURE, 'utf8');

    // 1) Load the OLD dataset through the same review pipeline. Genuine
    //    finding: shops-test1 contains a legacy broken polygon at index 42
    //    (handle CB, holes outside shell). The pipeline correctly refuses to
    //    auto-load it: apply is blocked until the INVALID feature is excluded.
    const oldReview = await reviewImport('shops-test1.geojson', oldContent);
    expect(oldReview.result.summary.totalFeatures).toBe(125);
    const brokenLegacy = oldReview.result.features.find((f) => f.status === 'INVALID')!;
    expect(brokenLegacy.newIndex).toBe(42);
    expect(brokenLegacy.newHandle).toBe('CB');
    expect(brokenLegacy.geometryIssues).toContain('hole_outside_shell');
    log('old dataset pipeline behavior (as-is)', {
      invalidLegacyFeature: brokenLegacy.newIndex,
      handle: 'CB',
      issues: brokenLegacy.geometryIssues,
      note: 'apply blocked until this INVALID feature is explicitly excluded'
    });
    await resolveReview(oldReview.previewId, brokenLegacy.newIndex, { action: 'exclude' });
    await applyReviewedImport(oldReview.previewId);

    // Restore the historical broken polygon the way a legacy (pre-review)
    // import left it in production: its exact WGS84 geometry + fingerprint
    // under entity_handle CB. This is the row the engine models as old#42 and
    // the source of the invalid-old-geometry REVIEW in the update pass.
    const brokenLegacyFeature = oldReview.result.features.find((f) => f.newIndex === 42)!;
    await insertLegacyOldRow(brokenLegacyFeature, 'CB');

    const olds = (await pool.query<OldRow>(
      'SELECT shop_id, entity_handle, geom_fingerprint FROM shops ORDER BY shop_id'
    )).rows;
    expect(olds).toHaveLength(125);
    log('old dataset loaded', { shops: olds.length, includesLegacyCB: true });
    const handleToShop = new Map<string, string>();
    for (const o of olds) if (o.entity_handle) handleToShop.set(o.entity_handle, o.shop_id);

    // Survey every old shop (simulates a fully walked bazaar).
    await pool.query(
      `INSERT INTO surveys (shop_id, shop_name, activity, building_condition, surveyor_id, surveyed_at)
       SELECT shop_id, 'مغازهٔ ' || shop_id, 'پوشاک', 'سالم',
              (SELECT id FROM users WHERE username = 'admin'), now()
       FROM shops`
    );
    expect(await countSurveys()).toBe(125);

    // 2) REVIEW the NEW dataset against the DB.
    const review = await reviewImport('shops-update1.geojson', newContent);
    const result = review.result;
    const summary = result.summary;

    log('review summary', summary);
    expect(summary).toMatchObject({
      totalFeatures: 1041,
      existing: 123,
      geometryChanged: 91,
      exact: 32,
      newFeatures: 916,
      reviewRequired: 1,
      invalid: 1,
      duplicate: 0,
      oldMatched: 123,
      oldReferenced: 124
    });

    // Preview must be non-destructive.
    expect(await countShops()).toBe(125);
    expect(await countSurveys()).toBe(125);

    const byIndex = new Map(result.features.map((f) => [f.newIndex, f]));

    // ---- Checkpoints -------------------------------------------------------

    // 3) The invalid new feature.
    const invalid = byIndex.get(378)!;
    expect(invalid.status).toBe('INVALID');
    expect(invalid.newHandle).toBe('1DA');
    expect(invalid.geometryIssues).toContain('shell_self_intersects');
    log('invalid new feature', { newIndex: 378, handle: invalid.newHandle, issues: invalid.geometryIssues });

    // 4) The REVIEW caused by invalid OLD geometry.
    const reviewFeature = result.features.find((f) => f.status === 'REVIEW')!;
    expect(reviewFeature.reason).toBe('invalid_old_geometry');
    expect(reviewFeature.reviewRequired).toBe(true);
    expect(reviewFeature.matchedOldIndex).toBeNull();
    const badCandidate = reviewFeature.candidates.find((c) => c.oldGeometryValid === false);
    expect(badCandidate).toBeTruthy();
    expect(badCandidate!.score).toBeGreaterThanOrEqual(0.9);
    log('REVIEW (invalid old geometry)', {
      newIndex: reviewFeature.newIndex,
      newHandle: reviewFeature.newHandle,
      oldShopId: badCandidate!.oldShopId,
      oldHandle: badCandidate!.oldHandle,
      score: badCandidate!.score,
      overlapRatio: badCandidate!.evidence.overlapRatio
    });

    // 5) The old feature with no counterpart in the new file (handle FF).
    const referenced = new Set<string>();
    for (const f of result.features) for (const c of f.candidates) referenced.add(c.oldShopId);
    expect(referenced.size).toBe(124);
    const unreferencedOlds = olds.filter((o) => !referenced.has(o.shop_id));
    expect(unreferencedOlds).toHaveLength(1);
    expect(unreferencedOlds[0].entity_handle).toBe('FF');
    log('unreferenced old feature', { shop_id: unreferencedOlds[0].shop_id, handle: 'FF' });

    // 6-7) Samples of each important match type.
    const exactSamples = result.features.filter((f) => f.status === 'EXACT_MATCH').slice(0, 5);
    const geomSamples = result.features.filter((f) => f.status === 'GEOMETRY_MATCH').slice(0, 5);
    const newSamples = result.features.filter((f) => f.status === 'NEW').slice(0, 5);
    list('exact-match samples', exactSamples.map((f) => ({
      newIndex: f.newIndex, newHandle: f.newHandle, oldShopId: f.matchedOldShopId,
      oldHandle: oldHandleFor(olds, f.matchedOldShopId), bestScore: f.bestScore
    })));
    list('geometry-match samples', geomSamples.map((f) => ({
      newIndex: f.newIndex, newHandle: f.newHandle, oldShopId: f.matchedOldShopId,
      oldHandle: oldHandleFor(olds, f.matchedOldShopId), bestScore: f.bestScore,
      centroidDistanceMeters: f.candidates[0]?.evidence.centroidDistanceMeters,
      overlapRatio: f.candidates[0]?.evidence.overlapRatio
    })));
    list('new-feature samples', newSamples.map((f) => ({ newIndex: f.newIndex, newHandle: f.newHandle })));

    // 8) EntityHandle differences: handles are carried as metadata only. Exact
    //    matches (identical fingerprints) must not require equal handles.
    const exactWithDifferentHandles = result.features
      .filter((f) => f.status === 'EXACT_MATCH' || f.status === 'GEOMETRY_MATCH')
      .map((f) => ({
        newIndex: f.newIndex,
        status: f.status,
        newHandle: f.newHandle,
        oldHandle: olds.find((o) => o.shop_id === f.matchedOldShopId)?.entity_handle ?? null
      }))
      .filter((r) => r.newHandle !== r.oldHandle);
    log('matched pairs whose old/new EntityHandle differ', { count: exactWithDifferentHandles.length });
    list('handle-difference samples', exactWithDifferentHandles.slice(0, 6));

    // 9) matchedOldShopId is a real existing DB shop (identity, not a guess).
    for (const f of result.features) {
      if ((f.status === 'EXACT_MATCH' || f.status === 'GEOMETRY_MATCH') && f.matchedOldShopId) {
        const row = await pool.query('SELECT 1 FROM shops WHERE shop_id = $1', [f.matchedOldShopId]);
        expect(row.rowCount).toBe(1);
      }
    }

    // 10) Resolve: admin merges the invalid-old-geometry twin into its old
    //     shop and excludes the invalid new feature. Apply.
    await resolveReview(review.previewId, reviewFeature.newIndex, {
      action: 'same_existing_shop',
      oldShopId: badCandidate!.oldShopId
    });
    await resolveReview(review.previewId, invalid.newIndex, { action: 'exclude' });

    const beforeApply = await pool.query<{ shop_id: string; geometry: unknown }>(
      'SELECT shop_id, geometry FROM shops WHERE shop_id = ANY($1::text[])',
      [[...geomSamples.map((f) => f.matchedOldShopId!), unreferencedOlds[0].shop_id]]
    );
    const geometryBefore = new Map(beforeApply.rows.map((r) => [r.shop_id, r.geometry]));
    const surveysBefore = await countSurveys();

    const applied = await applyReviewedImport(review.previewId);
    log('apply result', applied.applied);
    expect(applied.applied).toEqual({ newShops: 916, updates: 124, excluded: 1 });

    // 11) shop_id preserved for a GEOMETRY_MATCH; geometry refreshed.
    const sampled = geomSamples[0];
    const after = (await pool.query<{ geometry: unknown }>(
      'SELECT geometry FROM shops WHERE shop_id = $1',
      [sampled.matchedOldShopId]
    )).rows[0];
    expect(after.geometry).toEqual(sampled.newWgs84Geometry);
    log('geometry-match identity preserved', {
      shop_id: sampled.matchedOldShopId,
      geometryUpdated: JSON.stringify(geometryBefore.get(sampled.matchedOldShopId!)) !== JSON.stringify(after.geometry),
      newHandle: sampled.newHandle,
      oldHandle: olds.find((o) => o.shop_id === sampled.matchedOldShopId)?.entity_handle ?? null
    });

    // 12) Survey data preserved (surveys untouched, still keyed by same shop_id).
    expect(await countSurveys()).toBe(surveysBefore);
    const survey = await pool.query('SELECT 1 FROM surveys WHERE shop_id = $1', [sampled.matchedOldShopId]);
    expect(survey.rowCount).toBe(1);

    // 13) The invalid feature was excluded (no shop with its bowtie geometry).
    const insertedBowtie = await pool.query('SELECT 1 FROM shops WHERE entity_handle = $1', [invalid.newHandle]);
    expect(insertedBowtie.rowCount).toBe(0);

    // 14) The REVIEW-merging admin decision refreshed that old shop's geometry
    //     under its existing identity.
    const merged = (await pool.query<{ geometry: unknown }>(
      'SELECT geometry FROM shops WHERE shop_id = $1',
      [badCandidate!.oldShopId]
    )).rows[0];
    expect(merged.geometry).toEqual(reviewFeature.newWgs84Geometry);

    // 15) After apply: 125 existing + 916 new = 1041. Unmatched old shop (FF)
    //     still exists, untouched, still surveyed.
    expect(await countShops()).toBe(1041);
    const missing = await pool.query(
      'SELECT shop_id, entity_handle FROM shops WHERE shop_id = $1',
      [unreferencedOlds[0].shop_id]
    );
    expect(missing.rows).toHaveLength(1);
    expect(missing.rows[0].entity_handle).toBe('FF');
    const missingSurvey = await pool.query('SELECT 1 FROM surveys WHERE shop_id = $1', [
      unreferencedOlds[0].shop_id
    ]);
    expect(missingSurvey.rowCount).toBe(1);
    log('unmatched old shop kept (not deleted)', {
      shop_id: unreferencedOlds[0].shop_id,
      handle: 'FF',
      stillSurveyed: true
    });
  });
});

/** Returns the old handle for a matched shop_id (or null). */
function oldHandleFor(olds: OldRow[], shopId: string | null): string | null {
  return olds.find((o) => o.shop_id === shopId)?.entity_handle ?? null;
}

/**
 * Inserts one raw shop row from a reviewed feature (same columns/values the
 * pipeline writes via upsertShopRecord) — used to reconstruct the historical
 * broken legacy polygon that the review flow correctly refuses to auto-load.
 */
async function insertLegacyOldRow(feature: ImportFeatureMatch, handle: string): Promise<void> {
  const centroid = geometryCentroid(feature.newWgs84Geometry);
  const bbox = geometryBBox(feature.newWgs84Geometry);
  await pool.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      'legacy-old-42',
      JSON.stringify(feature.newWgs84Geometry),
      feature.newFingerprint,
      handle,
      centroid.lat,
      centroid.lon,
      bbox.minLon,
      bbox.minLat,
      bbox.maxLon,
      bbox.maxLat,
      JSON.stringify(feature.newProperties ?? {}),
      'legacy-export'
    ]
  );
}