import type { GisLayer } from '../types';
import { readLayer, writeLayer } from './gisCache';
import { toWgs84Layer } from './gisTransform';

/**
 * Downloads, transforms (EPSG:32638 -> WGS84) and caches a layer's GeoJSON.
 *
 * - First load: fetch from `source_url`, transform once, store in the
 *   persistent cache, return.
 * - Later loads: read the cached WGS84 payload without any network.
 * - Offline with a valid cache entry: serve the cache.
 * - Offline with no cache entry: return null (the map simply skips the layer).
 *
 * `force` bypasses the cache (admin-triggered re-download).
 */
export async function loadLayerData(
  layer: GisLayer,
  force = false
): Promise<GeoJSON.FeatureCollection | null> {
  if (!force) {
    const cached = await readLayer(layer);
    if (cached) return cached;
  }
  try {
    const response = await fetch(layer.source_url, { credentials: 'omit' });
    if (!response.ok) return null;
    const raw = (await response.json()) as GeoJSON.FeatureCollection;
    const collection = toWgs84Layer(raw);
    await writeLayer(layer, collection);
    return collection;
  } catch {
    return null;
  }
}