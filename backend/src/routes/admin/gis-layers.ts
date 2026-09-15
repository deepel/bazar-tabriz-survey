import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import { refreshGisLayer, updateGisLayer } from '../../services/gis-layers.service';
import { sendFriendlyError } from '../../utils/errors';

interface PatchBody {
  display_name?: string;
  enabled?: boolean;
  source_url?: string;
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
        const layer = await refreshGisLayer(request.params.key);
        return reply.send(layer);
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );
}