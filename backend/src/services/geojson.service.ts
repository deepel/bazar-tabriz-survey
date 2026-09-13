import type { Pool, PoolClient } from 'pg';
import {
  crsEpsgFromGeoJson,
  geometryBBox,
  geometryCentroid,
  geometryFingerprint,
  isSupportedGeometry,
  toWgs84Geometry,
  type BBox,
  type GeometryLike,
  type LatLng
} from '../utils/geo';

export interface ImportFeature {
  index: number;
  shopId: string; // fingerprint of current geometry (immutable for new shops)
  handle: string | null;
  properties: Record<string, unknown>;
  geometry: GeometryLike; // already converted to WGS84
  centroid: LatLng;
  bbox: BBox;
  valid: boolean;
  errors: string[];
}

export interface ImportStats {
  totalFeatures: number;
  existingShops: number;
  newShops: number;
  geometryChanges: number;
  duplicateIds: number;
  missingIds: number;
  invalidGeometries: number;
  invalidFeatures: number;
  errors: Array<{ index: number; message: string }>;
}

export interface ImportAnalysis {
  stats: ImportStats;
  features: Array<{
    index: number;
    shopId: string;
    action: 'unchanged' | 'geometry_update' | 'new';
    targetShopId: string;
    handle: string | null;
    properties: Record<string, unknown>;
    geometryWgs84: GeometryLike;
    centroid: LatLng;
    bbox: BBox;
  }>;
}

export interface PreviewResult {
  previewId: string;
  filename: string;
  stats: ImportStats;
  errors: Array<{ index: number; message: string }>;
}

interface ExistingShop {
  shop_id: string;
  geom_fingerprint: string;
  entity_handle: string | null;
  centroid_lat: number;
  centroid_lon: number;
}

/**
 * Parses raw GeoJSON text, converts coordinates to WGS84 and fingerprints
 * every feature. Never touches the database.
 */
export function analyzeGeoJsonContent(content: string, sourceEpsg: number): ImportFeature[] {
  const parsed = safeJsonParse(content);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('فایل باید یک شیء JSON معتبر باشد.');
  }
  const gj = parsed as { type?: unknown; features?: unknown; crs?: unknown };
  if (gj.type !== 'FeatureCollection') {
    throw new Error('فایل باید یک GeoJSON از نوع FeatureCollection باشد.');
  }
  if (!Array.isArray(gj.features)) {
    throw new Error('ویژگی‌ها (features) در فایل موجود نیست.');
  }
  const epsg = crsEpsgFromGeoJson(gj as { crs?: { properties?: { name?: string } } });
  const useEpsg = epsg === 4326 ? epsg : sourceEpsg;

  const features: ImportFeature[] = [];
  gj.features.forEach((raw, index) => {
    const errors: string[] = [];
    const base: ImportFeature = {
      index,
      shopId: '',
      handle: null,
      properties: {},
      geometry: { type: 'Polygon', coordinates: [] },
      centroid: { lat: 0, lon: 0 },
      bbox: { minLon: 0, minLat: 0, maxLon: 0, maxLat: 0 },
      valid: false,
      errors
    };
    if (typeof raw !== 'object' || raw === null || (raw as { type?: unknown }).type !== 'Feature') {
      errors.push('این آیتم یک Feature معتبر نیست.');
      features.push(base);
      return;
    }
    const geometry = (raw as { geometry?: unknown }).geometry;
    if (!isSupportedGeometry(geometry)) {
      errors.push('هندسه باید از نوع Polygon یا MultiPolygon باشد.');
      features.push(base);
      return;
    }
    let wgs84: GeometryLike;
    try {
      wgs84 = toWgs84Geometry(geometry, useEpsg) as GeometryLike;
    } catch (err) {
      errors.push(`ناتوان در تبدیل مختصات: ${(err as Error).message}`);
      features.push(base);
      return;
    }
    const props = ((raw as { properties?: unknown }).properties || {}) as Record<string, unknown>;
    const handle = typeof props.EntityHandle === 'string' && props.EntityHandle ? props.EntityHandle : null;
    base.shopId = geometryFingerprint(wgs84);
    base.handle = handle;
    base.properties = props;
    base.geometry = wgs84;
    base.centroid = geometryCentroid(wgs84);
    base.bbox = geometryBBox(wgs84);
    base.valid = true;
    features.push(base);
  });

  return features;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('فایل GeoJSON دورریخته و غیرقابل خواندن است. لطفاً یک فایل معتبر انتخاب کنید.');
  }
}

