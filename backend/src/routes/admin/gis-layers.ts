import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import { listGisLayers, refreshGisLayer, updateGisLayer } from '../../services/gis-layers.service';
import { materializeGisLayer } from '../../services/gis-reference.service';
import { sendFriendlyError } from '../../utils/errors';

interface PatchBody {
  display_name?: string;
  enabled?: boolean;
  source_url?: string;
  min_zoom?: number;
  detail_zoom?: number;
}

export function registerAdminGisLayerRoutes(app: FastifyInstance): void {
  app.patch<{ Params: { key: string }; Body: PatchBody }>(
    '/api/admin/gis-layers/:key',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const layer = await updateGisLayer(request.params.key, request.body ?? {});
        return reply.send(layer);
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );

  app.post<{ Params: { key: string } }>(
    '/api/admin/gis-layers/:key/refresh',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const current = (await listGisLayers()).find((item) => item.layer_key === request.params.key);
        if (!current) {
          return reply.code(404).send({ error: 'layer_not_found', message: 'لایه مورد نظر یافت نشد.' });
        }
        // Build the next version before publishing it. A failed download or
        // invalid GeoJSON therefore leaves the currently published layer live.
        await materializeGisLayer({ ...current, cache_version: current.cache_version + 1 });
        const layer = await refreshGisLayer(request.params.key);
        return reply.send(layer);
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );
}
