import { randomUUID } from 'crypto';
import { DOOR_TIME_PATTERN } from '../config';
import { pool } from '../db';
import { AppError } from '../utils/errors';

export interface DoorPointInput {
  longitude: number;
  latitude: number;
  name: string;
  opening_time: string;
  closing_time: string;
  notes?: string | null;
}

export interface DoorPointBounds {
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

export function validateDoorPointInput(input: DoorPointInput): DoorPointInput {
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new AppError(400, 'invalid_longitude', 'طول جغرافیایی معتبر نیست.');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new AppError(400, 'invalid_latitude', 'عرض جغرافیایی معتبر نیست.');
  }
  const name = cleanText(input.name);
  if (!name) throw new AppError(400, 'invalid_door_name', 'نام در را وارد کنید.');
  if (!DOOR_TIME_PATTERN.test(input.opening_time)) {
    throw new AppError(400, 'invalid_opening_time', 'ساعت باز شدن باید با قالب HH:mm باشد.');
  }
  if (!DOOR_TIME_PATTERN.test(input.closing_time)) {
    throw new AppError(400, 'invalid_closing_time', 'ساعت بسته شدن باید با قالب HH:mm باشد.');
  }
  return { ...input, name, notes: cleanText(input.notes) };
}

function mapDoorPoint(row: Record<string, any>) {
  return {
    door_point_id: row.door_point_id,
    geometry: row.geometry,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    name: row.name,
    opening_time: typeof row.opening_time === 'string' ? row.opening_time.slice(0, 5) : row.opening_time,
    closing_time: typeof row.closing_time === 'string' ? row.closing_time.slice(0, 5) : row.closing_time,
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
      door_point_id: row.door_point_id,
      name: row.name,
      opening_time: typeof row.opening_time === 'string' ? row.opening_time.slice(0, 5) : row.opening_time,
      closing_time: typeof row.closing_time === 'string' ? row.closing_time.slice(0, 5) : row.closing_time,
      notes: row.notes,
      created_by: row.created_by_username ?? null,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
    }
  };
}

export async function createDoorPoint(createdBy: number, rawInput: DoorPointInput) {
  const input = validateDoorPointInput(rawInput);
  const doorPointId = `door-${randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO door_points
       (door_point_id, geometry, longitude, latitude, name, opening_time, closing_time, notes, created_by)
     VALUES ($1, jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)), $2, $3, $4, $5::time, $6::time, $7, $8)
     RETURNING *`,
    [doorPointId, input.longitude, input.latitude, input.name, input.opening_time, input.closing_time, input.notes, createdBy]
  );
  return mapDoorPoint(result.rows[0]);
}

export async function getDoorPoint(doorPointId: string) {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM door_points p JOIN users u ON u.id = p.created_by
     WHERE p.door_point_id = $1`,
    [doorPointId]
  );
  if (!result.rowCount) throw new AppError(404, 'door_point_not_found', 'در بازار یافت نشد.');
  return mapDoorPoint(result.rows[0]);
}

async function getForMutation(doorPointId: string) {
  const result = await pool.query('SELECT * FROM door_points WHERE door_point_id = $1', [doorPointId]);
  if (!result.rowCount) throw new AppError(404, 'door_point_not_found', 'در بازار یافت نشد.');
  return result.rows[0] as Record<string, any>;
}

function assertCanMutate(row: Record<string, any>, userId: number, isAdmin: boolean) {
  if (!isAdmin && Number(row.created_by) !== userId) {
    throw new AppError(403, 'door_point_forbidden', 'فقط ایجادکننده یا مدیر می‌تواند این در را تغییر دهد.');
  }
}

export async function updateDoorPoint(
  doorPointId: string,
  userId: number,
  isAdmin: boolean,
  changes: Partial<DoorPointInput>
) {
  const current = await getForMutation(doorPointId);
  assertCanMutate(current, userId, isAdmin);
  const input = validateDoorPointInput({
    longitude: changes.longitude ?? Number(current.longitude),
    latitude: changes.latitude ?? Number(current.latitude),
    name: changes.name === undefined ? current.name : changes.name,
    opening_time: changes.opening_time ?? String(current.opening_time).slice(0, 5),
    closing_time: changes.closing_time ?? String(current.closing_time).slice(0, 5),
    notes: changes.notes === undefined ? current.notes : changes.notes
  });
  const result = await pool.query(
    `UPDATE door_points
     SET geometry = jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)),
         longitude = $2, latitude = $3, name = $4, opening_time = $5::time, closing_time = $6::time,
         notes = $7, updated_at = now()
     WHERE door_point_id = $1
     RETURNING *`,
    [doorPointId, input.longitude, input.latitude, input.name, input.opening_time, input.closing_time, input.notes]
  );
  return mapDoorPoint(result.rows[0]);
}

export async function deleteDoorPoint(doorPointId: string, userId: number, isAdmin: boolean): Promise<void> {
  const current = await getForMutation(doorPointId);
  assertCanMutate(current, userId, isAdmin);
  await pool.query('DELETE FROM door_points WHERE door_point_id = $1', [doorPointId]);
}

export async function listDoorPoints(bounds: DoorPointBounds = {}) {
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
     FROM door_points p JOIN users u ON u.id = p.created_by
     ${where}
     ORDER BY p.door_point_id
     LIMIT $${params.length}`,
    params
  );
  return { type: 'FeatureCollection', features: result.rows.map(toFeature) };
}

export async function buildDoorPointsGeoJson(): Promise<Record<string, unknown>> {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM door_points p JOIN users u ON u.id = p.created_by
     ORDER BY p.door_point_id`
  );
  return {
    type: 'FeatureCollection',
    name: 'bazar_tabriz_door_points',
    features: result.rows.map(toFeature)
  };
}
