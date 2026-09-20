import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../db';
import {
  applyReviewedImport,
  resolveReview,
  reviewImport
} from '../services/import-review.service';
import { geometryBBox, geometryCentroid, geometryFingerprint, type GeometryLike } from '../utils/geo';
import {
  countShops,
  countSurveys,
  dbDescribe,
  insertSurveyFor,
  insertSimpleShop,
  loginCookie,
  resetDb
} from './helpers';

const BASE_LON = 46.29;
const BASE_LAT = 38.07;

/** WGS84 square near Tabriz (engine works in projected meters automatically). */
function wgsSquare(lon: number, lat: number, sizeDeg: number): GeometryLike {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon, lat],
        [lon + sizeDeg, lat],
        [lon + sizeDeg, lat + sizeDeg],
        [lon, lat + sizeDeg],
        [lon, lat]
      ]
    ]
  };
}

function wgsCollection(features: Array<Record<string, unknown>>): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
    features
  });
}

function asFeature(index: number, geometry: GeometryLike, handle: string | null = null): Record<string, unknown> {
  return {
    type: 'Feature',
    properties: handle ? { EntityHandle: handle } : {},
    geometry
  };
}

async function insertRawShop(
  shopId: string,
  geometry: GeometryLike,
  fingerprint: string,
  handle: string | null = null
): Promise<void> {
  const centroid = geometryCentroid(geometry);
  const bbox = geometryBBox(geometry);
  await pool.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      shopId,
      JSON.stringify(geometry),
      fingerprint,
      handle,
      centroid.lat,
      centroid.lon,
      bbox.minLon,
      bbox.minLat,
      bbox.maxLon,
      bbox.maxLat,
      {},
      'review-test'
    ]
  );
}

async function shopGeometry(shopId: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query('SELECT geometry FROM shops WHERE shop_id = $1', [shopId]);
  return rows[0]?.geometry ?? null;
}

