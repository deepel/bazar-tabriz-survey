import type { FastifyInstance } from 'fastify';
import { pool } from '../../db';
import { requireAdmin } from '../../middleware/auth';
import { hashPassword } from '../../services/auth.service';
import { AppError, sendFriendlyError } from '../../utils/errors';

interface CreateUserBody {
  username?: string;
  password?: string;
  role?: 'admin' | 'surveyor';
}

interface UpdateUserBody {
  password?: string;
  role?: 'admin' | 'surveyor';
  is_active?: boolean;
}

export function registerAdminUserRoutes(app: FastifyInstance): void {
  app.get(
    '/api/admin/users',
    { preHandler: [requireAdmin] },
    async () => {
      const result = await pool.query(
        `SELECT id, username, role, is_active, created_at,
                (SELECT COUNT(*) FROM surveys sv WHERE sv.surveyor_id = users.id)::int AS survey_count
         FROM users
         ORDER BY id`
      );
      return { users: result.rows };
    }
  );

  app.post<{ Body: CreateUserBody }>(
    '/api/admin/users',
    {
      preHandler: [requireAdmin],
      schema: {
        body: {
          type: 'object',
          required: ['username', 'password', 'role'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 3 },
            password: { type: 'string', minLength: 6 },
            role: { type: 'string', enum: ['admin', 'surveyor'] }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { username, password, role } = request.body!;
        const passwordHash = await hashPassword(password as string);
        try {
          const result = await pool.query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role, is_active, created_at',
            [username, passwordHash, role]
          );
          return reply.code(201).send({ user: result.rows[0] });
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            throw new AppError(409, 'username_taken', 'این نام کاربری قبلاً ثبت شده است.');
          }
          throw err;
        }
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );

  app.patch<{ Body: UpdateUserBody; Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const id = Number.parseInt(request.params.id, 10);
        if (!Number.isInteger(id)) throw new AppError(400, 'bad_id', 'شناسه کاربر نامعتبر است.');

        const sets: string[] = ['updated_at = now()'];
        const values: unknown[] = [];
        const push = (column: string, value: unknown) => {
          values.push(value);
          sets.push(`${column} = $${values.length}`);
        };

        if (request.body?.password) push('password_hash', await hashPassword(request.body.password));
        if (request.body?.role) {
          if (request.body.role !== 'admin' && request.body.role !== 'surveyor') {
            throw new AppError(400, 'bad_role', 'نقش نامعتبر است.');
          }
          push('role', request.body.role);
        }
        if (typeof request.body?.is_active === 'boolean') push('is_active', request.body.is_active);
        if (values.length === 0) {
          throw new AppError(400, 'nothing_to_update', 'هیچ فیلدی برای ویرایش ارسال نشده است.');
        }
        values.push(id);
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
        const row = await pool.query(
          'SELECT id, username, role, is_active, created_at FROM users WHERE id = $1',
          [id]
        );
        if (!row.rowCount) throw new AppError(404, 'user_not_found', 'کاربر یافت نشد.');
        return reply.send({ user: row.rows[0] });
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );
}