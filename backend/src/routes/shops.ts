import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/errors';

/**
 * Shops are served as a WGS84 GeoJSON FeatureCollection. The `bbox` query
 * parameter filters rows using the indexed min/max columns so the map only
 * downloads the shops in the current viewport (important for ~21k polygons).
 */
export function registerShopRoutes(app: FastifyInstance): void {
  app.get(
    '/api/shops',
    { preHandler: [authenticate] },
    async (request) => {
      const query = request.query as {
        bbox?: string;
        limit?: string;
      };
      const hasBbox = Boolean(query.bbox);
      const parts = (query.bbox || '').split(',').map((p) => Number.parseFloat(p));
      const validBbox = hasBbox && parts.length === 4 && parts.every((p) => Number.isFinite(p));
      const limit = Math.min(Math.max(Number.parseInt(query.limit || '5000', 10) || 5000, 1), 20000);

      let result;
      if (validBbox) {
        const [minLon, minLat, maxLon, maxLat] = parts;
        result = await pool.query(
          `SELECT s.shop_id, s.geometry, s.centroid_lat, s.centroid_lon,
                  sv.shop_name, sv.activity, sv.building_condition,
                  a.id AS assignment_id,
                  CASE WHEN a.id IS NULL THEN NULL ELSE COALESCE(am.color_snapshot, a.primary_color) END AS assignment_color
           FROM shops s
           LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
           LEFT JOIN assignment_shops ash ON ash.shop_id = s.shop_id
           LEFT JOIN assignment_members am ON am.assignment_id = ash.assignment_id AND am.user_id = ash.member_id
           LEFT JOIN assignments a ON a.id = ash.assignment_id AND a.status = 'active'
             AND ($1 = 'admin' OR EXISTS (
               SELECT 1 FROM assignment_members am WHERE am.assignment_id = a.id AND am.user_id = $2
             ))
           WHERE s.min_lon >= $3 AND s.max_lon <= $4 AND s.min_lat >= $5 AND s.max_lat <= $6
           ORDER BY s.shop_id
           LIMIT $7`,
          [request.user!.role, request.user!.id, minLon, maxLon, minLat, maxLat, limit]
        );
      } else {
        result = await pool.query(
          `SELECT s.shop_id, s.geometry, s.centroid_lat, s.centroid_lon,
                  sv.shop_name, sv.activity, sv.building_condition,
                  a.id AS assignment_id,
                  CASE WHEN a.id IS NULL THEN NULL ELSE COALESCE(am.color_snapshot, a.primary_color) END AS assignment_color
           FROM shops s
           LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
           LEFT JOIN assignment_shops ash ON ash.shop_id = s.shop_id
           LEFT JOIN assignment_members am ON am.assignment_id = ash.assignment_id AND am.user_id = ash.member_id
           LEFT JOIN assignments a ON a.id = ash.assignment_id AND a.status = 'active'
             AND ($1 = 'admin' OR EXISTS (
               SELECT 1 FROM assignment_members am WHERE am.assignment_id = a.id AND am.user_id = $2
             ))
           ORDER BY s.shop_id
           LIMIT $3`,
          [request.user!.role, request.user!.id, limit]
        );
      }

      // A bbox that covers more than `limit` shops would silently truncate the
      // map, so the client knows it should keep panning.
      const truncated = hasBbox && result.rows.length >= limit;

      return {
        type: 'FeatureCollection',
        features: result.rows.map((row) => ({
          type: 'Feature',
          properties: {
            shop_id: row.shop_id,
            surveyed: row.shop_name !== null || row.activity !== null,
            shop_name: row.shop_name,
            activity: row.activity,
            building_condition: row.building_condition,
            centroid_lat: row.centroid_lat,
            centroid_lon: row.centroid_lon,
            assignment_id: row.assignment_id,
            assignment_color: row.assignment_color
          },
          geometry: row.geometry
        })),
        truncated
      };
    }
  );

  app.get(
    '/api/shops/:shopId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const shopId = (request.params as { shopId: string }).shopId;
      const shopResult = await pool.query(
        `SELECT s.shop_id, s.geometry, s.original_properties, s.source_file,
                (sv.id IS NOT NULL) AS surveyed
         FROM shops s
         LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
         WHERE s.shop_id = $1`,
        [shopId]
      );
      if (!shopResult.rowCount) {
        throw new AppError(404, 'shop_not_found', 'مغازه مورد نظر یافت نشد.');
      }
      const surveyResult = await pool.query(
        `SELECT sv.*, u.username AS surveyor_username
         FROM surveys sv
         LEFT JOIN users u ON u.id = sv.surveyor_id
         WHERE sv.shop_id = $1`,
        [shopId]
      );
      const stats = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM shops) AS total,
           (SELECT COUNT(*) FROM surveys) AS surveyed`
      );
      return reply.send({
        shop: shopResult.rows[0],
        survey: surveyResult.rows[0] ?? null,
        stats: stats.rows[0]
      });
    }
  );
}
