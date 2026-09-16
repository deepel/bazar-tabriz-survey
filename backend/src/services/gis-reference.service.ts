import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { crsEpsgFromGeoJson, toWgs84Geometry } from '../utils/geo';
import type { GisLayerRow } from './gis-layers.service';

type Point = [number, number];
type Geometry = { type: string; coordinates: unknown };
type ReferenceFeature = {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: Geometry | null;
  _bbox?: BBox;
};
type ReferenceCollection = { type: 'FeatureCollection'; features: ReferenceFeature[] };
export interface BBox { minLon: number; minLat: number; maxLon: number; maxLat: number }

const materializing = new Map<string, Promise<ReferenceCollection>>();

function safeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function versionDir(layer: GisLayerRow): string {
  return path.join(config.gisCacheDir, safeKey(layer.layer_key), String(layer.cache_version));
}

function dataPath(layer: GisLayerRow): string {
  return path.join(versionDir(layer), 'normalized.json');
}

function point(value: unknown): value is Point {
  return Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number';
}

function bboxForCoordinates(coords: unknown): BBox | null {
  const box: BBox = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
  let found = false;
  const visit = (value: unknown) => {
    if (point(value)) {
      found = true;
      box.minLon = Math.min(box.minLon, value[0]);
      box.maxLon = Math.max(box.maxLon, value[0]);
      box.minLat = Math.min(box.minLat, value[1]);
      box.maxLat = Math.max(box.maxLat, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  visit(coords);
  return found ? box : null;
}

function intersects(a: BBox, b: BBox): boolean {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

function simplifyLine(input: Point[], tolerance: number): Point[] {
  if (input.length <= 2) return input;
  const sqTolerance = tolerance * tolerance;
  const sqSegmentDistance = (p: Point, a: Point, b: Point) => {
    let x = a[0];
    let y = a[1];
    let dx = b[0] - x;
    let dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x;
    dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const simplify = (points: Point[], first: number, last: number, keep: boolean[]) => {
    let maxSq = sqTolerance;
    let index = 0;
    for (let i = first + 1; i < last; i += 1) {
      const sq = sqSegmentDistance(points[i], points[first], points[last]);
      if (sq > maxSq) { index = i; maxSq = sq; }
    }
    if (index) {
      keep[index] = true;
      simplify(points, first, index, keep);
      simplify(points, index, last, keep);
    }
  };
  const keep = new Array<boolean>(input.length).fill(false);
  keep[0] = true;
  keep[input.length - 1] = true;
  simplify(input, 0, input.length - 1, keep);
  return input.filter((_, index) => keep[index]);
}

function simplifyCoordinates(coords: unknown, tolerance: number): unknown {
  if (!Array.isArray(coords) || coords.length === 0) return coords;
  if (point(coords[0])) return simplifyLine(coords as Point[], tolerance);
  return coords.map((item) => simplifyCoordinates(item, tolerance));
}

function lineParts(geometry: Geometry | null): Point[][] {
  if (!geometry) return [];
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates as Point[]];
  }
  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates as Point[][];
  }
  return [];
}

function normalizeFeature(raw: any, epsg: number): ReferenceFeature | null {
  if (!raw || raw.type !== 'Feature' || !raw.geometry?.type) return null;
  const converted = toWgs84Geometry(raw.geometry, epsg) as Geometry;
  const bbox = bboxForCoordinates(converted.coordinates);
  if (!bbox) return null;
  return { type: 'Feature', properties: {}, geometry: converted, _bbox: bbox };
}

async function fetchAndMaterialize(layer: GisLayerRow): Promise<ReferenceCollection> {
  const response = await fetch(layer.source_url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`منبع لایه با وضعیت ${response.status} پاسخ داد.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > config.gisSourceMaxBytes) {
    throw new Error(`حجم فایل لایه از حد مجاز ${Math.floor(config.gisSourceMaxBytes / 1_000_000)} مگابایت بیشتر است.`);
  }
  let raw: any;
  try { raw = JSON.parse(buffer.toString('utf8')); }
  catch { throw new Error('منبع لایه یک GeoJSON معتبر نیست.'); }
  if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new Error('منبع لایه باید FeatureCollection باشد.');
  }
  const epsg = crsEpsgFromGeoJson(raw);
  const features = raw.features.map((feature: unknown) => normalizeFeature(feature, epsg)).filter(Boolean) as ReferenceFeature[];
  const collection: ReferenceCollection = { type: 'FeatureCollection', features };
  const dir = versionDir(layer);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${dataPath(layer)}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(collection), 'utf8');
  await fs.rename(tmp, dataPath(layer));
  return collection;
}

async function readMaterialized(layer: GisLayerRow): Promise<ReferenceCollection | null> {
  try { return JSON.parse(await fs.readFile(dataPath(layer), 'utf8')) as ReferenceCollection; }
  catch { return null; }
}

export async function materializeGisLayer(layer: GisLayerRow): Promise<ReferenceCollection> {
  const key = `${layer.layer_key}:${layer.cache_version}:${layer.source_url}`;
  const existing = materializing.get(key);
  if (existing) return existing;
  const task = (async () => (await readMaterialized(layer)) ?? fetchAndMaterialize(layer))();
  materializing.set(key, task);
  try { return await task; }
  finally { materializing.delete(key); }
}

export async function queryGisLayer(
  layer: GisLayerRow,
  bbox: BBox | null,
  zoom: number
): Promise<ReferenceCollection & { deferred?: boolean; truncated?: boolean }> {
  if (zoom < layer.min_zoom) return { type: 'FeatureCollection', features: [], deferred: true };
  const collection = await materializeGisLayer(layer);
  const tolerance = zoom >= layer.detail_zoom
    ? 0
    : Math.max(0.000003, 0.00018 / Math.pow(2, Math.max(0, zoom - 14)));
  const candidates = collection.features.filter(
    (feature) => !bbox || (feature._bbox && intersects(feature._bbox, bbox))
  );
  // Lines are display-only. Merge visible line segments into one
  // MultiLineString so Leaflet creates one path instead of thousands of SVG
  // elements. No shop data goes through this branch.
  if (layer.layer_key === 'lines') {
    const coordinates = candidates.flatMap((feature) =>
      lineParts(feature.geometry).map((line) =>
        tolerance > 0 ? simplifyLine(line, tolerance) : line
      )
    );
    return {
      type: 'FeatureCollection',
      features: coordinates.length > 0
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } }]
        : [],
      truncated: false
    };
  }
  const features = candidates.slice(0, 20_000).map((feature) => ({
    type: 'Feature' as const,
    properties: feature.properties,
    geometry: tolerance > 0 && feature.geometry
      ? { ...feature.geometry, coordinates: simplifyCoordinates(feature.geometry.coordinates, tolerance) }
      : feature.geometry
  }));
  return { type: 'FeatureCollection', features, truncated: candidates.length > features.length };
}