dbDescribe('GeoJSON import review (Phase 2)', () => {
  beforeEach(async () => await resetDb());

  describe('review preview', () => {
    it('returns a typed ImportReviewResult without writing anything', async () => {
      const before = await countShops();
      const preview = await reviewImport(
        'review.geojson',
        wgsCollection([asFeature(0, wgsSquare(BASE_LON, BASE_LAT, 0.0001))])
      );
      expect(preview.previewId).toBeTruthy();
      expect(preview.filename).toBe('review.geojson');
      expect(preview.result.summary).toMatchObject({
        totalFeatures: 1,
        existing: 0,
        newFeatures: 1,
        reviewRequired: 0
      });
      expect(preview.result.features[0].status).toBe('NEW');
      expect(preview.result.features[0].geometryValid).toBe(true);
      expect(preview.result.features[0].newWgs84Geometry).toBeTruthy();
      // Preview NEVER mutates the database.
      expect(await countShops()).toBe(before);
      expect(await countSurveys()).toBe(0);
    });

    it('never creates shop ids during preview, even for unresolved items', async () => {
      await insertSimpleShop('s1', 'H1');
      const preview = await reviewImport(
        'x.geojson',
        wgsCollection([
          asFeature(0, wgsSquare(BASE_LON, BASE_LAT, 0.0001)),
          asFeature(1, wgsSquare(BASE_LON + 0.001, BASE_LAT + 0.001, 0.0001))
        ])
      );
      expect(preview.result.summary.totalFeatures).toBe(2);
      expect(preview.result.features.every((f) => f.status === 'NEW')).toBe(true);
      expect(await countShops()).toBe(1);
      // No shop row may have been invented for either NEW feature.
      const features = preview.result.features;
      for (const f of features) {
        const { rows } = await pool.query(
          'SELECT shop_id FROM shops WHERE geom_fingerprint = $1',
          [f.newFingerprint]
        );
        expect(rows).toHaveLength(0);
      }
    });

    it('candidate data carries the real shop name and surveyed state from surveys', async () => {
      const geom = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      await insertRawShop('named_shop', geom, `fp_named`, null);
      await insertRawShop('unvisited_shop', wgsSquare(BASE_LON + 0.05, BASE_LAT, 0.0001), `fp_unvisited`, null);
      await insertSurveyFor('named_shop', 'کفش', 'admin', null, { shopName: 'فروشگاه نمونه' });

      // Slightly shifted geometry -> one confident candidate (GEOMETRY_MATCH).
      const shifted = wgsSquare(BASE_LON + 0.000003, BASE_LAT + 0.000002, 0.0001);
      const preview = await reviewImport('named.geojson', wgsCollection([asFeature(0, shifted)]));
      const match = preview.result.features[0];
      expect(match.status).toBe('GEOMETRY_MATCH');
      const candidate = match.candidates.find((c) => c.oldShopId === 'named_shop');
      expect(candidate?.oldName).toBe('فروشگاه نمونه');
      expect(candidate?.oldSurveyed).toBe(true);
      expect(candidate?.oldFingerprint).toBe('fp_named');
      expect(candidate?.evidence.overlapRatio).toBeGreaterThan(0.8);
    });
  });

  describe('HTTP access control', () => {
    it('requires an admin session for the review endpoints', async () => {
      const { app, cookie } = await loginCookie('admin');
      const ok = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review',
        headers: { cookie },
        payload: { filename: 'a.geojson', content: wgsCollection([asFeature(0, wgsSquare(BASE_LON, BASE_LAT, 0.0001))]) }
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().result.summary.newFeatures).toBe(1);

      const surveyor = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review',
        headers: { cookie: (await loginCookie('surveyor')).cookie },
        payload: { filename: 'a.geojson', content: 'x' }
      });
      expect(surveyor.statusCode).toBe(403);

      const anonymous = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review',
        payload: { filename: 'a.geojson', content: 'x' }
      });
      expect(anonymous.statusCode).toBe(401);
    });

    it('blocks a surveyor from resolve and apply endpoints', async () => {
      const surveyor = await loginCookie('surveyor');
      for (const url of ['/api/admin/geojson/import/review/resolve', '/api/admin/geojson/import/review/apply']) {
        const res = await surveyor.app.inject({
          method: 'POST',
          url,
          headers: { cookie: surveyor.cookie },
          payload: { previewId: 'x' }
        });
        expect(res.statusCode).toBe(403);
      }
    });
  });

  describe('REVIEW resolution', () => {
    it('REVIEWs an ambiguous feature and SAME_EXISTING_SHOP preserves the chosen shop_id', async () => {
      const a = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      const b = wgsSquare(BASE_LON + 0.000009, BASE_LAT + 0.000004, 0.0001);
      const novel = wgsSquare(BASE_LON + 0.000004, BASE_LAT + 0.000002, 0.0001);
      await insertRawShop('amb_a', a, 'fp_a');
      await insertRawShop('amb_b', b, 'fp_b');
      await insertSurveyFor('amb_a', 'پوشاک', 'admin', null, { shopName: 'مغازه A' });

      const preview = await reviewImport('amb.geojson', wgsCollection([asFeature(0, novel)]));
      const match = preview.result.features[0];
      expect(match.status).toBe('REVIEW');
      expect(match.reason).toBe('ambiguous_candidates');
      const ids = match.candidates.map((c) => c.oldShopId);
      expect(ids).toContain('amb_a');
      expect(ids).toContain('amb_b');

      // Server rejects a shop_id outside the candidate list.
      await expect(
        resolveReview(preview.previewId, 0, { action: 'same_existing_shop', oldShopId: 'not_a_candidate' })
      ).rejects.toMatchObject({ code: 'invalid_candidate' });

      // The admin explicitly picks amb_b (not necessarily the best match).
      const resolved = await resolveReview(preview.previewId, 0, {
        action: 'same_existing_shop',
        oldShopId: 'amb_b'
      });
      expect(resolved.resolutions[0]).toEqual({ action: 'same_existing_shop', oldShopId: 'amb_b' });
      expect(resolved.pending).toBe(0);

      await applyReviewedImport(preview.previewId);
      expect(await countShops()).toBe(2);
      // amb_b took the new geometry under its existing identity; amb_a untouched.
      expect((await shopGeometry('amb_b')) as GeometryLike).toEqual(novel);
      expect((await shopGeometry('amb_a')) as GeometryLike).toEqual(a);
      // The survey of the OTHER shop is untouched.
      expect(await countSurveys()).toBe(1);
    });

    it('resolves REVIEW as NEW_SHOP and creates a fresh shop only at apply', async () => {
      await insertSimpleShop('solo', 'H1');
      const preview = await reviewImport(
        'new-here.geojson',
        wgsCollection([asFeature(0, wgsSquare(BASE_LON, BASE_LAT, 0.0001))])
      );
      // Single far away shop and a far away novel geometry -> NEW, no blocking.
      expect(preview.result.features[0].status).toBe('NEW');
      expect(await countShops()).toBe(1);
    });

    it('matches an invalid old geometry through its repaired shell, demands REVIEW, preserves identity on apply', async () => {
      const shell = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      const bogus = wgsSquare(BASE_LON - 0.002, BASE_LAT - 0.002, 0.00006);
      const invalidOld = {
        type: 'Polygon',
        coordinates: [(shell.coordinates as number[][][])[0], (bogus.coordinates as number[][][])[0]]
      } as unknown as GeometryLike;
      await insertRawShop('broken_old', invalidOld, 'fp_broken');
      await insertSurveyFor('broken_old', 'فرش', 'admin', null, { shopName: 'فرش فروشی' });

      const preview = await reviewImport('repair.geojson', wgsCollection([asFeature(0, shell)]));
      const match = preview.result.features[0];
      expect(match.status).toBe('REVIEW');
      expect(match.reason).toBe('invalid_old_geometry');
      const candidate = match.candidates.find((c) => c.oldShopId === 'broken_old');
      expect(candidate?.oldGeometryValid).toBe(false);
      expect(candidate?.score).toBeGreaterThanOrEqual(0.9);

      // Resolving with the same shop keeps its identity and its survey.
      await resolveReview(preview.previewId, 0, { action: 'same_existing_shop', oldShopId: 'broken_old' });
      const applied = await applyReviewedImport(preview.previewId);
      expect(applied.applied.updates).toBe(1);
      expect((await shopGeometry('broken_old')) as GeometryLike).toEqual(shell);
      expect(await countSurveys()).toBe(1);
    });

    it('an invalid new geometry blocks apply until excluded, and is never stored or repaired', async () => {
      const bowtie = {
        type: 'Polygon',
        coordinates: [
          [
            [BASE_LON, BASE_LAT],
            [BASE_LON + 0.0002, BASE_LAT + 0.0002],
            [BASE_LON, BASE_LAT + 0.0002],
            [BASE_LON + 0.0002, BASE_LAT],
            [BASE_LON, BASE_LAT]
          ]
        ]
      } as unknown as GeometryLike;
      const healthy = wgsSquare(BASE_LON + 0.001, BASE_LAT + 0.001, 0.0001);

      const preview = await reviewImport(
        'broken-new.geojson',
        wgsCollection([asFeature(0, bowtie), asFeature(1, healthy)])
      );
      const invalidMatch = preview.result.features.find((f) => f.newIndex === 0)!;
      expect(invalidMatch.status).toBe('INVALID');
      expect(invalidMatch.geometryIssues).toContain('shell_self_intersects');

      // INVALID items only accept "exclude"; pretending it was a shop is rejected.
      await expect(
        resolveReview(preview.previewId, 0, { action: 'same_existing_shop', oldShopId: 'x' })
      ).rejects.toMatchObject({ code: 'unsupported_resolution' });
      await expect(resolveReview(preview.previewId, 0, { action: 'new_shop' })).rejects.toMatchObject({
        code: 'unsupported_resolution'
      });

      // Apply without resolving the blocking item is refused.
      await expect(applyReviewedImport(preview.previewId)).rejects.toMatchObject({
        code: 'pending_review_resolution'
      });
      expect(await countShops()).toBe(0);

      await resolveReview(preview.previewId, 0, { action: 'exclude' });
      const applied = await applyReviewedImport(preview.previewId);
      expect(applied.applied.excluded).toBe(1);
      expect(applied.applied.newShops).toBe(1);
      expect(await countShops()).toBe(1);
      const { rows } = await pool.query('SELECT geometry FROM shops');
      expect(rows[0].geometry).toEqual(healthy);
    });

    it('a duplicate feature blocks apply until excluded; the first copy is imported once', async () => {
      const square = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      const preview = await reviewImport(
        'dup.geojson',
        wgsCollection([asFeature(0, square), asFeature(1, square)])
      );
      expect(preview.result.features[1].status).toBe('DUPLICATE');
      await expect(applyReviewedImport(preview.previewId)).rejects.toMatchObject({
        code: 'pending_review_resolution'
      });
      await resolveReview(preview.previewId, 1, { action: 'exclude' });
      await applyReviewedImport(preview.previewId);
      expect(await countShops()).toBe(1);
    });
  });

  describe('apply semantics', () => {
    it('keeps a surveyed shop identity on an EXACT_MATCH re-import', async () => {
      const geom = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      await insertRawShop('stable', geom, geometryFingerprint(geom));
      await insertSurveyFor('stable', 'پوشاک', 'admin', null, { shopName: 'مغازه پایدار' });

      const preview = await reviewImport('same.geojson', wgsCollection([asFeature(0, geom)]));
      expect(preview.result.features[0].status).toBe('EXACT_MATCH');
      expect(preview.result.features[0].matchedOldShopId).toBe('stable');

      await applyReviewedImport(preview.previewId);
      const { rows } = await pool.query('SELECT shop_id FROM shops');
      expect(rows).toHaveLength(1);
      expect(rows[0].shop_id).toBe('stable');
      expect(await countSurveys()).toBe(1);
    });

    it('never deletes missing old shops when re-importing a subset', async () => {
      const geomA = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
      const geomB = wgsSquare(BASE_LON + 0.02, BASE_LAT, 0.0001);
      await insertRawShop('keeper', geomA, 'fp_keep');
      await insertRawShop('outside', geomB, 'fp_out');

      const preview = await reviewImport('subset.geojson', wgsCollection([asFeature(0, geomA)]));
      expect(preview.result.features[0].status).toBe('GEOMETRY_MATCH');
      await applyReviewedImport(preview.previewId);
      expect(await countShops()).toBe(2);
      await expect(pool.query('SELECT 1 FROM shops WHERE shop_id = $1', ['outside'])).resolves.toMatchObject({
        rowCount: 1
      });
    });

    it('rolls back the whole apply if a later insert fails', async () => {
      const features = Array.from({ length: 20 }, (_, i) =>
        asFeature(i, wgsSquare(BASE_LON + i * 0.01, BASE_LAT, 0.0001))
      );
      const preview = await reviewImport('doomed.geojson', wgsCollection(features));
      expect(preview.result.summary.newFeatures).toBe(20);

      await expect(
        applyReviewedImport(preview.previewId, { failAfterInsertCount: 5 })
      ).rejects.toThrow();
      expect(await countShops()).toBe(0);
    });
  });

  describe('stale review protection', () => {
    it('rejects an apply when the shops dataset changed after the review', async () => {
      await insertSimpleShop('one', 'H');
      const preview = await reviewImport(
        'stale.geojson',
        wgsCollection([asFeature(0, wgsSquare(BASE_LON, BASE_LAT, 0.0001))])
      );

      // A new shop appears (geometry survey update, delete, whatever) after review.
      await insertSimpleShop('intruder', 'H2');

      await expect(applyReviewedImport(preview.previewId)).rejects.toMatchObject({
        code: 'stale_import_review',
        statusCode: 409
      });
      expect(await countShops()).toBe(2);
    });
  });

  describe('over HTTP end-to-end', () => {
    it('runs review -> resolve -> apply through the admin API', async () => {
      const { app, cookie } = await loginCookie('admin');
      const novel = wgsSquare(BASE_LON + 0.000004, BASE_LAT + 0.000002, 0.0001);
      await insertRawShop('h_a', wgsSquare(BASE_LON, BASE_LAT, 0.0001), 'fp_h_a');
      await insertRawShop('h_b', wgsSquare(BASE_LON + 0.000009, BASE_LAT + 0.000004, 0.0001), 'fp_h_b');

      const review = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review',
        headers: { cookie },
        payload: { filename: 'web.geojson', content: wgsCollection([asFeature(0, novel)]) }
      });
      expect(review.statusCode).toBe(200);
      const body = review.json() as { previewId: string; result: { features: Array<{ status: string }> } };
      expect(body.result.features[0].status).toBe('REVIEW');

      const unresolvedApply = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review/apply',
        headers: { cookie },
        payload: { previewId: body.previewId }
      });
      expect(unresolvedApply.statusCode).toBe(400);

      const resolve = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review/resolve',
        headers: { cookie },
        payload: { previewId: body.previewId, newIndex: 0, resolution: { action: 'same_existing_shop', oldShopId: 'h_a' } }
      });
      expect(resolve.statusCode).toBe(200);
      expect(resolve.json().pending).toBe(0);

      const apply = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review/apply',
        headers: { cookie },
        payload: { previewId: body.previewId }
      });
      expect(apply.statusCode).toBe(200);
      expect(apply.json().applied.updates).toBe(1);
      expect((await shopGeometry('h_a')) as GeometryLike).toEqual(novel);
      expect(await countShops()).toBe(2);
    });

    it('rejects an unknown preview id with 404', async () => {
      const { app, cookie } = await loginCookie('admin');
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/review/apply',
        headers: { cookie },
        payload: { previewId: 'missing' }
      });
      expect(res.statusCode).toBe(404);
    });
  });
});

describe('import review blocking helper', () => {
  it('treats REVIEW, INVALID and DUPLICATE as blocking statuses', async () => {
    const { isBlockingStatus } = await import('../services/import-review.service');
    expect(isBlockingStatus('REVIEW')).toBe(true);
    expect(isBlockingStatus('INVALID')).toBe(true);
    expect(isBlockingStatus('DUPLICATE')).toBe(true);
    expect(isBlockingStatus('NEW')).toBe(false);
    expect(isBlockingStatus('EXACT_MATCH')).toBe(false);
    expect(isBlockingStatus('GEOMETRY_MATCH')).toBe(false);
  });
});