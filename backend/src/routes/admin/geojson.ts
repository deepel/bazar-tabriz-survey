import type { FastifyInstance } from 'fastify';
import { config } from '../../config';
import { requireAdmin } from '../../middleware/auth';
import { buildGeoJson } from '../../services/export.service';
import { applyImport, previewImport } from '../../services/import.service';
import { AppError, sendFriendlyError } from '../../utils/errors';

interface ImportBody {
  filename?: string;
  content?: string;
}

interface ApplyBody {
  previewId?: string;
  failAfterInsertCount?: number;
}

export function registerAdminGeoJsonRoutes(app: FastifyInstance): void {
  app.post<{ Body: ImportBody }>(
    '/api/admin/geojson/import/preview',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const filename = request.body?.filename || 'upload.geojson';
        const content = request.body?.content || '';
        if (!content.trim()) {
          throw new AppError(400, 'empty_geojson', 'فایل GeoJSON خالی است.');
        }
        const preview = await previewImport(filename, content);
        return reply.send(preview);
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );

  app.post<{ Body: ApplyBody }>(
    '/api/admin/geojson/import/apply',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      try {
        const previewId = request.body?.previewId;
        if (!previewId) {
          throw new AppError(400, 'missing_preview_id', 'شناسه پیش‌نمایش ارسال نشده است.');
        }
        const result = await applyImport(previewId, {
          failAfterInsertCount: request.body?.failAfterInsertCount
        });
        return reply.send({ ok: true, ...result });
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );

  app.get(
    '/api/admin/geojson/export',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const geoJson = await buildGeoJson();
      const download = (request.query as { download?: string }).download === '1';
      if (download) {
        reply.header(
          'Content-Disposition',
          `attachment; filename="bazar_tabriz_survey_${new Date().toISOString().slice(0, 10)}.geojson"`
        );
      }
      reply.header('Content-Type', 'application/geo+json; charset=utf-8');
      return reply.send(geoJson);
    }
  );
}