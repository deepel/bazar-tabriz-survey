import { randomUUID } from 'crypto';
import { SERVICE_TYPES, type ServiceType } from '../config';
import { pool } from '../db';
import { AppError } from '../utils/errors';

export interface ServicePointInput {
  longitude: number;
  latitude: number;
  service_type: string;
  name?: string | null;
  notes?: string | null;
}

export interface ServicePointBounds {
  minLon?: number;
  minLat?: number;
  maxLon?: number;
  maxLat?: number;
  limit?: number;
}

function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

export function validateServicePointInput(input: ServicePointInput): ServicePointInput {
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new AppError(400, 'invalid_longitude', 'طول جغرافیایی معتبر نیست.');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new AppError(400, 'invalid_latitude', 'عرض جغرافیایی معتبر نیست.');
  }
  if (!SERVICE_TYPES.includes(input.service_type as ServiceType)) {
    throw new AppError(400, 'invalid_service_type', 'نوع خدمات انتخاب‌شده معتبر نیست.');
  }
  return {
    ...input,
    name: cleanText(input.name),
    notes: cleanText(input.notes)
  };
}

function mapServicePoint(row: Record<string, any>) {
  return {
    service_point_id: row.service_point_id,
    geometry: row.geometry,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    service_type: row.service_type,
    name: row.name,
    notes: row.notes,
    created_by: row.created_by,
    created_by_username: row.created_by_username ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

function toFeature(row: Record<string, any>) {
  return {
    type: 'Feature',
    geometry: row.geometry,
    properties: {
      service_point_id: row.service_point_id,
      service_type: row.service_type,
      name: row.name,
      notes: row.notes,
      created_by: row.created_by_username ?? null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
    }
  };
}

export async function createServicePoint(createdBy: number, rawInput: ServicePointInput) {
  const input = validateServicePointInput(rawInput);
  const servicePointId = `service-${randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO service_points
       (service_point_id, geometry, longitude, latitude, service_type, name, notes, created_by)
     VALUES ($1, jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)), $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [servicePointId, input.longitude, input.latitude, input.service_type, input.name, input.notes, createdBy]
  );
  return mapServicePoint(result.rows[0]);
}

export async function getServicePoint(servicePointId: string) {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM service_points p JOIN users u ON u.id = p.created_by
     WHERE p.service_point_id = $1`,
    [servicePointId]
  );
  if (!result.rowCount) throw new AppError(404, 'service_point_not_found', 'نقطه خدماتی یافت نشد.');
  return mapServicePoint(result.rows[0]);
}

async function getForMutation(servicePointId: string) {
  const result = await pool.query('SELECT * FROM service_points WHERE service_point_id = $1', [servicePointId]);
  if (!result.rowCount) throw new AppError(404, 'service_point_not_found', 'نقطه خدماتی یافت نشد.');
  return result.rows[0] as Record<string, any>;
}

function assertCanMutate(row: Record<string, any>, userId: number, isAdmin: boolean) {
  if (!isAdmin && Number(row.created_by) !== userId) {
    throw new AppError(403, 'service_point_forbidden', 'فقط ایجادکننده یا مدیر می‌تواند این نقطه را تغییر دهد.');
  }
}

export async function updateServicePoint(
  servicePointId: string,
  userId: number,
  isAdmin: boolean,
  changes: Partial<ServicePointInput>
) {
  const current = await getForMutation(servicePointId);
  assertCanMutate(current, userId, isAdmin);
  const input = validateServicePointInput({
    longitude: changes.longitude ?? Number(current.longitude),
    latitude: changes.latitude ?? Number(current.latitude),
    service_type: changes.service_type ?? current.service_type,
    name: changes.name === undefined ? current.name : changes.name,
    notes: changes.notes === undefined ? current.notes : changes.notes
  });
  const result = await pool.query(
    `UPDATE service_points
     SET geometry = jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)),
         longitude = $2, latitude = $3, service_type = $4, name = $5, notes = $6, updated_at = now()
     WHERE service_point_id = $1
     RETURNING *`,
    [servicePointId, input.longitude, input.latitude, input.service_type, input.name, input.notes]
  );
  return mapServicePoint(result.rows[0]);
}

export async function deleteServicePoint(servicePointId: string, userId: number, isAdmin: boolean): Promise<void> {
  const current = await getForMutation(servicePointId);
  assertCanMutate(current, userId, isAdmin);
  await pool.query('DELETE FROM service_points WHERE service_point_id = $1', [servicePointId]);
}

export async function listServicePoints(bounds: ServicePointBounds = {}) {
  const limit = Math.min(Math.max(bounds.limit ?? 2000, 1), 5000);
  const hasBounds = [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].every((value) => value !== undefined);
  const params: unknown[] = [];
  let where = '';
  if (hasBounds) {
    params.push(bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat);
    where = 'WHERE longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4';
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM service_points p JOIN users u ON u.id = p.created_by
     ${where}
     ORDER BY p.service_point_id
     LIMIT $${params.length}`,
    params
  );
  return {
    type: 'FeatureCollection',
    features: result.rows.map(toFeature)
  };
}

export async function buildServicePointsGeoJson(): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM service_points p JOIN users u ON u.id = p.created_by
     ORDER BY p.service_point_id`
  );
  return {
    type: 'FeatureCollection',
    name: 'bazar_tabriz_service_points',
    features: result.rows.map(toFeature)
  };
}
