import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import { listGisLayers } from '../services/gis-layers.service';

/**
 * Read-only layer configuration consumed by the survey map. Any authenticated
 * user (admin or surveyor) may list the layers so the map can display them;
 * only the admin endpoints (routes/admin/gis-layers.ts) mutate them.
 */
export function registerGisLayerRoutes(app: FastifyInstance): void {
  app.get('/api/gis-layers', { preHandler: [authenticate] }, async () => ({
    layers: await listGisLayers()
  }));
}