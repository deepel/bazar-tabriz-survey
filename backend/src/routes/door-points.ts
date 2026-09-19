import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import {
  createDoorPoint,
  deleteDoorPoint,
  getDoorPoint,
  listDoorPoints,
  type DoorPointInput,
  updateDoorPoint
} from '../services/door-point.service';

interface DoorPointQuery { bbox?: string; limit?: string }
interface DoorPointParams { doorPointId: string }

const doorPointProperties = {
  longitude: { type: 'number' }, latitude: { type: 'number' }, name: { type: 'string' },
  opening_time: { type: 'string' }, closing_time: { type: 'string' }, notes: { type: ['string', 'null'] }
} as const;

export function registerDoorPointRoutes(app: FastifyInstance): void {
  app.get('/api/door-points', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as DoorPointQuery;
    const parts = (query.bbox || '').split(',').map((value) => Number.parseFloat(value));
    const hasBbox = Boolean(query.bbox) && parts.length === 4 && parts.every(Number.isFinite);
    return listDoorPoints({
      minLon: hasBbox ? parts[0] : undefined, minLat: hasBbox ? parts[1] : undefined,
      maxLon: hasBbox ? parts[2] : undefined, maxLat: hasBbox ? parts[3] : undefined,
      limit: Number.parseInt(query.limit || '2000', 10) || 2000
    });
  });

  app.post<{ Body: DoorPointInput }>(
    '/api/door-points',
    {
      preHandler: [authenticate],
      schema: { body: { type: 'object', required: ['longitude', 'latitude', 'name', 'opening_time', 'closing_time'], additionalProperties: false, properties: doorPointProperties } }
    },
    async (request, reply) => reply.code(201).send({ doorPoint: await createDoorPoint(request.user!.id, request.body) })
  );

  app.get<{ Params: DoorPointParams }>('/api/door-points/:doorPointId', { preHandler: [authenticate] }, async (request) => ({ doorPoint: await getDoorPoint(request.params.doorPointId) }));

  app.patch<{ Params: DoorPointParams; Body: Partial<DoorPointInput> }>(
    '/api/door-points/:doorPointId',
    { preHandler: [authenticate], schema: { body: { type: 'object', additionalProperties: false, properties: doorPointProperties } } },
    async (request) => ({ doorPoint: await updateDoorPoint(request.params.doorPointId, request.user!.id, request.user!.role === 'admin', request.body) })
  );

  app.delete<{ Params: DoorPointParams }>('/api/door-points/:doorPointId', { preHandler: [authenticate] }, async (request, reply) => {
    await deleteDoorPoint(request.params.doorPointId, request.user!.id, request.user!.role === 'admin');
    return reply.code(204).send();
  });
}
