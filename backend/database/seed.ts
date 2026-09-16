import fs from 'fs';
import path from 'path';
import { pool } from '../src/db';
import { hashPassword } from '../src/services/auth.service';
import { applyImport, previewImport } from '../src/services/import.service';
import { logger } from '../src/logger';
import { assignmentColorForUserId } from '../src/services/assignment.service';

/**
 * DEVELOPMENT seed. Never use these credentials in production:
 *   admin      / admin123      (role: admin)
 *   jafari     / jafari123     (role: surveyor)
 *   moradi     / moradi123     (role: surveyor)
 *   kamali     / kamali123     (role: surveyor)
 */
const SEED_USERS = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'jafari', password: 'jafari123', role: 'surveyor' },
  { username: 'moradi', password: 'moradi123', role: 'surveyor' },
  { username: 'kamali', password: 'kamali123', role: 'surveyor' }
];

const SEED_GEOJSON = path.resolve(__dirname, 'seed-data', 'shops_seed.geojson');

async function seedUsers(): Promise<void> {
  for (const user of SEED_USERS) {
    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
    if (existing.rowCount) {
      logger.info('seed.user.exists', { username: user.username });
      continue;
    }
    const hash = await hashPassword(user.password);
    await pool.query('INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3)', [
      user.username,
      hash,
      user.role
    ]);
    logger.info('seed.user.created', { username: user.username, role: user.role });
  }
    logger.warn('seed.credentials', {
    hint: 'Development only. Change passwords in backend/database/seed.ts before production.'
  });

  // Seeded users are inserted after migrations, so give them the same
  // deterministic distinct defaults that the migration gives existing users.
  const seeded = await pool.query<{ id: number; username: string }>(
    `SELECT id, username FROM users WHERE username = ANY($1::text[]) ORDER BY id`,
    [SEED_USERS.map((user) => user.username)]
  );
  for (const user of seeded.rows) {
    await pool.query('UPDATE users SET assignment_color = $1 WHERE id = $2 AND assignment_color = $3', [
      assignmentColorForUserId(user.id), user.id, '#2563eb'
    ]);
  }
}

async function seedShops(): Promise<void> {
  if (!fs.existsSync(SEED_GEOJSON)) {
    logger.warn('seed.shops.skipped', { reason: 'seed GeoJSON file missing' });
    return;
  }
  const result = await pool.query('SELECT COUNT(*)::int AS n FROM shops');
  if (result.rows[0].n > 0) {
    logger.info('seed.shops.skipped', { reason: 'shops already present', count: result.rows[0].n });
    return;
  }
  const content = fs.readFileSync(SEED_GEOJSON, 'utf8');
  const preview = await previewImport('shops_seed.geojson', content);
  const applied = await applyImport(preview.previewId);
  logger.info('seed.shops.imported', {
    total: applied.stats.totalFeatures,
    newShops: applied.stats.newShops
  });
}

async function run(): Promise<void> {
  await pool.query('SELECT 1');
  await seedUsers();
  await seedShops();
  logger.info('seed.complete');
  await pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  logger.error('seed.failed', { message: (err as Error).message });
  await pool.end().catch(() => undefined);
  process.exit(1);
});
