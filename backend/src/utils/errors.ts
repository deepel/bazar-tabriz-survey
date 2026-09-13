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
    reply.code(err.statusCode).send({ error: err.code, message: err.message });
    return;
  }
  reply.code(500).send({
    error: 'internal_error',
    message: 'خطای داخلی سرور رخ داد. لطفاً دوباره تلاش کنید.'
  });
}