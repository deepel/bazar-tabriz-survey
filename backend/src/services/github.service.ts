import { config } from '../config';
import { pool } from '../db';
import { logger } from '../logger';
import { AppError } from '../utils/errors';
import { buildGeoJson } from './export.service';

/**
 * GitHub is an optional backup/versioning mechanism, never the database.
 * Tokens stay on the backend and are read from environment variables only.
 */

function isConfigured(): boolean {
  return Boolean(
    config.github.token &&
      config.github.owner &&
      config.github.repository &&
      config.github.filePath
  );
}

async function getMeta(key: string): Promise<Record<string, unknown>> {
  const result = await pool.query('SELECT value FROM app_meta WHERE key = $1', [key]);
  if (!result.rowCount) return {};
  return result.rows[0].value;
}

async function setMeta(key: string, value: Record<string, unknown>): Promise<void> {
  await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

async function getCurrentFileSha(): Promise<string | null> {
  const url = `https://api.github.com/repos/${config.github.owner}/${config.github.repository}/contents/${encodeURIComponent(config.github.filePath)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.github.token}`,
      'User-Agent': 'bazar-tabriz-survey',
      Accept: 'application/vnd.github+json'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 300)}`);
  }
  const body = (await res.json()) as { sha?: string };
  return body.sha ?? null;
}

export async function syncToGitHub(): Promise<{ ok: boolean; message: string; committedSha?: string }> {
  if (!isConfigured()) {
    throw new AppError(
      400,
      'github_not_configured',
      'تنظیمات GitHub کامل نیست (نشانه، مالک، مخزن یا مسیر فایل خالی است).'
    );
  }

  logger.info('github.sync.started', { repository: config.github.repository });

  try {
    const geoJson = await buildGeoJson();
    const surveyed = (geoJson.features as Array<{ properties: { surveyed?: boolean } }>).filter(
      (f) => f.properties.surveyed
    ).length;

    const url = `https://api.github.com/repos/${config.github.owner}/${config.github.repository}/contents/${encodeURIComponent(config.github.filePath)}`;
    const currentSha = await getCurrentFileSha();

    const payload = {
      message: `Survey backup: ${surveyed} records completed`,
      content: Buffer.from(JSON.stringify(geoJson)).toString('base64'),
      ...(currentSha ? { sha: currentSha } : {})
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.github.token}`,
        'User-Agent': 'bazar-tabriz-survey',
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 300)}`);
    }

    const body = (await res.json()) as { content?: { sha?: string } };
    const committedSha = body.content?.sha;

    await setMeta('github.lastState', {
      ok: true,
      lastSyncedAt: new Date().toISOString(),
      surveyedRecords: surveyed,
      committedSha: committedSha ?? null
    });
    logger.info('github.sync.completed', { surveyed, committedSha });
    return { ok: true, message: 'همگام‌سازی با GitHub انجام شد.', committedSha };
  } catch (err) {
    await setMeta('github.lastState', {
      ok: false,
      lastErrorAt: new Date().toISOString(),
      error: (err as Error).message
    });
    logger.error('github.sync.failed', {
      repository: config.github.repository,
      message: (err as Error).message
    });
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'github_sync_failed', 'همگام‌سازی با GitHub ناموفق بود. داده‌ها در دیتابیس امن هستند.');
  }
}

export async function maybeAutoSync(): Promise<void> {
  const interval = config.github.syncInterval;
  if (!interval || interval <= 0 || !isConfigured()) return;

  const state = await getMeta('github.autoSync');
  const count = ((state.surveySaveCount as number) || 0) + 1;
  const lastSyncedCount = (state.lastSyncedCount as number) || 0;
  await setMeta('github.autoSync', { ...state, surveySaveCount: count });

  if (count % interval === 0 && count > lastSyncedCount) {
    await setMeta('github.autoSync', { ...state, surveySaveCount: count, lastSyncedCount: count });
    await syncToGitHub();
  }
}

export async function githubStatus(): Promise<Record<string, unknown>> {
  return {
    configured: isConfigured(),
    lastState: await getMeta('github.lastState'),
    autoSync: await getMeta('github.autoSync'),
    interval: config.github.syncInterval
  };
}