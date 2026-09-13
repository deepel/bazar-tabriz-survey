import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'surveyor';
}

const SESSION_TTL_SECONDS = 12 * 60 * 60;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(user: AuthUser): string {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role },
    config.sessionSecret,
    { expiresIn: SESSION_TTL_SECONDS }
  );
}

export function verifySession(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.sessionSecret) as {
      sub: string;
      username: string;
      role: 'admin' | 'surveyor';
    };
    return {
      id: Number.parseInt(payload.sub, 10),
      username: payload.username,
      role: payload.role
    };
  } catch {
    return null;
  }
}

export const sessionCookieConfig = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.cookieSecure,
  path: '/',
  maxAge: SESSION_TTL_SECONDS
};

export const COOKIE_NAME = 'session';