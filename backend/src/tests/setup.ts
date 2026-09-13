// Test-worker setup: points the app at the isolated test database and clears
// GitHub/auto-sync so tests are hermetic. Must stay SYNCHRONOUS this is a
// plain vite setup file (CommonJS output, no top-level await). All DB work
// (migrate, users) happens in global-setup.ts instead.
import { config as loadEnv } from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FLAG = path.join(os.tmpdir(), 'bazar-survey-test-db.flag');

loadEnv({ path: path.join(ROOT, '.env') });

if (!fs.existsSync(FLAG)) {
  process.env.SURVEY_TEST_DB_AVAILABLE = '0';
} else {
  const base = process.env.DATABASE_URL || 'postgres://survey:survey@localhost:5432/bazar_survey';
  process.env.DATABASE_URL = base.replace(/\/[^/]+$/, '/bazar_survey_test');
  process.env.SESSION_SECRET = 'test-session-secret';
  process.env.GITHUB_SYNC_INTERVAL = '0';
  process.env.GITHUB_TOKEN = '';
  process.env.GITHUB_OWNER = '';
  process.env.GITHUB_REPOSITORY = '';
  process.env.GITHUB_FILE_PATH = 'bazar_tabriz_survey_test.json';
  process.env.SURVEY_TEST_DB_AVAILABLE = '1';
}