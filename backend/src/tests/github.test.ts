import { beforeEach, expect, it } from 'vitest';
import { maybeAutoSync, syncToGitHub } from '../services/github.service';
import { insertSimpleShop, loginCookie, dbDescribe, resetDb } from './helpers';

dbDescribe('GitHub backup', () => {
  beforeEach(async () => await resetDb());

  it('is not configured in the test environment', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'GET', url: '/api/admin/github/status', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().configured).toBe(false);
  });

  it('returns a 400 with a friendly message when syncing unconfigured', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({ method: 'POST', url: '/api/admin/github/sync', headers: { cookie } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('github_not_configured');
  });

  it('is a no-op for auto sync when not configured or interval is 0', async () => {
    await expect(maybeAutoSync()).resolves.toBeUndefined();
  });

  it('keeps survey data safe after a failed sync attempt', async () => {
    await insertSimpleShop('gh_A');
    const { app, cookie } = await loginCookie('surveyor');
    const saved = await app.inject({
      method: 'POST',
      url: '/api/surveys',
      headers: { cookie },
      payload: { shop_id: 'gh_A', activity: 'پوشاک', building_condition: 'سالم' }
    });
    expect(saved.statusCode).toBe(201);

    // Unconfigured -> the manual sync path fails, but the DB row is untouched.
    await expect(syncToGitHub()).rejects.toMatchObject({ code: 'github_not_configured' });
    const { pool } = await import('../db');
    const res = await pool.query('SELECT COUNT(*)::int AS n FROM surveys WHERE shop_id = $1', ['gh_A']);
    expect(res.rows[0].n).toBe(1);
  });
});