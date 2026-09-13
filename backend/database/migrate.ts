import { migrate } from './migrate-lib';
import { pool } from '../src/db';
import { logger } from '../src/logger';

migrate()
  .then(async () => {
    logger.info('migration.complete');
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('migration.failed', { message: (err as Error).message });
    await pool.end().catch(() => undefined);
    process.exit(1);
  });