import type { FastifyInstance } from 'fastify';
import { pool } from '../db';
import { authenticate } from '../middleware/auth';
import { listGisLayers } from '../services/gis-layers.service';
import { queryGisLayer } from '../services/gis-reference.service';
import { AppError } from '../utils/errors';

/**
 * Read-only layer configuration consumed by the survey map. Any authenticated
 * user (admin or surveyor) may list the layers so the map can display them;
 * only the admin endpoints (routes/admin/gis-layers.ts) mutate them.
 */
export function registerGisLayerRoutes(app: FastifyInstance): void {
  app.get('/api/gis-layers', { preHandler: [authenticate] }, async () => ({
    layers: await listGisLayers()
  }));

  app.get(
    '/api/gis-layers/:key/data',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const params = request.params as { key: string };
      const query = request.query as { bbox?: string; zoom?: string };
      const parsedZoom = Number.parseInt(query.zoom || '0', 10);
      const parts = (query.bbox || '').split(',').map((value) => Number.parseFloat(value));
      const bbox = parts.length === 4 && parts.every(Number.isFinite)
        ? { minLon: parts[0], minLat: parts[1], maxLon: parts[2], maxLat: parts[3] }
        : null;
      const result = await pool.query(
        `SELECT layer_key, display_name, enabled, source_url, order_index, cache_version,
                min_zoom, detail_zoom, updated_at
         FROM gis_layers WHERE layer_key = $1`,
        [params.key]
      );
      if (!result.rowCount) throw new AppError(404, 'layer_not_found', 'لایه مورد نظر یافت نشد.');
      const layer = result.rows[0];
      if (!layer.enabled) return reply.send({ type: 'FeatureCollection', features: [], disabled: true });
      return reply.send(await queryGisLayer(layer, bbox, Number.isFinite(parsedZoom) ? parsedZoom : 0));
    }
  );
}
