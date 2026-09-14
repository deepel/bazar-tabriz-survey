import { beforeEach, expect, it } from 'vitest';
import { pool } from '../db';
import { dbDescribe, insertSimpleShop, loginCookie, resetDb } from './helpers';

dbDescribe('survey submission', () => {
  beforeEach(async () => await resetDb());

  async function shopCount(shopId: string): Promise<number> {
    const res = await pool.query('SELECT COUNT(*)::int AS n FROM surveys WHERE shop_id = $1', [shopId]);
    return res.rows[0].n;
  }

  it('creates a survey for a known shop', async () => {
    await insertSimpleShop('shop_A');
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: {
        shop_id: 'shop_A',
        shop_name: 'مغازه نمونه',
        activity: 'پوشاک',
        building_condition: 'سالم',
        survey_lat: 38.070123,
        survey_lon: 46.290456
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().created).toBe(true);
    expect(res.json().survey.shop_id).toBe('shop_A');
    expect(res.json().survey.survey_lat).toBeCloseTo(38.070123, 6);
    expect(res.json().survey.surveyor_id).toBeGreaterThan(0);
    expect(await shopCount('shop_A')).toBe(1);
  });

  it('upserts instead of duplicating on re-submission', async () => {
    await insertSimpleShop('shop_B');
    const { app, cookie } = await loginCookie('surveyor');
    const first = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'shop_B', activity: 'کفش', building_condition: 'سالم' }
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: {
        shop_id: 'shop_B',
        activity: 'فرش',
        activity_other: null,
        building_condition: 'مرمت شده'
      }
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().created).toBe(false);
    expect(second.json().survey.activity).toBe('فرش');
    expect(await shopCount('shop_B')).toBe(1);
  });

  it('rejects an unknown shop', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'missing', activity: 'پوشاک', building_condition: 'سالم' }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('shop_not_found');
  });

  it('rejects an invalid activity', async () => {
    await insertSimpleShop('shop_C');
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'shop_C', activity: 'پیتزا', building_condition: 'سالم' }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_activity');
  });

  it('requires an activity_other for the «سایر» option', async () => {
    await insertSimpleShop('shop_D');
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'shop_D', activity: 'سایر', building_condition: 'سالم' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('TEST E - saves a survey with no GPS at all (GPS never required)', async () => {
    await insertSimpleShop('shop_E');
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'shop_E', shop_name: 'بدون جی‌پی‌اس', activity: 'پوشاک', building_condition: 'سالم' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().survey.survey_lat).toBeNull();
    expect(res.json().survey.survey_lon).toBeNull();
  });

  it('TEST F - out-of-range GPS values are stored as optional metadata, not rejected', async () => {
    await insertSimpleShop('shop_F');
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: {
        shop_id: 'shop_F',
        activity: 'پوشاک',
        building_condition: 'سالم',
        survey_lat: 99,
        survey_lon: -999
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().survey.survey_lat).toBe(99);
  });

  it('requires authentication', async () => {
    await insertSimpleShop('shop_F');
    const app = await (await import('./helpers')).getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      payload: { shop_id: 'shop_F', activity: 'پوشاک', building_condition: 'سالم' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('lists surveys with surveyor usernames', async () => {
    await insertSimpleShop('shop_G');
    const { app, cookie } = await loginCookie('surveyor');
    await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'shop_G', activity: 'پوشاک', building_condition: 'سالم' }
    });
    const res = await app.inject({ method: 'GET', url: '/api/surveys', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const list = res.json().surveys as Array<{ shop_id: string; surveyor_username: string }>;
    expect(list[0].shop_id).toBe('shop_G');
    expect(list[0].surveyor_username).toBe('jafari');
  });
});