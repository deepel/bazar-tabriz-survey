import ExcelJS from 'exceljs';
import { beforeEach, expect, it } from 'vitest';
import { SHOPS_WORKBOOK_MIME } from '../services/excel.service';
import {
  dbDescribe,
  insertSimpleShop,
  insertSurveyFor,
  loginCookie,
  resetDb,
  seedShopsBulk
} from './helpers';

function date(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 10, 30));
}

/** exceljs declares its own global `Buffer` type; `as never` bridges the gap. */
async function loadWorkbook(payload: unknown): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(payload as never);
  return workbook;
}

/** 8 shops, 5 surveyed (+3 unsurveyed). See table in the exporting test. */
async function seedDataset(): Promise<void> {
  const shops: Array<[string, string | null]> = [
    ['s1', 'بازار ابریشم'],
    ['s2', 'بازار کفاشان'],
    ['s3', 'خانه مشروطه'],
    ['s4', 'سرای امیر'],
    ['s5', 'مغازه فرش امیر'],
    ['u1', null],
    ['u2', null],
    ['u3', null]
  ];
  for (const [id] of shops) await insertSimpleShop(id);

  await insertSurveyFor('s1', 'فرش', 'jafari', null, { shopName: 'بازار ابریشم', surveyedAt: date(2026, 1, 10) });
  await insertSurveyFor('s2', 'کفش', 'moradi', null, { shopName: 'بازار کفاشان', buildingCondition: 'نیازمند مرمت', surveyedAt: date(2026, 2, 15) });
  await insertSurveyFor('s3', 'سایر', 'kamali', 'موزه', { shopName: 'خانه مشروطه', buildingCondition: 'مرمت شده', surveyedAt: date(2026, 3, 5) });
  await insertSurveyFor('s4', 'فرش', 'jafari', null, { shopName: 'سرای امیر', buildingCondition: 'نامناسب', surveyedAt: date(2026, 1, 20) });
  await insertSurveyFor('s5', 'فرش', 'jafari', null, { shopName: 'مغازه فرش امیر', surveyedAt: date(2026, 4, 10) });
}

