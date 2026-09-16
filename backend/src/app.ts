import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config';
import { logger } from './logger';
import { pingDatabase } from './db';
import { registerAdminGeoJsonRoutes } from './routes/admin/geojson';
import { registerAdminGitHubRoutes } from './routes/admin/github';
import { registerAdminGisLayerRoutes } from './routes/admin/gis-layers';
import { registerGisLayerRoutes } from './routes/gis-layers';
import { registerAdminShopRoutes } from './routes/admin/shops';
import { registerAdminStatsRoutes } from './routes/admin/stats';
import { registerAdminSystemLogRoutes } from './routes/admin/system-logs';
import { registerAdminUserRoutes } from './routes/admin/users';
import { registerAuthRoutes } from './routes/auth';
import { registerMessageRoutes } from './routes/messages';
import { registerShopRoutes } from './routes/shops';
import { registerStatsAndOptions } from './routes/stats';
import { registerSurveyRoutes } from './routes/surveys';
import { AppError } from './utils/errors';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // structured logging handled by our logger
    bodyLimit: config.maxGeoJsonSize + 1024 * 1024,
    ignoreTrailingSlash: true
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true
  });

  app.setErrorHandler((err, request, reply) => {
    const requestDetails = {
      method: request.method,
      url: request.url,
      userId: request.user?.id,
      username: request.user?.username
    };
    if (err instanceof AppError) {
      logger.warn('http.error', { ...requestDetails, code: err.code, statusCode: err.statusCode });
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (err.statusCode === 400) {
      // Ajv validation error
      const first = err.validation?.[0];
      const message = first
        ? 'داده‌های ارسال‌شده معتبر نیست: ' + first.instancePath + ' ' + first.message
        : 'داده‌های ارسال‌شده معتبر نیست.';
      logger.warn('http.validation_failed', { ...requestDetails, statusCode: 400, message });
      return reply.code(400).send({ error: 'validation_failed', message });
    }
    if (err.statusCode === 413) {
      logger.warn('http.payload_too_large', { ...requestDetails, statusCode: 413 });
      return reply
        .code(413)
        .send({ error: 'payload_too_large', message: 'فایل ارسال‌شده بیش از حد بزرگ است.' });
    }
    logger.error('http.fatal', { ...requestDetails, message: err.message, statusCode: err.statusCode });
    return reply
      .code(500)
      .send({ error: 'internal_error', message: 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.' });
  });

  app.get('/api/health', async () => ({
    ok: true,
    db: await pingDatabase(),
    time: new Date().toISOString()
  }));

  registerAuthRoutes(app);
  registerStatsAndOptions(app);
  registerShopRoutes(app);
  registerSurveyRoutes(app);
  registerAdminUserRoutes(app);
  registerAdminStatsRoutes(app);
  registerAdminSystemLogRoutes(app);
  registerAdminShopRoutes(app);
  registerAdminGeoJsonRoutes(app);
  registerAdminGitHubRoutes(app);
  registerGisLayerRoutes(app);
  registerAdminGisLayerRoutes(app);
  registerMessageRoutes(app);

  return app;
}
