import { describe, expect, it } from 'vitest';
import {
  crsEpsgFromGeoJson,
  geometryBBox,
  geometryCentroid,
  geometryFingerprint,
  isSupportedGeometry,
  toWgs84Geometry
} from '../utils/geo';

const square = {
  type: 'Polygon',
  coordinates: [
    [
      [46.29, 38.07],
      [46.290005, 38.07],
      [46.290005, 38.070005],
      [46.29, 38.070005],
      [46.29, 38.07]
    ]
  ]
};

describe('geo utils', () => {
  it('extracts the EPSG code from the crs member', () => {
    expect(
      crsEpsgFromGeoJson({ crs: { properties: { name: 'urn:ogc:def:crs:EPSG::32638' } } })
    ).toBe(32638);
    expect(crsEpsgFromGeoJson({ crs: { properties: { name: 'EPSG:32638' } } })).toBe(32638);
    expect(crsEpsgFromGeoJson({})).toBe(4326);
  });

  it('fingerprints are stable and key-order independent', () => {
    const reordered = {
      coordinates: square.coordinates,
      type: 'Polygon'
    };
    expect(geometryFingerprint(square)).toBe(geometryFingerprint(reordered));
    const other = { ...square, coordinates: [[...square.coordinates[0]]] };
    (other.coordinates[0] as number[][])[0] = [46.31, 38.07];
    expect(geometryFingerprint(square)).not.toBe(geometryFingerprint(other));
  });

  it('passes WGS84 through unmodified', () => {
    expect(toWgs84Geometry(square, 4326)).toBe(square);
  });

  it('converts EPSG:32638 UTM coordinates to WGS84 near Tabriz', () => {
    const utm = { type: 'Point', coordinates: [613550, 4215600] };
    const wgs = toWgs84Geometry(utm, 32638);
    const [lon, lat] = wgs.coordinates as [number, number];
    expect(lon).toBeGreaterThan(46.2);
    expect(lon).toBeLessThan(46.4);
    expect(lat).toBeGreaterThan(38.0);
    expect(lat).toBeLessThan(38.2);
  });

  it('computes the centroid within the geometry bounds', () => {
    const c = geometryCentroid(square);
    expect(c.lat).toBeGreaterThan(38.07);
    expect(c.lat).toBeLessThan(38.070005);
    expect(c.lon).toBeGreaterThan(46.29);
    expect(c.lon).toBeLessThan(46.290005);
  });

  it('computes the bbox correctly', () => {
    const b = geometryBBox(square);
    expect(b).toEqual({ minLon: 46.29, minLat: 38.07, maxLon: 46.290005, maxLat: 38.070005 });
  });

  it('only accepts Polygon/MultiPolygon geometries', () => {
    expect(isSupportedGeometry(square)).toBe(true);
    expect(isSupportedGeometry({ type: 'MultiPolygon', coordinates: [[square.coordinates]] })).toBe(true);
    expect(isSupportedGeometry({ type: 'LineString', coordinates: [[1, 2], [3, 4]] })).toBe(false);
    expect(isSupportedGeometry({ type: 'Point', coordinates: [1, 2] })).toBe(false);
    expect(isSupportedGeometry(null)).toBe(false);
  });
});