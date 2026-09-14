import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, insertSimpleShop, insertSurveyFor, loginCookie, resetDb } from './helpers';

dbDescribe('admin statistics', () => {
  beforeEach(async () => await resetDb());

  it('returns per-activity counts for surveyed shops, admin-only', async () => {
    for (let i = 0; i < 3; i++) await insertSimpleShop('c_pusak_' + i);
    for (let i = 0; i < 2; i++) await insertSimpleShop('c_farsh_' + i);
    for (let i = 0; i < 2; i++) await insertSimpleShop('c_sayer_' + i);
    await insertSimpleShop('c_unsurveyed');

    for (let i = 0; i < 3; i++) await insertSurveyFor('c_pusak_' + i, 'پوشاک', 'jafari');
    for (let i = 0; i < 2; i++) await insertSurveyFor('c_farsh_' + i, 'فرش', 'moradi');
    for (let i = 0; i < 2; i++) {
      await insertSurveyFor('c_sayer_' + i, 'سایر', 'kamali', 'کتاب‌فروشی');
    }

    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats/categories', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Total only counts surveys (the unsurveyed shop is excluded).
    expect(body.total).toBe(7);

    const byActivity = Object.fromEntries(
      (body.categories as Array<{ activity: string; count: number }>).map((c) => [c.activity, c.count])
    );
    expect(byActivity['پوشاک']).toBe(3);
    expect(byActivity['فرش']).toBe(2);
    expect(byActivity['سایر']).toBe(2);
    // Every configured activity is listed, zeros too.
    for (const activity of ['پوشاک', 'کفش', 'فرش', 'صنایع دستی', 'مواد غذایی', 'طلا و جواهر', 'لوازم خانگی', 'خدمات', 'سایر']) {
      expect(byActivity).toHaveProperty(activity);
    }
  });

  it('sorts surveyors by completed surveys, admin-only', async () => {
    for (let i = 0; i < 4; i++) await insertSimpleShop('s_jafari_' + i);
    for (let i = 0; i < 2; i++) await insertSimpleShop('s_moradi_' + i);
    for (let i = 0; i < 1; i++) await insertSimpleShop('s_kamali_' + i);

    for (let i = 0; i < 4; i++) await insertSurveyFor('s_jafari_' + i, 'پوشاک', 'jafari');
    for (let i = 0; i < 2; i++) await insertSurveyFor('s_moradi_' + i, 'کفش', 'moradi');
    for (let i = 0; i < 1; i++) await insertSurveyFor('s_kamali_' + i, 'فرش', 'kamali');

    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/stats/surveyors', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalSurveyed).toBe(7);

    const surveyors = body.surveyors as Array<{ username: string; survey_count: number }>;
    const counts = surveyors.map((s) => s.survey_count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    const jafari = surveyors.find((s) => s.username === 'jafari');
    expect(jafari?.survey_count).toBe(4);
    // Admins are excluded from the surveyor ranking.
    expect(surveyors.some((s) => s.username === 'admin')).toBe(false);
  });

  it('blocks surveyors from admin statistics', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    for (const url of ['/api/admin/stats/categories', '/api/admin/stats/surveyors']) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(res.statusCode).toBe(403);
    }
  });

  it('blocks anonymous requests to admin statistics', async () => {
    const app = await (await import('./helpers')).getApp();
    for (const url of ['/api/admin/stats/categories', '/api/admin/stats/surveyors']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
    }
  });
});