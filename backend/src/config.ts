import path from 'path';
import { config as loadEnv } from 'dotenv';

// .env lives in the repository root (one level above backend/).
loadEnv({ path: path.resolve(__dirname, '..', '..', '.env') });

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: intEnv('PORT', 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://survey:survey@localhost:5432/bazar_survey',
  sessionSecret:
    process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim()),

  maxGeoJsonSize: intEnv('MAX_GEOJSON_SIZE', 50_000_000),
  // Default EPSG for the source AutoCAD-exported GeoJSON files.
  sourceEpsg: intEnv('SOURCE_EPSG', 32638),

  github: {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repository: process.env.GITHUB_REPOSITORY || '',
    filePath: process.env.GITHUB_FILE_PATH || 'bazar_tabriz_survey.json',
    syncInterval: intEnv('GITHUB_SYNC_INTERVAL', 20)
  }
};

export const ACTIVITIES = [
  'پوشاک',
  'کفش',
  'فرش',
  'صنایع دستی',
  'مواد غذایی',
  'طلا و جواهر',
  'لوازم خانگی',
  'خدمات',
  'سایر'
] as const;

export const BUILDING_CONDITIONS = [
  'سالم',
  'مرمت شده',
  'نیازمند مرمت',
  'نامناسب',
  'سایر'
] as const;

export type Role = 'admin' | 'surveyor';