import type { FastifyInstance } from 'fastify';
import {
  ACTIVITIES,
  BUILDING_CONDITIONS,
  FLOOR_LABELS,
  FLOORS,
  INSTAGRAM_STATUS_LABELS,
  INSTAGRAM_STATUSES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPES
} from '../config';
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
    floors: FLOORS.map((value) => ({ value, label: FLOOR_LABELS[value] })),
    instagramStatuses: INSTAGRAM_STATUSES.map((value) => ({ value, label: INSTAGRAM_STATUS_LABELS[value] })),
    serviceTypes: SERVICE_TYPES.map((value) => ({ value, label: SERVICE_TYPE_LABELS[value] }))
  }));
}
