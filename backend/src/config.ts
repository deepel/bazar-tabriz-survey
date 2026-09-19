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
  // Reference layers are fetched by the server and materialized outside the
  // shop import flow. A large lines layer must not change the shop contract.
  gisSourceMaxBytes: intEnv('GIS_SOURCE_MAX_BYTES', 250_000_000),
  gisCacheDir: path.resolve(__dirname, '..', 'gis-cache'),
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

export const FLOORS = ['ground_floor', 'basement', 'floor_1', 'floor_2'] as const;
export const FLOOR_LABELS: Record<(typeof FLOORS)[number], string> = {
  ground_floor: 'همکف',
  basement: 'زیرزمین',
  floor_1: 'طبقه ۱',
  floor_2: 'طبقه ۲'
};

export const INSTAGRAM_STATUSES = ['has', 'does_not_have', 'not_checked'] as const;
export const INSTAGRAM_STATUS_LABELS: Record<(typeof INSTAGRAM_STATUSES)[number], string> = {
  has: 'دارد',
  does_not_have: 'ندارد',
  not_checked: 'بررسی نشده'
};

export type Floor = (typeof FLOORS)[number];
export type InstagramStatus = (typeof INSTAGRAM_STATUSES)[number];

// Service points are deliberately a separate domain from point shops. Keep
// the active list centralized so adding a new service later does not require
// a schema migration or duplicated literals across routes and UI.
export const SERVICE_TYPES = ['toilet', 'prayer_room', 'mosque'] as const;
export const SERVICE_TYPE_LABELS: Record<(typeof SERVICE_TYPES)[number], string> = {
  toilet: 'سرویس بهداشتی',
  prayer_room: 'نمازخانه',
  mosque: 'مسجد'
};
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const DOOR_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Role = 'admin' | 'surveyor';
