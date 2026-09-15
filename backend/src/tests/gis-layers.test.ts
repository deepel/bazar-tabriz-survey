import { beforeEach, expect, it } from 'vitest';
import { pool } from '../db';
import {
  countShops,
  countSurveys,
  dbDescribe,
  insertSimpleShop,
  insertSurveyFor,
  loginCookie
} from './helpers';

const SEED_URLS = {
  bazarArea:
    'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/bazar%20arse%20zone%20.geojson',
  buildings: 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/buldings.geojson',
  lines: 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/lines.geojson',
  ways: 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/ways.geojson'
};

/** Restores the seeded `gis_layers` rows (several tests mutate them). */
async function resetGisLayers(): Promise<void> {
  await pool.query(`
    DELETE FROM gis_layers;
    INSERT INTO gis_layers (layer_key, display_name, enabled, source_url, order_index)
    VALUES
      ('bazar-area', 'محدوده بازار', TRUE, '${SEED_URLS.bazarArea}', 0),
      ('buildings', 'ساختمان‌ها', TRUE, '${SEED_URLS.buildings}', 10),
      ('lines', 'خطوط', TRUE, '${SEED_URLS.lines}', 20),
      ('ways', 'راه‌ها', TRUE, '${SEED_URLS.ways}', 30);
  `);
}

dbDescribe('GIS reference layers', () => {
  beforeEach(async () => {
    await resetGisLayers();
  });

  it('blocks anonymous access to the layer list (401)', async () => {
    const { getApp } = await import('./helpers');
    const built = await getApp();
    const res = await built.inject({ method: 'GET', url: '/api/gis-layers' });
    expect(res.statusCode).toBe(401);
  });

  it('serves the 4 seeded layers to any authenticated user, in order', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.layers).toHaveLength(4);
    expect(body.layers.map((l: { layer_key: string }) => l.layer_key)).toEqual([
      'bazar-area',
      'buildings',
      'lines',
      'ways'
    ]);
    const lines = body.layers.find((l: { layer_key: string }) => l.layer_key === 'lines');
    expect(lines.display_name).toBe('خطوط');
    expect(lines.enabled).toBe(true);
    expect(lines.source_url).toBe(SEED_URLS.lines);
    expect(lines.cache_version).toBe(1);
  });

  it('allows admins to list the layers too', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().layers).toHaveLength(4);
  });

  it('blocks surveyors from updating layers (403)', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: { display_name: 'خطوط ویرایش شده' },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(403);
  });

  it('blocks surveyors from refreshing layers (403)', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/gis-layers/lines/refresh',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(403);
  });

  it('lets an admin rename a layer (display_name persisted)', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/ways',
      payload: { display_name: 'مسیرهای بازار' },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().display_name).toBe('مسیرهای بازار');

    const list = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    const ways = list.json().layers.find((l: { layer_key: string }) => l.layer_key === 'ways');
    expect(ways.display_name).toBe('مسیرهای بازار');
  });

  it('lets an admin enable/disable a layer', async () => {
    const { app, cookie } = await loginCookie('admin');
    const off = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/buildings',
      payload: { enabled: false },
      headers: { cookie }
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().enabled).toBe(false);

    const on = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/buildings',
      payload: { enabled: true },
      headers: { cookie }
    });
    expect(on.json().enabled).toBe(true);
  });

  it('lets an admin change the source URL (persisted)', async () => {
    const { app, cookie } = await loginCookie('admin');
    const newUrl = 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/bazar%20tabriz/ways.geojson';
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/bazar-area',
      payload: { source_url: newUrl },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().source_url).toBe(newUrl);

    const list = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    const area = list.json().layers.find((l: { layer_key: string }) => l.layer_key === 'bazar-area');
    expect(area.source_url).toBe(newUrl);
  });

  it('rejects an invalid source URL (400)', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: { source_url: 'not-a-url' },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_source_url');
  });

  it('rejects an empty display name (400)', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: { display_name: '   ' },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_display_name');
  });

  it('rejects an empty update body (400)', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: {},
      headers: { cookie }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('empty_update');
  });

  it('returns 404 for an unknown layer on update', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/nope',
      payload: { display_name: 'x' },
      headers: { cookie }
    });
    expect(res.statusCode).toBe(404);
  });

  it('bumps cache_version on admin refresh', async () => {
    const { app, cookie } = await loginCookie('admin');
    const before = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    const linesBefore = before.json().layers.find((l: { layer_key: string }) => l.layer_key === 'lines');
    expect(linesBefore.cache_version).toBe(1);

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/gis-layers/lines/refresh',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cache_version).toBe(2);

    const after = await app.inject({ method: 'GET', url: '/api/gis-layers', headers: { cookie } });
    const linesAfter = after.json().layers.find((l: { layer_key: string }) => l.layer_key === 'lines');
    expect(linesAfter.cache_version).toBe(2);
  });

  it('returns 404 for an unknown layer on refresh', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/gis-layers/nope/refresh',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(404);
  });

  it('never touches shops or surveys while managing layers', async () => {
    await insertSimpleShop('g1');
    await insertSurveyFor('g1', 'پوشاک', 'jafari');
    const shopsBefore = await countShops();
    const surveysBefore = await countSurveys();

    const { app, cookie } = await loginCookie('admin');
    await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: { display_name: 'خطوط', enabled: false },
      headers: { cookie }
    });
    await app.inject({
      method: 'POST',
      url: '/api/admin/gis-layers/lines/refresh',
      headers: { cookie }
    });
    await app.inject({
      method: 'PATCH',
      url: '/api/admin/gis-layers/lines',
      payload: { source_url: SEED_URLS.lines },
      headers: { cookie }
    });

    expect(await countShops()).toBe(shopsBefore);
    expect(await countSurveys()).toBe(surveysBefore);

    // The survey is still intact.
    const survey = await pool.query('SELECT activity FROM surveys WHERE shop_id = $1', ['g1']);
    expect(survey.rows[0].activity).toBe('پوشاک');
  });
});