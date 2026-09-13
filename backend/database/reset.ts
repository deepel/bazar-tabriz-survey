import { pool } from '../src/db';
import { logger } from '../src/logger';
import { migrate } from './migrate-lib';
import fs from 'fs';
import path from 'path';

const SEED_GEOJSON = path.resolve(__dirname, 'seed-data', 'shops_seed.geojson');

/** Drops all application data and re-applies migrations. */
async function run(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate();
  logger.info('db.reset.migrated');
  await pool.end();

  const { execSync } = await import('child_process');
  const seedTs = path.resolve(__dirname, 'seed.ts');
  // Re-run seeding in a fresh process so the pool lifecycle is simple.
  execSync(`node --import tsx "${seedTs}"`, { stdio: 'inherit' });
}

run().catch(async (err) => {
  logger.error('db.reset.failed', { message: (err as Error).message });
  await pool.end().catch(() => undefined);
  process.exit(1);
});