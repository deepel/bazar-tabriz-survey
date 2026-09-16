import type { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  confirmPreview,
  createPreview,
  changeAssignmentStatus,
  listAssignmentHistory,
  listActiveAssignments,
  listSurveyors
} from '../services/assignment.service';
import { AppError } from '../utils/errors';

interface PreviewBody {
  requested_count?: number;
  member_ids?: number[];
  replace_preview_id?: string;
}

export function registerAssignmentRoutes(app: FastifyInstance): void {
  app.get('/api/assignment-surveyors', { preHandler: [authenticate] }, async () => ({
    surveyors: await listSurveyors()
  }));

  app.get('/api/assignments/active', { preHandler: [authenticate] }, async (request) => ({
    assignments: await listActiveAssignments(request.user!.id, request.user!.role)
  }));

  app.post<{ Body: PreviewBody }>(
    '/api/assignments/preview',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const body = request.body || {};
      if (!Array.isArray(body.member_ids)) {
        throw new AppError(400, 'missing_assignment_members', 'اعضای assignment ارسال نشده‌اند.');
      }
      const result = await createPreview(
        request.user!.id,
        Number(body.requested_count),
        body.member_ids,
        body.replace_preview_id
      );
      return reply.send(result);
    }
  );

  app.post<{ Body: { preview_id?: string } }>(
    '/api/assignments/confirm',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const previewId = request.body?.preview_id;
      if (!previewId) throw new AppError(400, 'missing_preview_id', 'شناسه پیش‌نمایش ارسال نشده است.');
      return reply.code(201).send(
        await confirmPreview(previewId, request.user!.id, request.user!.role)
      );
    }
  );

  app.get('/api/admin/assignments', { preHandler: [requireAdmin] }, async () => {
    return { assignments: await listAssignmentHistory() };
  });

  app.post<{ Params: { id: string }; Body: { status?: 'archived' | 'cancelled' } }>(
    '/api/admin/assignments/:id/status',
    { preHandler: [requireAdmin] },
    async (request) => {
      const status = request.body?.status;
      if (status !== 'archived' && status !== 'cancelled') {
        throw new AppError(400, 'invalid_assignment_status', 'وضعیت assignment معتبر نیست.');
      }
      return changeAssignmentStatus(request.params.id, status);
    }
  );
}