dbDescribe('admin shop data table', () => {
  beforeEach(async () => await resetDb());

  it('searches by shop name (backend ILIKE)', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?search=' + encodeURIComponent('فرش امیر'),
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].shop_id).toBe('s5');
    expect(body.rows[0].shop_name).toBe('مغازه فرش امیر');
  });

  it('searches by shop_id', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops?search=s3', headers: { cookie } });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows[0].shop_id).toBe('s3');
  });

  it('filters by activity', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?activity=' + encodeURIComponent('فرش'),
      headers: { cookie }
    });
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.rows.map((r: { shop_id: string }) => r.shop_id).sort()).toEqual(['s1', 's4', 's5']);
  });

  it('filters by building condition', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?building_condition=' + encodeURIComponent('نیازمند مرمت'),
      headers: { cookie }
    });
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].shop_id).toBe('s2');
  });

  it('filters by surveyed / unsurveyed status', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');

    const surveyedRes = await app.inject({ method: 'GET', url: '/api/admin/shops?surveyed=yes', headers: { cookie } });
    expect(surveyedRes.json().total).toBe(5);
    expect(surveyedRes.json().rows.every((r: { surveyed: boolean }) => r.surveyed)).toBe(true);

    const unsurveyedRes = await app.inject({ method: 'GET', url: '/api/admin/shops?surveyed=no', headers: { cookie } });
    expect(unsurveyedRes.json().total).toBe(3);
    expect(unsurveyedRes.json().rows.every((r: { surveyed: boolean }) => !r.surveyed)).toBe(true);
  });

  it('filters by surveyor username', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops?surveyor=jafari', headers: { cookie } });
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.rows.map((r: { shop_id: string }) => r.shop_id).sort()).toEqual(['s1', 's4', 's5']);
    expect(body.rows.every((r: { surveyor_username: string }) => r.surveyor_username === 'jafari')).toBe(true);
  });

  it('filters by surveyed_at date range', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?date_from=2026-02-01&date_to=2026-02-28',
      headers: { cookie }
    });
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.rows[0].shop_id).toBe('s2');
  });

  it('combines multiple filters (activity + condition + status + surveyor + date)', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const url =
      '/api/admin/shops?activity=' + encodeURIComponent('فرش') +
      '&building_condition=' + encodeURIComponent('سالم') +
      '&surveyed=yes&surveyor=jafari&date_from=2026-01-01&date_to=2026-01-31';
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.total).toBe(1);
    expect(body.rows[0].shop_id).toBe('s1');
  });

  it('sorts server-side (nulls last)', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');

    const descRes = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?sort=surveyed_at&order=desc',
      headers: { cookie }
    });
    const desc = descRes.json();
    expect(desc.sort).toBe('surveyed_at');
    expect(desc.order).toBe('desc');
    expect(desc.rows[0].shop_id).toBe('s5'); // latest surveyed
    // Unsurveyed shops (no surveyed_at) always come last for either direction.
    expect(desc.rows.slice(-3).every((r: { surveyed: boolean }) => !r.surveyed)).toBe(true);

    const nameRes = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?sort=shop_name&order=asc',
      headers: { cookie }
    });
    const byName = nameRes.json();
    expect(byName.rows[0].shop_id).toBe('s1'); // 'بازار ابریشم'
    expect(byName.rows.slice(-3).every((r: { surveyed: boolean }) => !r.surveyed)).toBe(true);
  });

  it('paginates server-side', async () => {
    await seedShopsBulk(70, 70);
    const { app, cookie } = await loginCookie('admin');

    const page1 = await app.inject({ method: 'GET', url: '/api/admin/shops?page=1&pageSize=25', headers: { cookie } });
    const p1 = page1.json();
    expect(p1.total).toBe(70);
    expect(p1.rows).toHaveLength(25);
    expect(p1.pageSize).toBe(25);
    expect(p1.summary.total).toBe(70);
    expect(p1.summary.surveyed).toBe(70);

    const page3 = await app.inject({ method: 'GET', url: '/api/admin/shops?page=3&pageSize=25', headers: { cookie } });
    expect(page3.json().rows).toHaveLength(20);

    const page4 = await app.inject({ method: 'GET', url: '/api/admin/shops?page=4&pageSize=25', headers: { cookie } });
    expect(page4.json().rows).toHaveLength(0);
  });

  it('returns whole-database summary plus the filtered total', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');

    const unfiltered = await app.inject({ method: 'GET', url: '/api/admin/shops', headers: { cookie } });
    const u = unfiltered.json();
    expect(u.summary).toEqual({ total: 8, surveyed: 5, unsurveyed: 3 });
    expect(u.total).toBe(8);

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/admin/shops?activity=' + encodeURIComponent('فرش'),
      headers: { cookie }
    });
    const f = filtered.json();
    // Summary must describe the whole database, not the filtered page.
    expect(f.summary).toEqual({ total: 8, surveyed: 5, unsurveyed: 3 });
    expect(f.total).toBe(3);
  });

  it('exports Excel with no filters', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops/export', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain(SHOPS_WORKBOOK_MIME);

    const workbook = await loadWorkbook(res.rawPayload);
    const sheet = workbook.worksheets[0];
    // Header + 8 shops.
    expect(sheet.rowCount).toBe(9);
    expect(sheet.getRow(1).getCell(1).value).toBe('نام مغازه');
  });

  it('exports Excel honoring filters', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/shops/export?activity=' + encodeURIComponent('فرش') + '&surveyed=yes',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(200);

    const workbook = await loadWorkbook(res.rawPayload);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(4); // header + 3 carpet shops

    const activities = new Set<string>();
    for (let i = 2; i <= sheet.rowCount; i++) {
      activities.add(String(sheet.getRow(i).getCell(2).value));
    }
    expect([...activities]).toEqual(['فرش']);
  });

  it('writes Persian text into Excel cells', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops/export', headers: { cookie } });

    const workbook = await loadWorkbook(res.rawPayload);
    const sheet = workbook.worksheets[0];

    const byId = new Map<string, { name: string; status: string }>();
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      byId.set(String(row.getCell(8).value), {
        name: String(row.getCell(1).value),
        status: String(row.getCell(5).value)
      });
    }
    expect(byId.get('s5')?.name).toBe('مغازه فرش امیر');
    expect(byId.get('s5')?.status).toBe('برداشت شده');
    expect(byId.get('s3')?.status).toBe('برداشت شده');
    // Unsurveyed shops are included and marked as such.
    const unsurveyed = [...byId.values()].filter((r) => r.status === 'برداشت نشده');
    expect(unsurveyed).toHaveLength(3);
  });

  it('blocks anonymous requests (401) on data and export', async () => {
    await seedDataset();
    const app = await (await import('./helpers')).getApp();
    for (const url of ['/api/admin/shops', '/api/admin/shops/export']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });

  it('blocks surveyors (403) on the data endpoint', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });

  it('blocks surveyors (403) on Excel export', async () => {
    await seedDataset();
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({ method: 'GET', url: '/api/admin/shops/export', headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });
});