import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import {
  createPointShop,
  deletePointShop,
  getPointShop,
  listPointShops,
  type PointShopInput,
  updatePointShop
} from '../services/point-shop.service';

interface PointShopQuery { bbox?: string; limit?: string }
interface PointShopParams { pointShopId: string }

const pointProperties = {
  longitude: { type: 'number' }, latitude: { type: 'number' }, shop_name: { type: ['string', 'null'] },
  activity: { type: 'string' }, activity_other: { type: ['string', 'null'] },
  building_condition: { type: 'string' }, floor: { type: 'string' },
  instagram_status: { type: 'string' }, phone: { type: ['string', 'null'] },
  notes: { type: ['string', 'null'] }
} as const;

export function registerPointShopRoutes(app: FastifyInstance): void {
  app.get('/api/point-shops', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as PointShopQuery;
    const parts = (query.bbox || '').split(',').map((value) => Number.parseFloat(value));
    const hasBbox = Boolean(query.bbox) && parts.length === 4 && parts.every(Number.isFinite);
    return listPointShops({
      minLon: hasBbox ? parts[0] : undefined, minLat: hasBbox ? parts[1] : undefined,
      maxLon: hasBbox ? parts[2] : undefined, maxLat: hasBbox ? parts[3] : undefined,
      limit: Number.parseInt(query.limit || '5000', 10) || 5000
    });
  });

  app.post<{ Body: PointShopInput }>(
    '/api/point-shops',
    { preHandler: [authenticate], schema: { body: { type: 'object', required: ['longitude', 'latitude', 'activity', 'building_condition', 'floor', 'instagram_status'], additionalProperties: false, properties: pointProperties } } },
    async (request, reply) => reply.code(201).send({ pointShop: await createPointShop(request.user!.id, request.body) })
  );

  app.get<{ Params: PointShopParams }>('/api/point-shops/:pointShopId', { preHandler: [authenticate] }, async (request) => ({ pointShop: await getPointShop(request.params.pointShopId) }));

  app.patch<{ Params: PointShopParams; Body: Partial<PointShopInput> }>(
    '/api/point-shops/:pointShopId',
    { preHandler: [authenticate], schema: { body: { type: 'object', additionalProperties: false, properties: pointProperties } } },
    async (request) => ({ pointShop: await updatePointShop(request.params.pointShopId, request.user!.id, request.user!.role === 'admin', request.body) })
  );

  app.delete<{ Params: PointShopParams }>('/api/point-shops/:pointShopId', { preHandler: [authenticate] }, async (request, reply) => {
    await deletePointShop(request.params.pointShopId, request.user!.id, request.user!.role === 'admin');
    return reply.code(204).send();
  });
}
