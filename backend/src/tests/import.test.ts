import { beforeEach, describe, expect, it } from 'vitest';
import { applyImport, previewImport } from '../services/import.service';
import { analyzeGeoJsonContent } from '../services/geojson.service';
import { geometryFingerprint, toWgs84Geometry } from '../utils/geo';
import {
  countShops,
  countSurveys,
  dbDescribe,
  featureCollection,
  loginCookie,
  resetDb,
  seedShopsBulk,
  utmSquareFeature
} from './helpers';

dbDescribe('GeoJSON import', () => {
  beforeEach(async () => await resetDb());

  describe('validation', () => {
    it('rejects malformed JSON', async () => {
      await expect(previewImport('broken.geojson', 'not json')).rejects.toMatchObject({
        code: 'invalid_geojson'
      });
    });

    it('rejects a non-FeatureCollection payload', async () => {
      await expect(
        previewImport('point.geojson', JSON.stringify({ type: 'Feature', properties: {}, geometry: {} }))
      ).rejects.toMatchObject({ code: 'invalid_geojson' });
    });

    it('rejects a non-FeatureCollection payload (invalid_geojson)', async () => {
      await expect(
        previewImport('arr.geojson', JSON.stringify([1, 2, 3]))
      ).rejects.toMatchObject({ code: 'invalid_geojson' });
    });

    it('counts invalid features and duplicate fingerprints', async () => {
      const ok = utmSquareFeature(0);
      const okCopy = utmSquareFeature(0); // identical geometry -> duplicate fingerprint
      const notFeature = { type: 'Bogus', foo: 1 };
      const badGeometry = {
        type: 'Feature',
        properties: { EntityHandle: 'BAD' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
      };
      const preview = await previewImport(
        'mixed.geojson',
        JSON.stringify(featureCollection([ok, okCopy, notFeature, badGeometry]))
      );
      expect(preview.stats.totalFeatures).toBe(4);
      expect(preview.stats.invalidFeatures).toBe(3); // duplicate, non-feature, bad geometry
      expect(preview.stats.duplicateIds).toBe(1);
      expect(preview.stats.invalidGeometries).toBe(2);
      expect(preview.errors.length).toBe(3);
    });

    it('refuses to apply a file with invalid features', async () => {
      const preview = await previewImport(
        'bad.geojson',
        JSON.stringify(featureCollection([utmSquareFeature(0), { type: 'Bogus' }]))
      );
      await expect(applyImport(preview.previewId)).rejects.toMatchObject({ code: 'invalid_feature' });
      expect(await countShops()).toBe(0);
    });

    it('accepts an empty FeatureCollection', async () => {
      const preview = await previewImport(
        'empty.geojson',
        JSON.stringify(featureCollection([]))
      );
      expect(preview.stats.totalFeatures).toBe(0);
      const applied = await applyImport(preview.previewId);
      expect(applied.stats.newShops).toBe(0);
    });
  });

  describe('preview/apply over HTTP', () => {
    it('previews then applies a small import', async () => {
      const { app, cookie } = await loginCookie('admin');
      const body = JSON.stringify(featureCollection([utmSquareFeature(0), utmSquareFeature(1)]));
      const preview = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/preview',
        headers: { cookie },
        payload: { filename: 'two-shops.geojson', content: body }
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().stats.newShops).toBe(2);

      const apply = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/apply',
        headers: { cookie },
        payload: { previewId: preview.json().previewId }
      });
      expect(apply.statusCode).toBe(200);
      expect(apply.json().ok).toBe(true);
      expect(await countShops()).toBe(2);
    });

    it('blocks non-admins from the import endpoints', async () => {
      const { app, cookie } = await loginCookie('surveyor');
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/preview',
        headers: { cookie },
        payload: { filename: 'x.geojson', content: 'x' }
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects an expired/missing preview id', async () => {
      const { app, cookie } = await loginCookie('admin');
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/geojson/import/apply',
        headers: { cookie },
        payload: { previewId: 'does-not-exist' }
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('TEST A - partial source grows to 2000 -> 2300 (1500 surveys preserved)', () => {
    it('adds 300 new shops without touching existing surveys', async () => {
      await seedShopsBulk(2000, 1500);
      expect(await countShops()).toBe(2000);
      expect(await countSurveys()).toBe(1500);

      const features = Array.from({ length: 300 }, (_, i) => utmSquareFeature(i + 4000));
      const preview = await previewImport(
        'partial.geojson',
        JSON.stringify(featureCollection(features))
      );
      expect(preview.stats.newShops).toBe(300);
      expect(preview.stats.existingShops).toBe(0);

      const applied = await applyImport(preview.previewId);
      expect(applied.stats.newShops).toBe(300);
      expect(await countShops()).toBe(2300);
      expect(await countSurveys()).toBe(1500);
    });
  });

  describe('TEST B - geometry change keeps the shop identity and its survey', () => {
    it('matches by EntityHandle within 15m and preserves survey data', async () => {
      const first = await previewImport(
        'base.geojson',
        JSON.stringify(featureCollection([utmSquareFeature(7)]))
      );
      await applyImport(first.previewId);
      expect(await countShops()).toBe(1);

      const { pool } = await import('../db');
      const { rows } = await pool.query('SELECT shop_id FROM shops');
      const originalId = rows[0].shop_id;

      // Attach a survey to the imported shop.
      const surveyor = await loginCookie('surveyor');
      const saved = await surveyor.app.inject({
        method: 'POST',
        url: '/api/surveys',
        headers: { cookie: surveyor.cookie },
        payload: { shop_id: originalId, activity: 'فرش', building_condition: 'سالم' }
      });
      expect(saved.statusCode).toBe(201);

      // Re-import the same handle shifted 6 m east (within the 15 m match window).
      const moved = await previewImport(
        'moved.geojson',
        JSON.stringify(featureCollection([utmSquareFeature(7, { dx: 6 })]))
      );
      expect(moved.stats.existingShops).toBe(1);
      expect(moved.stats.geometryChanges).toBe(1);
      expect(moved.stats.newShops).toBe(0);

      await applyImport(moved.previewId);
      expect(await countShops()).toBe(1);
      expect(await countSurveys()).toBe(1);

      const after = await pool.query(
        'SELECT shop_id, geom_fingerprint FROM shops WHERE shop_id = $1',
        [originalId]
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0].geom_fingerprint).not.toBe(
        geometryFingerprint(toWgs84Geometry(utmSquareFeature(7).geometry as never, 32638))
      );
    });
  });

  describe('TEST C - subset import never deletes shops', () => {
    it('re-imports 50 of 100 without any deletion', async () => {
      const features = Array.from({ length: 100 }, (_, i) => utmSquareFeature(i + 1000));
      const preview = await previewImport('full.geojson', JSON.stringify(featureCollection(features)));
      await applyImport(preview.previewId);
      expect(await countShops()).toBe(100);

      const subset = await previewImport(
        'subset.geojson',
        JSON.stringify(featureCollection(features.slice(0, 50)))
      );
      expect(subset.stats.existingShops).toBe(50);
      expect(subset.stats.newShops).toBe(0);

      await applyImport(subset.previewId);
      expect(await countShops()).toBe(100);
    });
  });

  describe('TEST D - failed transaction rolls back the whole import', () => {
    it('throws after the injected failure point and leaves no partial data', async () => {
      const features = Array.from({ length: 20 }, (_, i) => utmSquareFeature(i + 5000));
      const preview = await previewImport(
        'doomed.geojson',
        JSON.stringify(featureCollection(features))
      );
      expect(preview.stats.newShops).toBe(20);

      await expect(applyImport(preview.previewId, { failAfterInsertCount: 5 })).rejects.toThrow();
      expect(await countShops()).toBe(0);

      // No shop created from the doomed batch (fingerprints of later features).
      const batch = analyzeGeoJsonContent(JSON.stringify(featureCollection(features)), 32638);
      const ids = batch.map((f) => f.shopId);
      const { pool } = await import('../db');
      const found = await pool.query('SELECT shop_id FROM shops WHERE geom_fingerprint = ANY($1)', [ids]);
      expect(found.rowCount).toBe(0);
    });
  });

  describe('crs handling', () => {
    it('stores WGS84 (EPSG:4326) coordinates on import', async () => {
      const feature = utmSquareFeature(2);
      const preview = await previewImport(
        'utm.geojson',
        JSON.stringify(featureCollection([feature]))
      );
      await applyImport(preview.previewId);
      const { pool } = await import('../db');
      const { rows } = await pool.query('SELECT geometry, centroid_lon, centroid_lat FROM shops');
      const geometry = rows[0].geometry;
      expect(geometry.type).toBe('Polygon');
      const ring = geometry.coordinates[0] as number[][];
      for (const [lon, lat] of ring) {
        expect(lon).toBeGreaterThan(46.2);
        expect(lon).toBeLessThan(46.4);
        expect(lat).toBeGreaterThan(38.0);
        expect(lat).toBeLessThan(38.2);
      }
      expect(rows[0].centroid_lon).toBeGreaterThan(46.2);
      expect(rows[0].centroid_lat).toBeGreaterThan(38.0);
    });
  });
});