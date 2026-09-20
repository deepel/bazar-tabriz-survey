import fs from 'fs';
import path from 'path';
import { pool, withTransaction } from '../src/db';
import { logger } from '../src/logger';

/**
 * PRODUCTION data clean-up runner.
 *
 * Dry-run by default: prints the current row counts of every table that the
 * clean-up touches, so the operator can review exactly what would be removed.
 * Passing `--apply` executes backend/database/production-cleanup.sql inside a
 * single transaction and then prints the resulting counts.
 *
 * NEVER drops schema, NEVER touches schema_migrations or gis_* configuration.
 */

const CLEANUP_SQL = path.resolve(__dirname, 'production-cleanup.sql');

const COUNT_TABLES = [
  'users',
  'shops',
  'surveys',
  'point_shops',
  'service_points',
  'door_points',
  'assignments',
  'assignment_members',
  'assignment_shops',
  'assignment_previews',
  'messages',
  'system_logs',
  'app_meta'
];

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of COUNT_TABLES) {
    try {
      const res = await pool.query(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      out[table] = res.rows[0].n;
    } catch {
      out[table] = -1; // table absent in this database
    }
  }
  return out;
}

async function verifyEnvironment(): Promise<void> {
  const db = await pool.query('SELECT current_database() AS name, version() AS v');
  const migrations = await pool.query('SELECT COUNT(*)::int AS n FROM schema_migrations');
  const gis = await pool.query('SELECT COUNT(*)::int AS n FROM gis_layers');
  logger.info('production-cleanup.env', {
    database: db.rows[0].name,
    postgres: String(db.rows[0].v).split(' on ')[0],
    appliedMigrations: migrations.rows[0].n,
    gisLayers: gis.rows[0].n
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  await verifyEnvironment();

  const before = await tableCounts();
  const totals = Object.values(before).filter((n) => n > 0).reduce((a, b) => a + b, 0);
  logger.info('production-cleanup.summary', {
    mode: apply ? 'APPLY' : 'DRY-RUN',
    rowsThatWillBeRemoved: totals,
    counts: before
  });

  if (!apply) {
    logger.warn('production-cleanup.dry-run', {
      hint: 'Nothing was changed. Re-run with --apply to delete the rows above.'
    });
    await pool.end();
    return;
  }

  const sql = fs.readFileSync(CLEANUP_SQL, 'utf8');
  await withTransaction(async (client) => {
    await client.query(sql);
  });

  const after = await tableCounts();
  logger.info('production-cleanup.completed', {
    counts: after
  });
  await pool.end();
}

main().catch(async (err) => {
  logger.error('production-cleanup.failed', { message: (err as Error).message });
  await pool.end().catch(() => undefined);
  process.exit(1);
});