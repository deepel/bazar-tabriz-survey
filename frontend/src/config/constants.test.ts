import { describe, expect, it } from 'vitest';
import { MAP, MAP_BOUNDS, TILE_MAX_NATIVE_ZOOM } from './constants';

describe('map zoom configuration (high-zoom fix)', () => {
  it('lets the map zoom beyond the OSM native zoom so tiles upscale, never blank', () => {
    // Standard OSM raster tiles stop at z19; the map may zoom to ~21-22.
    expect(TILE_MAX_NATIVE_ZOOM).toBe(19);
    expect(MAP.maxZoom).toBeGreaterThan(TILE_MAX_NATIVE_ZOOM);
    expect(MAP.maxZoom).toBeGreaterThanOrEqual(21);
  });

  it('keeps the sensible survey zoom range', () => {
    expect(MAP.minZoom).toBe(14);
    expect(MAP.initialZoom).toBeGreaterThanOrEqual(MAP.minZoom);
    expect(MAP.initialZoom).toBeLessThanOrEqual(MAP.maxZoom);
  });

  it('confines the map near the bazaar so it cannot be panned away', () => {
    const [[westSouthLat, westSouthLon], [eastNorthLat, eastNorthLon]] = MAP_BOUNDS;
    expect(westSouthLon).toBeLessThanOrEqual(46.15);
    expect(westSouthLat).toBeLessThanOrEqual(38.0);
    expect(eastNorthLon).toBeGreaterThanOrEqual(46.5);
    expect(eastNorthLat).toBeGreaterThanOrEqual(38.2);
    // The bazaar centre stays inside the bounds.
    expect(westSouthLon).toBeLessThan(46.2914);
    expect(eastNorthLon).toBeGreaterThan(46.2914);
  });
});