import { pool } from '../db';
import { AppError } from '../utils/errors';

export interface GisLayerRow {
  layer_key: string;
  display_name: string;
  enabled: boolean;
  source_url: string;
  order_index: number;
  cache_version: number;
  min_zoom: number;
  detail_zoom: number;
  updated_at: string;
}

export async function listGisLayers(): Promise<GisLayerRow[]> {
  const result = await pool.query(
    `SELECT layer_key, display_name, enabled, source_url, order_index, cache_version, min_zoom, detail_zoom, updated_at
     FROM gis_layers
     ORDER BY order_index, layer_key`
  );
  return result.rows;
}

export interface GisLayerPatch {
  display_name?: unknown;
  enabled?: unknown;
  source_url?: unknown;
  min_zoom?: unknown;
  detail_zoom?: unknown;
}

function normalizeDisplayName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AppError(400, 'invalid_display_name', 'نام نمایشی باید یک رشته باشد.');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(400, 'invalid_display_name', 'نام نمایشی نمی‌تواند خالی باشد.');
  }
  if (trimmed.length > 200) {
    throw new AppError(400, 'invalid_display_name', 'نام نمایشی بیش از حد طولانی است.');
  }
  return trimmed;
}

function normalizeEnabled(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new AppError(400, 'invalid_enabled', 'وضعیت فعال/غیرفعال باید true یا false باشد.');
  }
  return value;
}

function normalizeSourceUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new AppError(400, 'invalid_source_url', 'آدرس منبع باید یک رشته باشد.');
  }
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError(400, 'invalid_source_url', 'آدرس منبع معتبر نیست. از پیوند HTTPS کامل استفاده کنید.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(400, 'invalid_source_url', 'آدرس منبع باید با https:// (ترجیحاً) یا http:// آغاز شود.');
  }
  return trimmed;
}

function normalizeZoom(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 24) {
    throw new AppError(400, `invalid_${field}`, 'مقدار zoom باید عدد صحیحی بین ۰ و ۲۴ باشد.');
  }
  return Number(value);
}

export async function updateGisLayer(
  layerKey: string,
  patch: GisLayerPatch
): Promise<GisLayerRow> {
  const displayName = normalizeDisplayName(patch.display_name);
  const enabled = normalizeEnabled(patch.enabled);
  const sourceUrl = normalizeSourceUrl(patch.source_url);
  const minZoom = normalizeZoom(patch.min_zoom, 'min_zoom');
  const detailZoom = normalizeZoom(patch.detail_zoom, 'detail_zoom');

  if (displayName === undefined && enabled === undefined && sourceUrl === undefined && minZoom === undefined && detailZoom === undefined) {
    throw new AppError(400, 'empty_update', 'هیچ فیلدی برای ویرایش ارسال نشده است.');
  }

  const sets: string[] = [];
  const values: unknown[] = [layerKey];
  let index = 2;
  if (displayName !== undefined) {
    sets.push(`display_name = $${index++}`);
    values.push(displayName);
  }
  if (enabled !== undefined) {
    sets.push(`enabled = $${index++}`);
    values.push(enabled);
  }
  if (sourceUrl !== undefined) {
    sets.push(`source_url = $${index++}`);
    values.push(sourceUrl);
  }
  if (minZoom !== undefined) {
    sets.push(`min_zoom = $${index++}`);
    values.push(minZoom);
  }
  if (detailZoom !== undefined) {
    sets.push(`detail_zoom = $${index++}`);
    values.push(detailZoom);
  }
  sets.push(`updated_at = now()`);

  const result = await pool.query(
    `UPDATE gis_layers
     SET ${sets.join(', ')}
     WHERE layer_key = $1
     RETURNING layer_key, display_name, enabled, source_url, order_index, cache_version, min_zoom, detail_zoom, updated_at`,
    values
  );
  if (!result.rowCount) {
    throw new AppError(404, 'layer_not_found', 'لایه مورد نظر یافت نشد.');
  }
  return result.rows[0];
}

/** Bumps the cache version so clients re-download the layer data. */
export async function refreshGisLayer(layerKey: string): Promise<GisLayerRow> {
  const result = await pool.query(
    `UPDATE gis_layers
     SET cache_version = cache_version + 1, updated_at = now()
     WHERE layer_key = $1
     RETURNING layer_key, display_name, enabled, source_url, order_index, cache_version, min_zoom, detail_zoom, updated_at`,
    [layerKey]
  );
  if (!result.rowCount) {
    throw new AppError(404, 'layer_not_found', 'لایه مورد نظر یافت نشد.');
  }
  return result.rows[0];
}
