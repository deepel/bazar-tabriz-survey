import { logger } from '../logger';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function sendFriendlyError(reply: import('fastify').FastifyReply, err: unknown): void {
  if (err instanceof AppError) {
    logger.warn('http.error.handled', { code: err.code, statusCode: err.statusCode, message: err.message });
    reply.code(err.statusCode).send({ error: err.code, message: err.message });
    return;
  }
  logger.error('http.fatal.handled', { message: (err as Error)?.message || 'unknown_error' });
  reply.code(500).send({
    error: 'internal_error',
    message: 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.'
  });
}
