import type { GisLayer } from '../types';

/**
 * Persistent browser cache for the GIS reference layers.
 *
 * Uses Cache Storage (browser HTTP cache) so a layer is downloaded and
 * transformed exactly once and later visits reuse the stored payload, even
 * offline. Cache Storage is preferred over localStorage/cookies because it
 * can hold multi-megabyte GeoJSON bodies without string-size limits.
 *
 * Every cache key embeds the layer's source URL and version, so changing the
 * URL or an admin "refresh" bumps the key and forces a re-download; old
 * entries are evicted eagerly to avoid stale blobs.
 */
const CACHE_NAME = 'bazar-survey-gis-v1';
const CACHE_ORIGIN = 'https://gis-cache.local';
const CONFIG_URL = `${CACHE_ORIGIN}/config`;

function cacheAvailable(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function';
}

function entryUrl(layer: GisLayer): string {
  return `${CACHE_ORIGIN}/${encodeURIComponent(layer.layer_key)}/${encodeURIComponent(
    layer.source_url
  )}/${layer.cache_version}`;
}

function layerPrefixUrl(layerKey: string): string {
  return `${CACHE_ORIGIN}/${encodeURIComponent(layerKey)}/`;
}

async function readEntry(url: string): Promise<unknown | null> {
  if (!cacheAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(url);
    if (!response) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function readConfig(): Promise<GisLayer[] | null> {
  const value = await readEntry(CONFIG_URL);
  return Array.isArray(value) ? (value as GisLayer[]) : null;
}

export async function writeConfig(layers: GisLayer[]): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(CONFIG_URL, new Response(JSON.stringify(layers), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch {
    // Never crash the survey flow because of a cache write failure.
  }
}

/** Returns the cached (transformed, WGS84) layer payload, or null. */
export async function readLayer(layer: GisLayer): Promise<GeoJSON.FeatureCollection | null> {
  const value = await readEntry(entryUrl(layer));
  return value ? (value as GeoJSON.FeatureCollection) : null;
}

/** Stores a layer payload and evicts any older entry for the same layer. */
export async function writeLayer(
  layer: GisLayer,
  collection: GeoJSON.FeatureCollection
): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await evictLayer(layer.layer_key);
    await cache.put(entryUrl(layer), new Response(JSON.stringify(collection), {
      headers: { 'Content-Type': 'application/geo+json' }
    }));
  } catch {
    // Never crash the survey flow because of a cache write failure.
  }
}

/** Removes every cached entry belonging to a layer (URL or version change). */
export async function evictLayer(layerKey: string): Promise<void> {
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const prefix = layerPrefixUrl(layerKey);
    const stale = keys.filter((request) => request.url.startsWith(prefix));
    await Promise.all(stale.map((request) => cache.delete(request)));
  } catch {
    // Ignore failures; a later write still lands on the right key.
  }
}