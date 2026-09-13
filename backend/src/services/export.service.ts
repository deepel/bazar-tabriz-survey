import { pool } from '../db';

interface ExportRow {
  shop_id: string;
  geometry: Record<string, unknown>;
  original_properties: Record<string, unknown>;
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  username: string | null;
  surveyed_at: Date | null;
  survey_lat: number | null;
  survey_lon: number | null;
}

/**
 * Generates the current GeoJSON backup directly from the database.
 * Geometry is WGS84 (EPSG:4326). Survey attributes are merged on top of the
 * original GIS properties. Photos are not included (out of scope).
 */
export async function buildGeoJson(): Promise<Record<string, unknown>> {
  const result = await pool.query<ExportRow>(
    `SELECT
       s.shop_id,
       s.geometry,
       s.original_properties,
       sv.shop_name,
       sv.activity,
       sv.activity_other,
       sv.building_condition,
       sv.surveyed_at,
       sv.survey_lat,
       sv.survey_lon,
       u.username
     FROM shops s
     LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
     LEFT JOIN users u ON u.id = sv.surveyor_id
     ORDER BY s.shop_id`
  );

  const features = result.rows.map((row) => {
    const properties: Record<string, unknown> = { ...row.original_properties };
    properties.shop_id = row.shop_id;
    properties.shop_name = row.shop_name ?? null;
    properties.activity = row.activity ?? null;
    properties.activity_other = row.activity_other ?? null;
    properties.building_condition = row.building_condition ?? null;
    properties.surveyed = row.surveyed_at !== null;
    properties.surveyor_id = row.username ?? null;
    properties.surveyed_at = row.surveyed_at ? row.surveyed_at.toISOString() : null;
    properties.survey_lat = row.survey_lat ?? null;
    properties.survey_lon = row.survey_lon ?? null;

    return {
      type: 'Feature',
      properties,
      geometry: row.geometry
    };
  });

  return {
    type: 'FeatureCollection',
    name: 'bazar_tabriz_survey',
    crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
    features
  };
}