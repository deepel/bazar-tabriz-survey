import type { FastifyInstance } from 'fastify';
import { ACTIVITIES } from '../../config';
import { pool } from '../../db';
import { requireAdmin } from '../../middleware/auth';

export function registerAdminStatsRoutes(app: FastifyInstance): void {
  app.get('/api/admin/stats/point-shops', { preHandler: [requireAdmin] }, async () => {
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM point_shops');
    return { total: Number(result.rows[0].total) };
  });

  app.get('/api/admin/stats/service-points', { preHandler: [requireAdmin] }, async () => {
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM service_points');
    return { total: Number(result.rows[0].total) };
  });

  app.get('/api/admin/stats/door-points', { preHandler: [requireAdmin] }, async () => {
    const result = await pool.query('SELECT COUNT(*)::int AS total FROM door_points');
    return { total: Number(result.rows[0].total) };
  });

  app.get(
    '/api/admin/stats/categories',
    { preHandler: [requireAdmin] },
    async () => {
      const result = await pool.query(
        `SELECT activity, COUNT(*)::int AS count
         FROM surveys
         GROUP BY activity`
      );
      const counts = new Map<string, number>();
      for (const row of result.rows as Array<{ activity: string | null; count: number }>) {
        if (row.activity) counts.set(row.activity, Number(row.count));
      }
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const categories = ACTIVITIES.map((activity) => ({
        activity,
        count: counts.get(activity) ?? 0
      }));
      return { total, categories };
    }
  );

  app.get(
    '/api/admin/stats/surveyors',
    { preHandler: [requireAdmin] },
    async () => {
      const result = await pool.query(
        `SELECT u.id, u.username, u.role,
                COUNT(sv.id)::int AS survey_count
         FROM users u
         LEFT JOIN surveys sv ON sv.surveyor_id = u.id
         WHERE u.role = 'surveyor'
         GROUP BY u.id, u.username, u.role
         ORDER BY survey_count DESC, u.username ASC`
      );
      const surveyed = await pool.query('SELECT COUNT(*)::int AS n FROM surveys');
      return { totalSurveyed: Number(surveyed.rows[0].n), surveyors: result.rows };
    }
  );
}
