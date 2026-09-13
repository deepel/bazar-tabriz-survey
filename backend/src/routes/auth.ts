import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { logger } from '../logger';
import { authenticate } from '../middleware/auth';
import {
  COOKIE_NAME,
  hashPassword,
  sessionCookieConfig,
  signSession,
  verifyPassword
} from '../services/auth.service';

interface LoginBody {
  username: string;
  password: string;
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post<{ Body: LoginBody }>(
    '/api/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const result = await pool.query(
        'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1',
        [username]
      );
      const row = result.rows[0];
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        logger.info('auth.login.failed', { username });
        return reply
          .code(401)
          .send({ error: 'invalid_credentials', message: 'نام کاربری یا رمز عبور اشتباه است.' });
      }
      if (!row.is_active) {
        logger.info('auth.login.disabled', { username });
        return reply
          .code(403)
          .send({ error: 'account_disabled', message: 'حساب کاربری شما غیرفعال شده است.' });
      }
      const user = { id: row.id, username: row.username, role: row.role as 'admin' | 'surveyor' };
      const token = signSession(user);
      reply.setCookie(COOKIE_NAME, token, sessionCookieConfig);
      logger.info('auth.login.success', { username, role: user.role });
      return reply.send({ user });
    }
  );

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    reply.send({ ok: true });
  });

  app.get(
    '/api/auth/me',
    { preHandler: [authenticate] },
    async (request) => {
      const result = await pool.query(
        'SELECT id, username, role, is_active, created_at FROM users WHERE id = $1',
        [request.user!.id]
      );
      if (!result.rowCount) {
        return { user: null };
      }
      return { user: result.rows[0] };
    }
  );

  app.post(
    '/api/auth/change-password',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const userId = request.user!.id;
      const body = (request.body || {}) as { new_password?: string };
      if (!body.new_password || body.new_password.length < 6) {
        return reply
          .code(400)
          .send({ error: 'weak_password', message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      }
      const hash = await hashPassword(body.new_password);
      await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        hash,
        userId
      ]);
      return { ok: true };
    }
  );
}