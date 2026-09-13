import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, loginCookie, resetDb, seedShopsBulk } from './helpers';

dbDescribe('stats', () => {
  beforeEach(async () => await resetDb());

  it('reports totals, surveyed and progress', async () => {
    await seedShopsBulk(200, 40);
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({ method: 'GET', url: '/api/stats', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      total: 200,
      surveyed: 40,
      unsurveyed: 160,
      progress: 20
    });
  });

  it('exposes option lists and the GPS warning distance', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({ method: 'GET', url: '/api/options', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.activities).toContain('پوشاک');
    expect(body.buildingConditions).toContain('سالم');
    expect(body.gpsWarningDistanceMeters).toBe(30);
  });
});