/** Builds the set of counters shown in the import preview (no DB writes). */
export function analyzeFeatures(
  features: ImportFeature[],
  existing: Map<string, ExistingShop>,
  matchDistanceMeters: number
): ImportAnalysis {
  const stats: ImportStats = {
    totalFeatures: features.length,
    existingShops: 0,
    newShops: 0,
    geometryChanges: 0,
    duplicateIds: 0,
    missingIds: 0,
    invalidGeometries: 0,
    invalidFeatures: 0,
    errors: [] as Array<{ index: number; message: string }>
  };

  const byFingerprint = new Map<string, ExistingShop>();
  for (const shop of existing.values()) byFingerprint.set(shop.geom_fingerprint, shop);

  const byHandle = new Map<string, ExistingShop[]>();
  for (const shop of existing.values()) {
    if (shop.entity_handle) {
      const list = byHandle.get(shop.entity_handle);
      if (list) list.push(shop);
      else byHandle.set(shop.entity_handle, [shop]);
    }
  }

  const seenFingerprints = new Set<string>();
  const assigned: ImportAnalysis['features'] = [];

  for (const feature of features) {
    if (!feature.valid) {
      stats.invalidFeatures += 1;
      stats.invalidGeometries += 1;
      stats.missingIds += 1;
      stats.errors.push({ index: feature.index, message: feature.errors.join(' ') });
      continue;
    }
    if (seenFingerprints.has(feature.shopId)) {
      stats.duplicateIds += 1;
      stats.invalidFeatures += 1;
      stats.errors.push({
        index: feature.index,
        message: 'ویژگی تکراری در فایل: شناسه (هندسه) یکسان با یکی از ویژگی‌های قبلی است.'
      });
      continue;
    }
    seenFingerprints.add(feature.shopId);

    const exact = byFingerprint.get(feature.shopId);
    if (exact) {
      stats.existingShops += 1;
      assigned.push({
        index: feature.index,
        shopId: feature.shopId,
        action: 'unchanged',
        targetShopId: exact.shop_id,
        handle: feature.handle,
        properties: feature.properties,
        geometryWgs84: feature.geometry,
        centroid: feature.centroid,
        bbox: feature.bbox
      });
      continue;
    }

    // No exact fingerprint match: the same AutoCAD handle located within
    // `matchDistanceMeters` is treated as the same shop with updated geometry.
    let updatedTarget: ExistingShop | null = null;
    if (feature.handle) {
      const candidates = byHandle.get(feature.handle);
      if (candidates && candidates.length) {
        let bestDist = Infinity;
        let best: ExistingShop | null = null;
        for (const cand of candidates) {
          const d = haversine(feature.centroid, { lat: cand.centroid_lat, lon: cand.centroid_lon });
          if (d < bestDist) {
            bestDist = d;
            best = cand;
          }
        }
        if (best && bestDist <= matchDistanceMeters) updatedTarget = best;
      }
    }

    if (updatedTarget) {
      stats.existingShops += 1;
      stats.geometryChanges += 1;
      assigned.push({
        index: feature.index,
        shopId: feature.shopId,
        action: 'geometry_update',
        targetShopId: updatedTarget.shop_id,
        handle: feature.handle,
        properties: feature.properties,
        geometryWgs84: feature.geometry,
        centroid: feature.centroid,
        bbox: feature.bbox
      });
      continue;
    }

    stats.newShops += 1;
    assigned.push({
      index: feature.index,
      shopId: feature.shopId,
      action: 'new',
      targetShopId: feature.shopId,
      handle: feature.handle,
      properties: feature.properties,
      geometryWgs84: feature.geometry,
      centroid: feature.centroid,
      bbox: feature.bbox
    });
  }

  return { stats, features: assigned };
}

export async function loadShopIndex(client: Pool | PoolClient): Promise<Map<string, ExistingShop>> {
  const result = await client.query<ExistingShop>(
    'SELECT shop_id, geom_fingerprint, entity_handle, centroid_lat, centroid_lon FROM shops'
  );
  const map = new Map<string, ExistingShop>();
  for (const row of result.rows) map.set(row.shop_id, row);
  return map;
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}