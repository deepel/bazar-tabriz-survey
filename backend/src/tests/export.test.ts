import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, insertSimpleShop, loginCookie, resetDb } from './helpers';

dbDescribe('GeoJSON export', () => {
  beforeEach(async () => await resetDb());

  async function surveyShop(shopId: string): Promise<void> {
    const { app, cookie } = await loginCookie('surveyor');
    await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: shopId, activity: 'فرش', building_condition: 'مرمت شده' }
    });
  }

  it('builds a WGS84 FeatureCollection with merged survey properties', async () => {
    await insertSimpleShop('exp_A');
    await insertSimpleShop('exp_B');
    await surveyShop('exp_A');

    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/geojson/export',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/geo+json');

    const gj = res.json() as {
      type: string;
      crs: { properties: { name: string } };
      features: Array<{ properties: Record<string, unknown>; geometry: { coordinates: unknown } }>;
    };
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::4326');
    expect(gj.features).toHaveLength(2);

    const byId = new Map(gj.features.map((f) => [f.properties.shop_id as string, f]));
    expect(byId.get('exp_A')!.properties.surveyed).toBe(true);
    expect(byId.get('exp_A')!.properties.activity).toBe('فرش');
    expect(byId.get('exp_A')!.properties.building_condition).toBe('مرمت شده');
    expect(byId.get('exp_A')!.properties.surveyed_at).toBeTruthy();

    const geom = byId.get('exp_A')!.geometry.coordinates as number[][][];
    for (const [lon, lat] of geom[0].slice(0, 2)) {
      expect(lon).toBeGreaterThan(46);
      expect(lon).toBeLessThan(47);
      expect(lat).toBeGreaterThan(38);
      expect(lat).toBeLessThan(39);
    }
  });

  it('marks shops without a survey as unsurveyed and sets download headers', async () => {
    await insertSimpleShop('exp_C');
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/geojson/export?download=1',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.json().features[0].properties.surveyed).toBe(false);
  });
});