import { beforeEach, expect, it } from 'vitest';
import { pool } from '../db';
import { dbDescribe, loginCookie, resetDb } from './helpers';

dbDescribe('admin messaging', () => {
  beforeEach(async () => await resetDb());

  it('lets admin send a message to a single surveyor', async () => {
    const { app, cookie } = await loginCookie('admin');
    const recipient = await import('./helpers').then((h) => h.userIdByUsername('jafari'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { recipient_id: recipient, body: 'فردا از ساعت ۹ شروع کنید.' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().ok).toBe(true);
    expect(res.json().recipients).toBe(1);
  });

  it('surveyor sees only their own messages', async () => {
    const { app: adminApp, cookie: adminCookie } = await loginCookie('admin');
    const { userIdByUsername } = await import('./helpers');
    const jafariId = await userIdByUsername('jafari');

    await adminApp.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie: adminCookie },
      payload: { recipient_id: jafariId, body: 'اختصاصی برای جعفری' }
    });

    const { app, cookie } = await loginCookie('surveyor'); // jafari
    const own = await app.inject({ method: 'GET', url: '/api/messages', headers: { cookie } });
    expect(own.statusCode).toBe(200);
    const ownBody = own.json();
    expect(ownBody.messages).toHaveLength(1);
    expect(ownBody.messages[0].body).toBe('اختصاصی برای جعفری');
    expect(ownBody.unread).toBe(1);

    const moradiLogin = await adminApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'moradi', password: 'moradi123' }
    });
    const raw = moradiLogin.headers['set-cookie'];
    const header = Array.isArray(raw) ? raw[0] : String(raw ?? '');
    const moradiCookie = header.split(';')[0];
    const other = await adminApp.inject({
      method: 'GET',
      url: '/api/messages',
      headers: { cookie: moradiCookie }
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().messages).toHaveLength(0);
    expect(other.json().unread).toBe(0);
  });

  it('broadcast to all surveyors fan-out one message per surveyor', async () => {
    const { app, cookie } = await loginCookie('admin');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { to_all: true, body: 'به همه ممیزان: جلسه ساعت ۱۱' }
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().recipients).toBe(3); // jafari, moradi, kamali

    const count = await pool.query(
      'SELECT COUNT(*)::int AS n FROM messages WHERE is_broadcast = TRUE'
    );
    expect(count.rows[0].n).toBe(3);

    const surveyor = await loginCookie('surveyor');
    const inbox = await surveyor.app.inject({
      method: 'GET',
      url: '/api/messages',
      headers: { cookie: surveyor.cookie }
    });
    expect(inbox.json().messages).toHaveLength(1);
    expect(inbox.json().messages[0].is_broadcast).toBe(true);
    expect(inbox.json().unread).toBe(1);
  });

  it('read-all marks the reader messages as read and updates unread count', async () => {
    const { app: adminApp, cookie: adminCookie } = await loginCookie('admin');
    const { userIdByUsername } = await import('./helpers');
    await adminApp.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie: adminCookie },
      payload: { recipient_id: await userIdByUsername('jafari'), body: 'پیام اول' }
    });

    const { app, cookie } = await loginCookie('surveyor');
    const before = await app.inject({ method: 'GET', url: '/api/messages', headers: { cookie } });
    expect(before.json().unread).toBe(1);

    const read = await app.inject({ method: 'POST', url: '/api/messages/read-all', headers: { cookie } });
    expect(read.statusCode).toBe(200);
    expect(read.json().ok).toBe(true);

    const after = await app.inject({ method: 'GET', url: '/api/messages', headers: { cookie } });
    expect(after.json().unread).toBe(0);
    expect(after.json().messages[0].is_read).toBe(true);
  });

  it('non-admins cannot send messages', async () => {
    const { app, cookie } = await loginCookie('surveyor');
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { to_all: true, body: 'چرا من؟' }
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects message validation errors', async () => {
    const { app, cookie } = await loginCookie('admin');
    const { userIdByUsername } = await import('./helpers');

    const empty = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { to_all: true, body: '   ' }
    });
    expect(empty.statusCode).toBe(400);

    const noRecipient = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { body: 'بدون گیرنده' }
    });
    expect(noRecipient.statusCode).toBe(400);

    const badRecipient = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { recipient_id: 99999, body: 'به کی؟' }
    });
    expect(badRecipient.statusCode).toBe(404);

    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      headers: { cookie },
      payload: { recipient_id: await userIdByUsername('jafari'), body: 'x'.repeat(2001) }
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('anonymous users cannot read or send messages', async () => {
    const app = await (await import('./helpers')).getApp();
    const list = await app.inject({ method: 'GET', url: '/api/messages' });
    expect(list.statusCode).toBe(401);
    const send = await app.inject({
      method: 'POST',
      url: '/api/admin/messages',
      payload: { to_all: true, body: 'ناشناس' }
    });
    expect(send.statusCode).toBe(401);
  });
});