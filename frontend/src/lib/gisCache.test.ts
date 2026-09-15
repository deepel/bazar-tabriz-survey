import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GisLayer } from '../types';
import { evictLayer, readConfig, readLayer, writeConfig, writeLayer } from './gisCache';
import { loadLayerData } from './gisLayerData';

/** Minimal in-memory Cache Storage used in place of the browser API. */
function installFakeCaches(): Map<string, Response> {
  const store = new Map<string, Response>();
  const keyOf = (input: RequestInfo | URL): string => {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  };
  const cache = {
    async put(input: RequestInfo | URL, response: Response): Promise<void> {
      store.set(keyOf(input), response);
    },
    async match(input: RequestInfo | URL): Promise<Response | null> {
      const found = store.get(keyOf(input));
      return found ? found.clone() : null;
    },
    async keys(): Promise<Request[]> {
      return [...store.keys()].map((url) => new Request(url));
    },
    async delete(input: RequestInfo | URL): Promise<boolean> {
      return store.delete(keyOf(input));
    }
  };
  (globalThis as { caches?: unknown }).caches = { open: async () => cache };
  return store;
}

function layer(overrides: Partial<GisLayer> = {}): GisLayer {
  return {
    layer_key: 'lines',
    display_name: 'خطوط',
    enabled: true,
    source_url: 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/lines.geojson',
    order_index: 20,
    cache_version: 1,
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

type RawCollection = GeoJSON.FeatureCollection & {
  crs?: { type: string; properties: { name: string } };
};

function rawLayerCollection(marker = 613500): RawCollection {
  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32638' } },
    features: [
      {
        type: 'Feature',
        properties: { marker },
        geometry: { type: 'Point', coordinates: [marker, 4215500] }
      } as GeoJSON.Feature
    ]
  };
}

const cacheAvailable = (): boolean =>
  typeof (globalThis as unknown as { caches?: unknown }).caches !== 'undefined';

function removeCaches(): void {
  delete (globalThis as unknown as { caches?: unknown }).caches;
}

describe('GIS layer caching', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installFakeCaches();
  });

  it('does not crash when no Cache API is exposed (feature-detected)', () => {
    removeCaches();
    expect(cacheAvailable()).toBe(false);
  });

  it('downloads, transforms and caches once, then reuses the cache', async () => {
    const fetchMock = vi.fn(async (resource: RequestInfo | URL) => {
      const marker = typeof resource === 'string' && resource.includes('v2') ? 613900 : 613500;
      return new Response(JSON.stringify(rawLayerCollection(marker)), {
        status: 200,
        headers: { 'Content-Type': 'application/geo+json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadLayerData(layer());
    expect(first).not.toBeNull();
    const point = ((first as GeoJSON.FeatureCollection).features[0] as { geometry: { coordinates: number[] } })
      .geometry.coordinates;
    // UTM x=613500 must already be in WGS84 lon/lat.
    expect(point[0]).toBeCloseTo(46.2941334761238, 7);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second visit loads from cache: no network traffic, same (transformed) data.
    const second = await loadLayerData(layer());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('re-downloads when the admin changes the source URL (old entry evicted)', async () => {
    let served = 0;
    const fetchMock = vi.fn(async (_resource: RequestInfo | URL) => {
      served += 1;
      return new Response(
        JSON.stringify(rawLayerCollection(served === 1 ? 613500 : 613900)),
        { status: 200 }
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadLayerData(layer());
    const newLayer = layer({ source_url: 'https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/lines-v2.geojson' });
    const second = await loadLayerData(newLayer);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The old entry was evicted when the new URL was downloaded, so a single
    // fresh entry for the layer survives.
    const secondPoint = ((second as GeoJSON.FeatureCollection).features[0] as { geometry: { coordinates: number[] } })
      .geometry.coordinates;
    expect(secondPoint[0]).toBeCloseTo(46.298693, 5); // marker 613900 in WGS84

    const cache = await (globalThis as unknown as { caches: { open: () => Promise<{ keys: () => Promise<Request[]> }> } }).caches.open();
    const keys = await cache.keys();
    const layerEntries = keys.filter((k) => k.url.includes('/lines/'));
    expect(layerEntries).toHaveLength(1);
    expect(layerEntries[0].url).not.toContain(
      encodeURIComponent('https://raw.githubusercontent.com/deepel/bazar-tabriz-map-josn/main/lines.geojson')
    );
  });

  it('treats an admin refresh (cache_version bump) as an invalidation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(rawLayerCollection()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadLayerData(layer({ cache_version: 1 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate the map receiving a new config after the admin clicked refresh.
    const refreshedLayer = layer({ cache_version: 2 });
    await loadLayerData(refreshedLayer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serves the cached layer while offline', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(rawLayerCollection()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const first = await loadLayerData(layer());
    expect(first).not.toBeNull();

    // Go offline: only swap fetch; the cache store from beforeEach stays put.
    const offlineFetch = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', offlineFetch);

    const result = await loadLayerData(layer());
    expect(offlineFetch).not.toHaveBeenCalled();
    expect(result).toEqual(first);
  });

  it('returns null (no crash) when offline and there is no cache', async () => {
    vi.unstubAllGlobals();
    const offlineFetch = vi.fn(async () => Promise.reject(new TypeError('Failed to fetch')));
    vi.stubGlobal('fetch', offlineFetch);

    const result = await loadLayerData(layer());
    expect(result).toBeNull();
    expect(offlineFetch).toHaveBeenCalled();
  });

  it('lets evictLayer purge a layer so the next load downloads again', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(rawLayerCollection()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await loadLayerData(layer());
    expect(await readLayer(layer())).not.toBeNull();

    await evictLayer('lines');
    expect(await readLayer(layer())).toBeNull();

    await loadLayerData(layer());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('round-trips the cached config list used for offline layer discovery', async () => {
    const layers = [layer(), layer({ layer_key: 'ways', cache_version: 3 })];
    await writeConfig(layers);
    const cached = await readConfig();
    expect(cached).toEqual(layers);
  });

  it('stores nothing when Cache Storage is unavailable (no crash)', async () => {
    removeCaches();
    const collection = rawLayerCollection();
    await writeLayer(layer(), collection);
    await writeConfig([layer()]);
    // Feature-detected off; nothing to read.
    expect(await readLayer(layer())).toBeNull();
    expect(await readConfig()).toBeNull();
  });
});