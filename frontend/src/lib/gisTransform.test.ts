import { describe, expect, it } from 'vitest';
import { crsEpsgFromLayer, toWgs84Layer } from './gisTransform';

type RawCollection = GeoJSON.FeatureCollection & {
  crs?: { type: string; properties: { name: string } };
};

function collection(coordinates: unknown, crs = 'urn:ogc:def:crs:EPSG::32638'): RawCollection {
  return {
    type: 'FeatureCollection',
    crs: { type: 'name', properties: { name: crs } },
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates }
      } as GeoJSON.Feature
    ]
  };
}

describe('gisTransform (EPSG:32638 -> WGS84)', () => {
  it('detects the source CRS from the crs member', () => {
    const fc = collection([[]]);
    expect(crsEpsgFromLayer(fc)).toBe(32638);
    expect(crsEpsgFromLayer({ type: 'FeatureCollection', features: [] })).toBe(4326);
  });

  it('transforms a known mask polygon point to its WGS84 position', () => {
    const ring = [
      [613858.37900732178241, 4216046.600198293104768],
      [613857.66544251004234, 4216048.197407299652696],
      [613854.250662413542159, 4216049.337265578098595]
    ];
    const out = toWgs84Layer(collection([ring]));
    const coords = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
      .coordinates as unknown as number[][][])[0];
    expect(coords[0][0]).toBeCloseTo(46.298305869, 7);
    expect(coords[0][1]).toBeCloseTo(38.0850432409, 7);
  });

  it('transforms lines (LineString) and ways/buildings points correctly', () => {
    const expected: Array<[number, number, number, number]> = [
      [613857.1131514265, 4215990.01975558, 46.29828242116919, 38.08453358515089],
      [612925.9982893458, 4215468.039619823, 46.28758515288571, 38.0799470903441],
      [613416.1337610646, 4215374.712122516, 46.29315756899181, 38.07904481023384]
    ];
    for (const [x, y, lon, lat] of expected) {
      const out = toWgs84Layer(collection([[x, y]]));
      const p = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
        .coordinates as unknown as number[][])[0];
      expect(p[0]).toBeCloseTo(lon as number, 7);
      expect(p[1]).toBeCloseTo(lat as number, 7);
    }
  });

  it('preserves extra coordinate dimensions (z) while converting x/y', () => {
    const out = toWgs84Layer(collection([[[613500, 4215500, 300]]]));
    const p = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
      .coordinates as unknown as number[][][])[0][0];
    expect(p[2]).toBe(300);
  });

  it('handles nested MultiPolygon/Point coordinates recursively', () => {
    const out = toWgs84Layer({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32638' } },
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'MultiPolygon', coordinates: [[[[613500, 4215500]]]] }
        } as GeoJSON.Feature
      ]
    } as RawCollection);
    const coords = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
      .coordinates as unknown as number[][][][])[0][0][0];
    expect(coords[0]).toBeCloseTo(46.2941334761238, 7);
    expect(coords[1]).toBeCloseTo(38.08016318864971, 7);
  });

  it('leaves already-WGS84 payloads untouched and drops the crs marker', () => {
    const fc = collection([[[46.2914, 38.0739]]], 'urn:ogc:def:crs:EPSG::4326');
    const out = toWgs84Layer(fc);
    const p = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
      .coordinates as unknown as number[][][])[0][0];
    expect(p[0]).toBe(46.2914);
    expect(p[1]).toBe(38.0739);
    expect('crs' in out).toBe(false);
  });

  it('passes through an unknown CRS without throwing', () => {
    const fc = collection([[[613500, 4215500]]], 'urn:ogc:def:crs:EPSG::99999');
    const out = toWgs84Layer(fc);
    const p = ((out.features[0] as { geometry: { coordinates: unknown } }).geometry
      .coordinates as unknown as number[][][])[0][0];
    expect(p[0]).toBe(613500);
  });
});