import { beforeEach, expect, it } from 'vitest';
import { dbDescribe, extractCookie, getApp, loginCookie, resetDb } from './helpers';

dbDescribe('auth flow', () => {
  beforeEach(async () => await resetDb());

  it('rejects a login without a password (validation)', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a wrong password', async () => {
    const { app } = await loginCookie('admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'nope' }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('invalid_credentials');
  });

  it('logs in, keeps the session, and exposes /auth/me', async () => {
    const { app, cookie } = await loginCookie('admin');
    expect(cookie).toContain('session=');

    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user).toMatchObject({ username: 'admin', role: 'admin' });
  });

  it('returns 401 for /auth/me without a cookie', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('invalidates the session on logout', async () => {
    const { app, cookie } = await loginCookie('admin');
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'session=expired' }
    });
    expect(me.statusCode).toBe(401);
  });

  it('blocks a surveyor from the admin routes', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie }
    });
    expect(res.statusCode).toBe(403);
  });

  it('changes a password', async () => {
    const adminCookie = (await loginCookie('admin')).cookie;
    const app = await getApp();
    await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: { username: 'tempuser', password: 'temp123456', role: 'surveyor' }
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tempuser', password: 'temp123456' }
    });
    const cookie = extractCookie(login);

    const weak = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { new_password: 'short' }
    });
    expect(weak.statusCode).toBe(400);

    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      headers: { cookie },
      payload: { new_password: 'muchlongerpass' }
    });
    expect(ok.statusCode).toBe(200);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tempuser', password: 'muchlongerpass' }
    });
    expect(newLogin.statusCode).toBe(200);

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'tempuser', password: 'temp123456' }
    });
    expect(oldLogin.statusCode).toBe(401);
  });

  it('admin creates a user and rejects duplicates', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { username: 'tester', password: 'tester123', role: 'surveyor' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.username).toBe('tester');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { username: 'tester', password: 'tester123', role: 'surveyor' }
    });
    expect(dup.statusCode).toBe(409);
  });

  it('admin patches a user', async () => {
    const { app, cookie } = await loginCookie('admin');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { username: 'patchee', password: 'patch1234', role: 'surveyor' }
    });
    const id = created.json().user.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${id}`,
      headers: { cookie },
      payload: { role: 'admin' }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().user.role).toBe('admin');

    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${id}`,
      headers: { cookie },
      payload: { role: 'superuser' }
    });
    expect(bad.statusCode).toBe(400);
  });

  it('locks out a disabled account', async () => {
    const { app, cookie } = await loginCookie('admin');
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie },
      payload: { username: 'disableduser', password: 'disable123', role: 'surveyor' }
    });
    const id = created.json().user.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${id}`,
      headers: { cookie },
      payload: { is_active: false }
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'disableduser', password: 'disable123' }
    });
    expect(login.statusCode).toBe(403);
    expect(login.json().error).toBe('account_disabled');
  });
});