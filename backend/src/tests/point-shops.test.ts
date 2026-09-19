import ExcelJS from 'exceljs';
import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, insertSimpleShop, loginCookie, resetDb } from './helpers';

async function loadWorkbook(payload: unknown): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(payload as never);
  return workbook;
}

const pointPayload = {
  longitude: 46.2911,
  latitude: 38.0738,
  shop_name: 'رستوران زیرزمین',
  activity: 'مواد غذایی',
  building_condition: 'سالم',
  floor: 'basement',
  instagram_status: 'has',
  phone: '+989121234567',
  notes: 'ورودی از راهروی شمالی'
};

dbDescribe('supplementary point shops', () => {
  beforeEach(async () => resetDb());

  it('creates a stable point record, preserves coordinates/phone, updates and deletes it', async () => {
    const { app, cookie, userId } = await loginCookie('surveyor');
    const created = await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: pointPayload });
    expect(created.statusCode).toBe(201);
    const point = created.json().pointShop;
    expect(point.point_shop_id).toMatch(/^point-/);
    expect(point.created_by).toBe(userId);
    expect(point.geometry).toEqual({ type: 'Point', coordinates: [pointPayload.longitude, pointPayload.latitude] });
    expect(point.phone).toBe(pointPayload.phone);

    const id = point.point_shop_id as string;
    const read = await app.inject({ method: 'GET', url: `/api/point-shops/${id}`, headers: { cookie } });
    expect(read.statusCode).toBe(200);
    expect(read.json().pointShop.point_shop_id).toBe(id);
    const updated = await app.inject({ method: 'PATCH', url: `/api/point-shops/${id}`, headers: { cookie }, payload: { floor: 'floor_2', phone: '021-123' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().pointShop.floor).toBe('floor_2');
    expect(updated.json().pointShop.point_shop_id).toBe(id);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/point-shops/${id}`, headers: { cookie } });
    expect(deleted.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/point-shops/${id}`, headers: { cookie } })).statusCode).toBe(404);
  });

  it('supports all controlled floors and Instagram states and rejects invalid values', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    for (const [index, floor] of ['ground_floor', 'basement', 'floor_1', 'floor_2'].entries()) {
      const response = await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: { ...pointPayload, longitude: 46.29 + index / 10000, floor, instagram_status: ['has', 'does_not_have', 'not_checked'][index % 3] } });
      expect(response.statusCode).toBe(201);
    }
    const invalidFloor = await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: { ...pointPayload, floor: 'floor_3' } });
    expect(invalidFloor.statusCode).toBe(400);
    expect(invalidFloor.json().error).toBe('invalid_floor');
    const invalidInstagram = await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: { ...pointPayload, instagram_status: 'url' } });
    expect(invalidInstagram.statusCode).toBe(400);
    expect(invalidInstagram.json().error).toBe('invalid_instagram_status');
  });

  it('keeps point records separate from polygon totals, assignments and polygon export', async () => {
    await insertSimpleShop('polygon-only');
    const { app, cookie } = await loginCookie('surveyor');
    const created = await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: pointPayload });
    const pointId = created.json().pointShop.point_shop_id as string;
    const stats = await app.inject({ method: 'GET', url: '/api/stats', headers: { cookie } });
    expect(stats.json()).toEqual({ total: 1, surveyed: 0, unsurveyed: 1, progress: 0 });
    const preview = await app.inject({ method: 'POST', url: '/api/assignments/preview', headers: { cookie }, payload: { requested_count: 10, member_ids: [2] } });
    expect([200, 201]).toContain(preview.statusCode);
    expect(preview.json().shops.features.every((feature: { properties: { shop_id: string } }) => feature.properties.shop_id !== pointId)).toBe(true);
    const polygonExport = await app.inject({ method: 'GET', url: '/api/admin/geojson/export', headers: { cookie: (await loginCookie('admin')).cookie } });
    expect(polygonExport.json().features).toHaveLength(1);
    expect(polygonExport.json().features[0].properties.point_shop_id).toBeUndefined();
  });

  it('lists both record types with filters and exports combined Excel plus point GeoJSON', async () => {
    await insertSimpleShop('polygon-record');
    const { app, cookie } = await loginCookie('surveyor');
    await app.inject({ method: 'POST', url: '/api/point-shops', headers: { cookie }, payload: pointPayload });
    const admin = await loginCookie('admin');
    const all = await app.inject({ method: 'GET', url: '/api/admin/shops', headers: { cookie: admin.cookie } });
    expect(all.json().total).toBe(2);
    expect(all.json().rows.map((row: { record_type: string }) => row.record_type).sort()).toEqual(['shops', 'shops-point']);
    const filtered = await app.inject({ method: 'GET', url: '/api/admin/shops?record_type=shops-point&floor=basement&instagram_status=has', headers: { cookie: admin.cookie } });
    expect(filtered.json().total).toBe(1);
    expect(filtered.json().rows[0].shop_id).toMatch(/^point-/);
    const excel = await app.inject({ method: 'GET', url: '/api/admin/shops/export', headers: { cookie: admin.cookie } });
    const workbook = await loadWorkbook(excel.rawPayload);
    expect(workbook.worksheets[0].rowCount).toBe(3);
    expect(workbook.worksheets[0].getRow(1).getCell(9).value).toBe('نوع رکورد');
    const pointExport = await app.inject({ method: 'GET', url: '/api/admin/point-shops/export', headers: { cookie: admin.cookie } });
    const geojson = pointExport.json();
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].geometry).toEqual({ type: 'Point', coordinates: [pointPayload.longitude, pointPayload.latitude] });
    expect(geojson.features[0].properties.point_shop_id).toMatch(/^point-/);
  });

  it('persists the shared floor, Instagram and phone fields on polygon surveys', async () => {
    await insertSimpleShop('shared-fields');
    const { app, cookie } = await loginCookie('surveyor');
    const saved = await app.inject({ method: 'POST', url: '/api/surveys', headers: { cookie }, payload: { shop_id: 'shared-fields', activity: 'فرش', building_condition: 'سالم', floor: 'floor_1', instagram_status: 'does_not_have', phone: '0999' } });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().survey.floor).toBe('floor_1');
    const detail = await app.inject({ method: 'GET', url: '/api/shops/shared-fields', headers: { cookie } });
    expect(detail.json().survey.instagram_status).toBe('does_not_have');
    expect(detail.json().survey.phone).toBe('0999');
  });
});
