import fs from 'fs/promises';
import path from 'path';
import { config } from './config';
import { pool } from './db';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof LEVELS)[number];
const logFile = path.resolve(__dirname, '..', 'logs', 'system.log');
const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'token', 'secret', 'content']);

function ts(): string {
  return new Date().toISOString();
}

function sanitize(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return '[redacted]';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item));
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(object).map(([name, item]) => [name, sanitize(item, name)]));
  }
  return value;
}

async function persist(level: LogLevel, event: string, details: Record<string, unknown>): Promise<void> {
  const safeDetails = sanitize(details) as Record<string, unknown>;
  const line = JSON.stringify({ time: ts(), level, event, ...safeDetails });
  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, `${line}\n`, 'utf8');
  } catch {
    // Logging must never take down the application.
  }
  try {
    await pool.query(
      'INSERT INTO system_logs (level, event, details) VALUES ($1, $2, $3::jsonb)',
      [level, event, JSON.stringify(safeDetails)]
    );
  } catch {
    // The DB may be unavailable during a crash; the file sink remains useful.
  }
}

function write(level: LogLevel, event: string, details: Record<string, unknown> = {}): void {
  const safeDetails = sanitize(details) as Record<string, unknown>;
  const line: Record<string, unknown> = { time: ts(), level, event, ...safeDetails };
  const out = JSON.stringify(line);
  if (level === 'error') process.stderr.write(out + '\n');
  else process.stdout.write(out + '\n');
  void persist(level, event, safeDetails);
}

export const logger = {
  debug: (event: string, details?: Record<string, unknown>) => write('debug', event, details),
  info: (event: string, details?: Record<string, unknown>) => write('info', event, details),
  warn: (event: string, details?: Record<string, unknown>) => write('warn', event, details),
  error: (event: string, details?: Record<string, unknown>) => write('error', event, details),
  filePath: logFile,
  levels: LEVELS,
  environment: config.nodeEnv
};
