import ExcelJS from 'exceljs';
import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, extractCookie, insertSimpleShop, loginCookie, resetDb } from './helpers';

dbDescribe('door points', () => {
  beforeEach(async () => await resetDb());

  it('creates, reads, updates and deletes a door with validated times', async () => {
    const owner = await loginCookie('surveyor');
    const created = await owner.app.inject({
      method: 'POST', url: '/api/door-points', headers: { cookie: owner.cookie },
      payload: { longitude: 46.29, latitude: 38.07, name: 'درب تیمچه بزرگ', opening_time: '08:00', closing_time: '20:00', notes: 'ورودی اصلی' }
    });
    expect(created.statusCode).toBe(201);
    const point = created.json().doorPoint;
    expect(point.door_point_id).toMatch(/^door-/);
    expect(point.geometry).toEqual({ type: 'Point', coordinates: [46.29, 38.07] });
    expect(point.opening_time).toBe('08:00');
    expect(point.closing_time).toBe('20:00');

    const read = await owner.app.inject({ method: 'GET', url: `/api/door-points/${point.door_point_id}`, headers: { cookie: owner.cookie } });
    expect(read.statusCode).toBe(200);
    expect(read.json().doorPoint.name).toBe('درب تیمچه بزرگ');

    for (const payload of [
      { name: '', opening_time: '08:00', closing_time: '20:00' },
      { name: 'در نامعتبر', opening_time: '8:00', closing_time: '20:00' },
      { name: 'در نامعتبر', opening_time: '08:00', closing_time: '25:00' }
    ]) {
      const invalid = await owner.app.inject({ method: 'POST', url: '/api/door-points', headers: { cookie: owner.cookie }, payload: { longitude: 46.29, latitude: 38.07, ...payload } });
      expect(invalid.statusCode).toBe(400);
    }

    const otherLogin = await owner.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'moradi', password: 'moradi123' } });
    const forbidden = await owner.app.inject({ method: 'PATCH', url: `/api/door-points/${point.door_point_id}`, headers: { cookie: extractCookie(otherLogin) }, payload: { name: 'تغییر غیرمجاز' } });
    expect(forbidden.statusCode).toBe(403);

    const updated = await owner.app.inject({ method: 'PATCH', url: `/api/door-points/${point.door_point_id}`, headers: { cookie: owner.cookie }, payload: { name: 'درب ویرایش‌شده', opening_time: '09:15' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().doorPoint.name).toBe('درب ویرایش‌شده');
    expect(updated.json().doorPoint.opening_time).toBe('09:15');

    const removed = await owner.app.inject({ method: 'DELETE', url: `/api/door-points/${point.door_point_id}`, headers: { cookie: owner.cookie } });
    expect(removed.statusCode).toBe(204);
  });

  it('loads by bbox and exports doors separately without affecting polygon behavior', async () => {
    await insertSimpleShop('door-isolation-shop');
    const surveyor = await loginCookie('surveyor');
    await surveyor.app.inject({
      method: 'POST', url: '/api/door-points', headers: { cookie: surveyor.cookie },
      payload: { longitude: 46.29, latitude: 38.07, name: 'درب شمالی', opening_time: '07:30', closing_time: '21:00' }
    });
    const points = await surveyor.app.inject({ method: 'GET', url: '/api/door-points?bbox=46.28,38.06,46.30,38.08', headers: { cookie: surveyor.cookie } });
    expect(points.statusCode).toBe(200);
    expect(points.json().features[0].geometry.coordinates).toEqual([46.29, 38.07]);

    const admin = await loginCookie('admin');
    const stats = await admin.app.inject({ method: 'GET', url: '/api/stats', headers: { cookie: admin.cookie } });
    expect(stats.json().total).toBe(1);
    const table = await admin.app.inject({ method: 'GET', url: '/api/admin/shops?record_type=doors&opening_time=07:30', headers: { cookie: admin.cookie } });
    expect(table.statusCode).toBe(200);
    expect(table.json().total).toBe(1);
    expect(table.json().rows[0].record_type).toBe('doors');

    const geojson = await admin.app.inject({ method: 'GET', url: '/api/admin/door-points/export', headers: { cookie: admin.cookie } });
    expect(geojson.statusCode).toBe(200);
    expect(geojson.json().features[0].properties.closing_time).toBe('21:00');

    const excel = await admin.app.inject({ method: 'GET', url: '/api/admin/shops/export?record_type=doors', headers: { cookie: admin.cookie } });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.rawPayload as never);
    const row = workbook.worksheets[0].getRow(2);
    expect(row.getCell(9).value).toBe('در');
    expect(row.getCell(14).value).toBe('07:30');
    expect(row.getCell(15).value).toBe('21:00');
  });
});
