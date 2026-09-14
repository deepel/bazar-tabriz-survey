import { describe } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { QueryResult } from 'pg';
import { buildApp } from '../app';
import { pool } from '../db';

export const DATABASE_AVAILABLE = process.env.SURVEY_TEST_DB_AVAILABLE !== '0';
export const dbDescribe = DATABASE_AVAILABLE ? describe : describe.skip;

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) app = await buildApp();
  return app;
}

export function extractCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const header = Array.isArray(raw) ? raw[0] : String(raw ?? '');
  return header.split(';')[0];
}

export async function loginCookie(
  role: 'admin' | 'surveyor'
): Promise<{ app: FastifyInstance; cookie: string; userId: number }> {
  const app = await getApp();
  const creds =
    role === 'admin'
      ? { username: 'admin', password: 'admin123' }
      : { username: 'jafari', password: 'jafari123' };
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: creds
  });
  const cookie = extractCookie(res);
  const body = res.json() as { user?: { id: number } };
  return { app, cookie, userId: body.user?.id ?? 0 };
}

export function resetDb(): Promise<QueryResult> {
  return pool.query(
    `TRUNCATE shops, surveys, app_meta RESTART IDENTITY CASCADE;
     DELETE FROM users WHERE username NOT IN ('admin', 'jafari', 'moradi', 'kamali');`
  );
}

/** Inserts one shop row directly (WGS84 geometry near the bazaar). */
export async function insertSimpleShop(
  shopId: string,
  entityHandle: string | null = null
): Promise<void> {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [46.29, 38.07],
        [46.2900015, 38.07],
        [46.2900015, 38.0700015],
        [46.29, 38.0700015],
        [46.29, 38.07]
      ]
    ]
  };
  await pool.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      shopId,
      JSON.stringify(geometry),
      'fp_' + shopId,
      entityHandle,
      38.07,
      46.29,
      46.29,
      38.07,
      46.2900015,
      38.0700015,
      {},
      'test'
    ]
  );
}

export async function countShops(): Promise<number> {
  const res = await pool.query('SELECT COUNT(*)::int AS n FROM shops');
  return res.rows[0].n;
}

export async function countSurveys(): Promise<number> {
  const res = await pool.query('SELECT COUNT(*)::int AS n FROM surveys');
  return res.rows[0].n;
}

// ---------------------------------------------------------------------------
// GeoJSON fixtures (source files are AutoCAD exports in EPSG:32638).
// ---------------------------------------------------------------------------

export const UTM_BASE_X = 613500;
export const UTM_BASE_Y = 4215500;

export interface UtmSquareOptions {
  dx?: number;
  dy?: number;
  size?: number;
  cols?: number;
  handlePrefix?: string;
}

export function utmSquareFeature(i: number, options: UtmSquareOptions = {}): Record<string, unknown> {
  const size = options.size ?? 5;
  const cols = options.cols ?? 12;
  const x = UTM_BASE_X + (i % cols) * 9 + (options.dx ?? 0);
  const y = UTM_BASE_Y + Math.floor(i / cols) * 9 + (options.dy ?? 0);
  const ring = [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y]
  ];
  return {
    type: 'Feature',
    properties: {
      Layer: 'shops',
      EntityHandle: `${options.handlePrefix ?? 'EH_'}${i}`,
      Text: 'SOLID'
    },
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
}

export function featureCollection(features: unknown[]): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    name: 'test-import',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32638' } },
    features
  };
}

/** Seeds `n` shops plus `surveyed` surveys directly via SQL (fast bulk setup). */
export async function seedShopsBulk(n: number, surveyed: number): Promise<void> {
  await pool.query(
    `INSERT INTO shops
       (shop_id, geometry, geom_fingerprint, entity_handle, centroid_lat, centroid_lon,
        min_lon, min_lat, max_lon, max_lat, original_properties, source_file)
     SELECT
       'seed_' || i,
       jsonb_build_object(
         'type','Polygon',
         'coordinates', jsonb_build_array(jsonb_build_array(
           jsonb_build_array(46.25 + (i % 100) * 0.00005, 38.05 + (i / 100) * 0.00005),
           jsonb_build_array(46.2500015 + (i % 100) * 0.00005, 38.05 + (i / 100) * 0.00005),
           jsonb_build_array(46.2500015 + (i % 100) * 0.00005, 38.0500015 + (i / 100) * 0.00005),
           jsonb_build_array(46.25 + (i % 100) * 0.00005, 38.0500015 + (i / 100) * 0.00005),
           jsonb_build_array(46.25 + (i % 100) * 0.00005, 38.05 + (i / 100) * 0.00005)
         ))
       ),
       'seed_fp_' || i,
       'EH_seed' || i,
       38.05 + (i / 100) * 0.00005 + 0.00000075,
       46.25 + (i % 100) * 0.00005 + 0.00000075,
       46.25 + (i % 100) * 0.00005,
       38.05 + (i / 100) * 0.00005,
       46.2500015 + (i % 100) * 0.00005,
       38.0500015 + (i / 100) * 0.00005,
       '{}',
       'bulk-seed'
     FROM generate_series(1, $1::int) i
     ON CONFLICT (shop_id) DO NOTHING`,
    [n]
  );

  if (surveyed > 0) {
    await pool.query(
      `INSERT INTO surveys
         (shop_id, shop_name, activity, activity_other, building_condition, surveyor_id, surveyed_at)
       SELECT shop_id, 'مغازه ' || shop_id, 'پوشاک', NULL, 'سالم',
              (SELECT id FROM users WHERE username = 'admin'), now()
       FROM shops WHERE shop_id LIKE 'seed_%' ORDER BY shop_id LIMIT $1`,
      [surveyed]
    );
  }
}