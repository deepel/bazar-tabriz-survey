import { createHash } from 'crypto';
import proj4 from 'proj4';
import turfCenterOfMass from '@turf/center-of-mass';
import turfDistance from '@turf/distance';

// Well known UTM zones covering Iran.
const PROJ_DEFS: Record<number, string> = {
  32638: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs',
  32639: '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs',
  32640: '+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs'
};
for (const [code, def] of Object.entries(PROJ_DEFS)) {
  if (!proj4.defs(`EPSG:${code}`)) {
    proj4.defs(`EPSG:${code}`, def);
  }
}

export interface LatLng {
  lat: number;
  lon: number;
}

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export type GeometryLike = {
  type: string;
  coordinates: unknown;
};

/**
 * Extracts the EPSG code from a GeoJSON `crs` member such as
 * "urn:ogc:def:crs:EPSG::32638". Returns 4326 when absent.
 */
export function crsEpsgFromGeoJson(gj: { crs?: { properties?: { name?: string } } }): number {
  const name = gj.crs?.properties?.name;
  if (typeof name === 'string') {
    const m = name.match(/EPSG::?(\d+)/i);
    if (m) return Number.parseInt(m[1], 10);
  }
  return 4326;
}

/**
 * Converts a full GeoJSON geometry from `sourceEpsg` to WGS84 (EPSG:4326).
 * The source files are AutoCAD exports in EPSG:32638 (UTM zone 38N); browser
 * GPS and Leaflet always use EPSG:4326 (lon/lat), so every geometry stored in
 * the database and returned to the map is WGS84.
 */
export function toWgs84Geometry(
  geometry: { type: string; coordinates: unknown },
  sourceEpsg: number
): { type: string; coordinates: unknown } {
  if (!sourceEpsg || sourceEpsg === 4326) return geometry;
  const from = `EPSG:${sourceEpsg}`;
  if (!proj4.defs(from)) {
    throw new Error(`CRS "${from}" is not supported`);
  }
  // Geometry types accepted by this importer.
  const convert = (coords: unknown): unknown => {
    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      const [x, y] = proj4(from, 'EPSG:4326', [coords[0], coords[1]]);
      return [x, y];
    }
    if (Array.isArray(coords)) return coords.map(convert);
    return coords;
  };
  return { type: geometry.type, coordinates: convert(geometry.coordinates) };
}

/**
 * Deterministic SHA-256 fingerprint of a geometry, computed over a
 * canonical (key-sorted) JSON serialization. Two geometries that only differ
 * in JSON key order or irrelevant whitespace produce the same fingerprint.
 */
export function geometryFingerprint(geometry: { type: string; coordinates: unknown }): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(geometry))).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

/**
 * Representative point (center of mass) for a polygon geometry.
 * Returns [lon, lat] coordinates.
 */
export function geometryCentroid(geometry: GeometryLike): LatLng {
  const feature = { type: 'Feature', properties: {}, geometry };
  const center = turfCenterOfMass(feature as never);
  const [lon, lat] = center.geometry.coordinates;
  return { lat, lon };
}

/** Bounding box (lon/lat) of a polygon geometry. */
export function geometryBBox(geometry: GeometryLike): BBox {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const lon = coords[0];
      const lat = coords[1];
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    if (Array.isArray(coords)) coords.forEach(visit);
  };
  visit(geometry.coordinates);
  return { minLon, minLat, maxLon, maxLat };
}

/** Spherical distance between two points in meters (Turf). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const from = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [a.lon, a.lat] } };
  const to = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [b.lon, b.lat] } };
  return turfDistance(from as never, to as never, { units: 'meters' });
}

/** Acceptable GeoJSON geometry types for shops. */
export function isSupportedGeometry(geometry: unknown): geometry is GeometryLike {
  if (!geometry || typeof geometry !== 'object') return false;
  const g = geometry as { type?: unknown; coordinates?: unknown };
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return false;
  if (!Array.isArray(g.coordinates)) return false;
  // Cheap sanity check: dig to the innermost array and require number pairs.
  const firstPoint = (coords: unknown, depth: number): boolean => {
    if (!Array.isArray(coords) || coords.length === 0) return false;
    const head = coords[0];
    if (Array.isArray(head)) return firstPoint(head, depth + 1);
    return depth >= 2 && typeof head === 'number' && typeof coords[1] === 'number';
  };
  return firstPoint(g.coordinates, 0);
}