import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth';
import {
  createServicePoint,
  deleteServicePoint,
  getServicePoint,
  listServicePoints,
  type ServicePointInput,
  updateServicePoint
} from '../services/service-point.service';

interface ServicePointQuery { bbox?: string; limit?: string }
interface ServicePointParams { servicePointId: string }

const servicePointProperties = {
  longitude: { type: 'number' },
  latitude: { type: 'number' },
  service_type: { type: 'string' },
  name: { type: ['string', 'null'] },
  notes: { type: ['string', 'null'] }
} as const;

export function registerServicePointRoutes(app: FastifyInstance): void {
  app.get('/api/service-points', { preHandler: [authenticate] }, async (request) => {
    const query = request.query as ServicePointQuery;
    const parts = (query.bbox || '').split(',').map((value) => Number.parseFloat(value));
    const hasBbox = Boolean(query.bbox) && parts.length === 4 && parts.every(Number.isFinite);
    return listServicePoints({
      minLon: hasBbox ? parts[0] : undefined,
      minLat: hasBbox ? parts[1] : undefined,
      maxLon: hasBbox ? parts[2] : undefined,
      maxLat: hasBbox ? parts[3] : undefined,
      limit: Number.parseInt(query.limit || '2000', 10) || 2000
    });
  });

  app.post<{ Body: ServicePointInput }>(
    '/api/service-points',
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['longitude', 'latitude', 'service_type'],
          additionalProperties: false,
          properties: servicePointProperties
        }
      }
    },
    async (request, reply) => reply.code(201).send({ servicePoint: await createServicePoint(request.user!.id, request.body) })
  );

  app.get<{ Params: ServicePointParams }>(
    '/api/service-points/:servicePointId',
    { preHandler: [authenticate] },
    async (request) => ({ servicePoint: await getServicePoint(request.params.servicePointId) })
  );

  app.patch<{ Params: ServicePointParams; Body: Partial<ServicePointInput> }>(
    '/api/service-points/:servicePointId',
    {
      preHandler: [authenticate],
      schema: { body: { type: 'object', additionalProperties: false, properties: servicePointProperties } }
    },
    async (request) => ({
      servicePoint: await updateServicePoint(
        request.params.servicePointId,
        request.user!.id,
        request.user!.role === 'admin',
        request.body
      )
    })
  );

  app.delete<{ Params: ServicePointParams }>(
    '/api/service-points/:servicePointId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      await deleteServicePoint(request.params.servicePointId, request.user!.id, request.user!.role === 'admin');
      return reply.code(204).send();
    }
  );
}
