import proj4 from 'proj4';

// Well-known UTM zones covering Iran. Source GeoJSON files are AutoCAD
// exports in EPSG:32638 (UTM zone 38N); the map itself always uses
// EPSG:4326 (lon/lat), so any declared non-4326 CRS is converted below.
const UTM_DEFS: Record<number, string> = {
  32638: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs',
  32639: '+proj=utm +zone=39 +datum=WGS84 +units=m +no_defs',
  32640: '+proj=utm +zone=40 +datum=WGS84 +units=m +no_defs'
};

export function ensureProjDefs(): void {
  for (const [code, def] of Object.entries(UTM_DEFS)) {
    if (!proj4.defs(`EPSG:${code}`)) {
      proj4.defs(`EPSG:${code}`, def);
    }
  }
}

/**
 * Extracts the EPSG code from a GeoJSON `crs` member such as
 * "urn:ogc:def:crs:EPSG::32638". Returns 4326 when the member is absent.
 */
export function crsEpsgFromLayer(gj: unknown): number {
  const properties = (gj as { crs?: { properties?: { name?: unknown } } }).crs?.properties;
  if (properties && typeof properties.name === 'string') {
    const m = properties.name.match(/EPSG::?(\d+)/i);
    if (m) return Number.parseInt(m[1], 10);
  }
  return 4326;
}

function transformCoords(coords: unknown): unknown {
  if (Array.isArray(coords)) {
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [x, y] = proj4('EPSG:32638', 'EPSG:4326', [coords[0], coords[1]]);
      const rest = coords.slice(2);
      return rest.length > 0 ? [x, y, ...rest] : [x, y];
    }
    return coords.map(transformCoords);
  }
  return coords;
}

/**
 * Converts a layer's coordinates to WGS84 (EPSG:4326). Layers already in
 * 4326 are returned unchanged (with the `crs` marker dropped), unknown CRS
 * declarations are passed through untouched rather than throwing.
 */
export function toWgs84Layer(input: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  ensureProjDefs();
  const epsg = crsEpsgFromLayer(input);
  if (epsg === 4326) {
    const { crs: _ignored, ...rest } = input as GeoJSON.FeatureCollection & { crs?: unknown };
    return rest as GeoJSON.FeatureCollection;
  }
  const from = `EPSG:${epsg}`;
  if (!proj4.defs(from)) return input;

  const features = (input.features as unknown as Array<Record<string, unknown>>).map(
    (feature) => {
      const geometry = feature.geometry as { type?: string; coordinates?: unknown } | null | undefined;
      if (!geometry) return feature;
      return {
        ...feature,
        geometry: {
          type: geometry.type ?? 'GeometryCollection',
          coordinates: transformCoords(geometry.coordinates)
        }
      };
    }
  );
  return { type: 'FeatureCollection', features } as unknown as GeoJSON.FeatureCollection;
}