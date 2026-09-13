import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import { githubStatus, syncToGitHub } from '../../services/github.service';
import { sendFriendlyError } from '../../utils/errors';

export function registerAdminGitHubRoutes(app: FastifyInstance): void {
  app.post(
    '/api/admin/github/sync',
    { preHandler: [requireAdmin] },
    async (_request, reply) => {
      try {
        const result = await syncToGitHub();
        return reply.send(result);
      } catch (err) {
        sendFriendlyError(reply, err);
        return reply;
      }
    }
  );

  app.get(
    '/api/admin/github/status',
    { preHandler: [requireAdmin] },
    async () => githubStatus()
  );
}