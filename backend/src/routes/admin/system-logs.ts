import type { FastifyInstance } from 'fastify';
import { pool } from '../../db';
import { requireAdmin } from '../../middleware/auth';

function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function registerAdminSystemLogRoutes(app: FastifyInstance): void {
  app.get(
    '/api/admin/system-logs',
    { preHandler: [requireAdmin] },
    async (request) => {
      const query = request.query as { level?: string; q?: string; limit?: string; offset?: string };
      const level = ['debug', 'info', 'warn', 'error'].includes(query.level || '') ? query.level! : '';
      const search = (query.q || '').trim();
      const limit = positiveInt(query.limit, 80, 5000);
      const offset = Math.max(0, Number.parseInt(query.offset || '0', 10) || 0);
      const result = await pool.query(
        `SELECT id, created_at, level, event, details
         FROM system_logs
         WHERE ($1 = '' OR level = $1)
           AND ($2 = '' OR event ILIKE '%' || $2 || '%' OR details::text ILIKE '%' || $2 || '%')
         ORDER BY created_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [level, search, limit, offset]
      );
      const count = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM system_logs
         WHERE ($1 = '' OR level = $1)
           AND ($2 = '' OR event ILIKE '%' || $2 || '%' OR details::text ILIKE '%' || $2 || '%')`,
        [level, search]
      );
      return { logs: result.rows, total: count.rows[0]?.total ?? 0, limit, offset };
    }
  );

  app.get(
    '/api/admin/system-logs/export',
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      const result = await pool.query(
        `SELECT id, created_at, level, event, details
         FROM system_logs ORDER BY created_at DESC, id DESC LIMIT 10000`
      );
      reply.header('Content-Disposition', `attachment; filename="bazar-system-logs-${new Date().toISOString().slice(0, 10)}.json"`);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      return reply.send({ exportedAt: new Date().toISOString(), logs: result.rows });
    }
  );
}
