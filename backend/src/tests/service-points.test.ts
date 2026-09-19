import ExcelJS from 'exceljs';
import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, extractCookie, insertSimpleShop, loginCookie, resetDb, userIdByUsername } from './helpers';

dbDescribe('service points', () => {
  beforeEach(async () => await resetDb());

  it('creates each initial service type with stable Point geometry', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const ids: string[] = [];
    for (const [index, service_type] of ['toilet', 'prayer_room', 'mosque'].entries()) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/service-points',
        headers: { cookie },
        payload: { longitude: 46.29 + index * 0.0001, latitude: 38.07, service_type }
      });
      expect(response.statusCode).toBe(201);
      const point = response.json().servicePoint;
      ids.push(point.service_point_id);
      expect(point.geometry.type).toBe('Point');
      expect(point.geometry.coordinates).toEqual([46.29 + index * 0.0001, 38.07]);
    }
    expect(new Set(ids).size).toBe(3);
  });

  it('rejects unknown service types and supports update/delete with authorization', async () => {
    const owner = await loginCookie('surveyor');
    const created = await owner.app.inject({
      method: 'POST',
      url: '/api/service-points',
      headers: { cookie: owner.cookie },
      payload: { longitude: 46.29, latitude: 38.07, service_type: 'atm' }
    });
    expect(created.statusCode).toBe(400);

    const valid = await owner.app.inject({
      method: 'POST',
      url: '/api/service-points',
      headers: { cookie: owner.cookie },
      payload: { longitude: 46.29, latitude: 38.07, service_type: 'toilet', name: 'سرویس بازار' }
    });
    const id = valid.json().servicePoint.service_point_id as string;

    const otherLogin = await owner.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'moradi', password: 'moradi123' } });
    const other = { app: owner.app, cookie: extractCookie(otherLogin) };
    const forbidden = await other.app.inject({
      method: 'PATCH',
      url: `/api/service-points/${id}`,
      headers: { cookie: other.cookie },
      payload: { service_type: 'mosque' }
    });
    expect(forbidden.statusCode).toBe(403);

    const updated = await owner.app.inject({
      method: 'PATCH',
      url: `/api/service-points/${id}`,
      headers: { cookie: owner.cookie },
      payload: { service_type: 'mosque', notes: 'در ورودی اصلی' }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().servicePoint.service_type).toBe('mosque');

    const removed = await owner.app.inject({
      method: 'DELETE',
      url: `/api/service-points/${id}`,
      headers: { cookie: owner.cookie }
    });
    expect(removed.statusCode).toBe(204);
  });

  it('loads by bbox and keeps services out of polygon statistics and assignment input', async () => {
    await insertSimpleShop('service-isolation-shop');
    const { app, cookie } = await loginCookie('surveyor');
    await app.inject({
      method: 'POST',
      url: '/api/service-points',
      headers: { cookie },
      payload: { longitude: 46.29, latitude: 38.07, service_type: 'prayer_room' }
    });
    const points = await app.inject({
      method: 'GET',
      url: '/api/service-points?bbox=46.28,38.06,46.30,38.08',
      headers: { cookie }
    });
    expect(points.statusCode).toBe(200);
    expect(points.json().features).toHaveLength(1);

    const stats = await app.inject({ method: 'GET', url: '/api/stats', headers: { cookie } });
    expect(stats.json().total).toBe(1);
    expect(stats.json().surveyed).toBe(0);

    const admin = await loginCookie('admin');
    const adminStats = await admin.app.inject({ method: 'GET', url: '/api/admin/stats/service-points', headers: { cookie: admin.cookie } });
    expect(adminStats.json().total).toBe(1);
    const assignments = await admin.app.inject({
      method: 'POST', url: '/api/assignments/preview', headers: { cookie: admin.cookie },
      payload: { requested_count: 10, member_ids: [await userIdByUsername('jafari')] }
    });
    expect(assignments.statusCode).toBe(200);
    expect(assignments.json().actualCount).toBe(1);
  });

  it('appears in the combined admin table and has separate GeoJSON export', async () => {
    const surveyor = await loginCookie('surveyor');
    await surveyor.app.inject({
      method: 'POST', url: '/api/service-points', headers: { cookie: surveyor.cookie },
      payload: { longitude: 46.29, latitude: 38.07, service_type: 'mosque', name: 'مسجد بازار' }
    });
    const admin = await loginCookie('admin');
    const table = await admin.app.inject({ method: 'GET', url: '/api/admin/shops?record_type=services&service_type=mosque', headers: { cookie: admin.cookie } });
    expect(table.statusCode).toBe(200);
    expect(table.json().total).toBe(1);
    expect(table.json().rows[0].record_type).toBe('services');
    expect(table.json().rows[0].service_type).toBe('mosque');

    const exportResponse = await admin.app.inject({ method: 'GET', url: '/api/admin/service-points/export', headers: { cookie: admin.cookie } });
    expect(exportResponse.statusCode).toBe(200);
    const feature = exportResponse.json().features[0];
    expect(feature.geometry.type).toBe('Point');
    expect(feature.properties.service_type).toBe('mosque');
    expect(feature.properties.name).toBe('مسجد بازار');

    const excel = await admin.app.inject({ method: 'GET', url: '/api/admin/shops/export?record_type=services', headers: { cookie: admin.cookie } });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(excel.rawPayload as never);
    const row = workbook.worksheets[0].getRow(2);
    expect(row.getCell(9).value).toBe('خدمات');
    expect(row.getCell(13).value).toBe('مسجد');
  });
});
