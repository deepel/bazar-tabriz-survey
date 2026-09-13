import type { FastifyInstance } from 'fastify';
import { ACTIVITIES, BUILDING_CONDITIONS, config } from '../config';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';

export function registerStatsAndOptions(app: FastifyInstance): void {
  app.get('/api/stats', { preHandler: [authenticate] }, async () => {
    const result = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM shops) AS total,
         (SELECT COUNT(*) FROM surveys) AS surveyed`
    );
    const total = Number(result.rows[0].total);
    const surveyed = Number(result.rows[0].surveyed);
    return {
      total,
      surveyed,
      unsurveyed: total - surveyed,
      progress: total > 0 ? Math.round((surveyed / total) * 1000) / 10 : 0
    };
  });

  app.get('/api/options', { preHandler: [authenticate] }, async () => ({
    activities: ACTIVITIES,
    buildingConditions: BUILDING_CONDITIONS,
    gpsWarningDistanceMeters: config.gpsWarningDistanceMeters
  }));
}