import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_NAME, verifySession, type AuthUser } from '../services/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/** Reads and verifies the session cookie; returns the authenticated user or null. */
export function extractUser(request: FastifyRequest): AuthUser | null {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

export function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const user = extractUser(request);
  if (!user) {
    reply.code(401).send({ error: 'not_authenticated', message: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.' });
    return;
  }
  request.user = user;
  done();
}

export function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: (err?: Error) => void
): void {
  const user = extractUser(request);
  if (!user) {
    reply.code(401).send({ error: 'not_authenticated', message: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.' });
    return;
  }
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'forbidden', message: 'شما دسترسی مدیر را ندارید.' });
    return;
  }
  request.user = user;
  done();
}