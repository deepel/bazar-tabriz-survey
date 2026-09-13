// Global test setup: provision an isolated `bazar_survey_test` database
// and record availability for the test workers. Runs in its own process, so
// the flag file is the only way to communicate with the workers.
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Pool } from 'pg';

const FLAG = path.join(os.tmpdir(), 'bazar-survey-test-db.flag');

async function provision(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

  const base =
    process.env.DATABASE_URL || 'postgres://survey:survey@localhost:5432/bazar_survey';

  // Superuser connection candidates to CREATE DATABASE / DROP SCHEMA.
  const candidates = [
    process.env.TEST_PG_ADMIN_URL,
    'postgres://postgres:postgres@localhost:5432/postgres',
    base.replace(/\/[^/]+$/, '/postgres').replace(/^postgres:\/\/[^:]+/, 'postgres://postgres')
  ].filter((u): u is string => Boolean(u));

  let admin: Pool | null = null;
  for (const candidate of candidates) {
    const probe = new Pool({ connectionString: candidate, max: 1 });
    try {
      await probe.query('SELECT 1');
      admin = probe;
      break;
    } catch {
      await probe.end().catch(() => undefined);
    }
  }

  if (!admin) {
    console.error('test.db.unavailable: could not connect to any PostgreSQL admin URL');
    return;
  }
  console.error('GLOBAL.ADMIN_OK base=' + base);
  console.error('GLOBAL.DATABASE_URL=' + process.env.DATABASE_URL);
  try {
    await admin.query('CREATE DATABASE bazar_survey_test');
    console.log('test.db.created');
  } catch (err) {
    if ((err as { code?: string }).code !== '42P04') throw err;
  }
  // Hand the database to the app user so it can manage its own schema
  // (PostgreSQL 15+ restricts CREATE on the public schema to the DB owner).
  const appUser = base.match(/^postgres:\/\/([^:]+):/)?.[1];
  if (appUser) {
    await admin.query('ALTER DATABASE bazar_survey_test OWNER TO ' + appUser);
  }
  await admin.end();

  const url = base.replace(/\/[^/]+$/, '/bazar_survey_test');
  const test = new Pool({ connectionString: url, max: 1 });
  try {
    await test.query('DROP SCHEMA public CASCADE');
    await test.query('CREATE SCHEMA public');
  } finally {
    await test.end();
  }

  // Point the app code at the test database, then run migrations and seed the
  // base users inside this (global) process. The worker setup file stays sync.
  process.env.DATABASE_URL = url;
  const { migrate } = await import('../../database/migrate-lib');
  const { pool } = await import('../db');
  const bcrypt = await import('bcryptjs');

  await migrate();

  const users = [
    { username: 'admin', password: 'admin123', role: 'admin' },
    { username: 'jafari', password: 'jafari123', role: 'surveyor' },
    { username: 'moradi', password: 'moradi123', role: 'surveyor' },
    { username: 'kamali', password: 'kamali123', role: 'surveyor' }
  ];
  for (const user of users) {
    const existing = await pool.query('SELECT 1 FROM users WHERE username = $1', [user.username]);
    if ((existing.rowCount ?? 0) > 0) continue;
    const hash = await bcrypt.hash(user.password, 10);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)', [
      user.username, hash, user.role
    ]);
  }

  await pool.query('TRUNCATE shops, surveys, app_meta RESTART IDENTITY CASCADE');
  await pool.end().catch(() => undefined);

  if (fs.existsSync(FLAG)) fs.unlinkSync(FLAG);
  fs.writeFileSync(FLAG, String(Date.now()));
}

export default function globalSetup(): Promise<void> {
  return provision();
}