import { randomUUID } from 'crypto';
import { pool } from '../db';
import { ACTIVITIES, BUILDING_CONDITIONS, FLOORS, INSTAGRAM_STATUSES } from '../config';
import { AppError } from '../utils/errors';

export interface PointShopInput {
  longitude: number;
  latitude: number;
  shop_name?: string | null;
  activity: string;
  activity_other?: string | null;
  building_condition: string;
  floor: string;
  instagram_status: string;
  phone?: string | null;
  notes?: string | null;
}

export interface PointShopBounds {
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

export function validatePointShopInput(input: PointShopInput): PointShopInput {
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new AppError(400, 'invalid_longitude', 'طول جغرافیایی معتبر نیست.');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new AppError(400, 'invalid_latitude', 'عرض جغرافیایی معتبر نیست.');
  }
  if (!ACTIVITIES.includes(input.activity as (typeof ACTIVITIES)[number])) {
    throw new AppError(400, 'invalid_activity', 'نوع فعالیت انتخاب‌شده معتبر نیست.');
  }
  if (input.activity === 'سایر' && !input.activity_other?.trim()) {
    throw new AppError(400, 'invalid_activity', 'لطفاً نوع فعالیت را در فیلد «سایر» وارد کنید.');
  }
  if (!BUILDING_CONDITIONS.includes(input.building_condition as (typeof BUILDING_CONDITIONS)[number])) {
    throw new AppError(400, 'invalid_condition', 'وضعیت ساختمان انتخاب‌شده معتبر نیست.');
  }
  if (!FLOORS.includes(input.floor as (typeof FLOORS)[number])) {
    throw new AppError(400, 'invalid_floor', 'موقعیت عمودی انتخاب‌شده معتبر نیست.');
  }
  if (!INSTAGRAM_STATUSES.includes(input.instagram_status as (typeof INSTAGRAM_STATUSES)[number])) {
    throw new AppError(400, 'invalid_instagram_status', 'وضعیت اینستاگرام انتخاب‌شده معتبر نیست.');
  }
  return {
    ...input,
    shop_name: cleanText(input.shop_name),
    activity_other: cleanText(input.activity_other),
    phone: cleanText(input.phone),
    notes: cleanText(input.notes)
  };
}

function mapPointShop(row: Record<string, any>) {
  return {
    point_shop_id: row.point_shop_id,
    geometry: row.geometry,
    longitude: Number(row.longitude),
    latitude: Number(row.latitude),
    shop_name: row.shop_name,
    activity: row.activity,
    activity_other: row.activity_other,
    building_condition: row.building_condition,
    floor: row.floor,
    instagram_status: row.instagram_status,
    phone: row.phone,
    notes: row.notes,
    created_by: row.created_by,
    created_by_username: row.created_by_username ?? null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

export async function createPointShop(createdBy: number, rawInput: PointShopInput) {
  const input = validatePointShopInput(rawInput);
  const pointShopId = `point-${randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO point_shops
       (point_shop_id, geometry, longitude, latitude, shop_name, activity, activity_other,
        building_condition, floor, instagram_status, phone, notes, created_by)
     VALUES ($1, jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)),
             $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      pointShopId, input.longitude, input.latitude, input.shop_name, input.activity,
      input.activity_other, input.building_condition, input.floor, input.instagram_status,
      input.phone, input.notes, createdBy
    ]
  );
  return mapPointShop(result.rows[0]);
}

export async function getPointShop(pointShopId: string) {
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM point_shops p JOIN users u ON u.id = p.created_by
     WHERE p.point_shop_id = $1`,
    [pointShopId]
  );
  if (!result.rowCount) throw new AppError(404, 'point_shop_not_found', 'مکان تکمیلی یافت نشد.');
  return mapPointShop(result.rows[0]);
}

async function getPointShopForMutation(pointShopId: string) {
  const result = await pool.query('SELECT * FROM point_shops WHERE point_shop_id = $1', [pointShopId]);
  if (!result.rowCount) throw new AppError(404, 'point_shop_not_found', 'مکان تکمیلی یافت نشد.');
  return result.rows[0] as Record<string, any>;
}

function assertCanMutate(row: Record<string, any>, userId: number, isAdmin: boolean) {
  if (!isAdmin && Number(row.created_by) !== userId) {
    throw new AppError(403, 'point_shop_forbidden', 'فقط ایجادکننده یا مدیر می‌تواند این مکان را تغییر دهد.');
  }
}

export async function updatePointShop(
  pointShopId: string,
  userId: number,
  isAdmin: boolean,
  changes: Partial<PointShopInput>
) {
  const current = await getPointShopForMutation(pointShopId);
  assertCanMutate(current, userId, isAdmin);
  const input = validatePointShopInput({
    longitude: changes.longitude ?? Number(current.longitude),
    latitude: changes.latitude ?? Number(current.latitude),
    shop_name: changes.shop_name === undefined ? current.shop_name : changes.shop_name,
    activity: changes.activity ?? current.activity,
    activity_other: changes.activity_other === undefined ? current.activity_other : changes.activity_other,
    building_condition: changes.building_condition ?? current.building_condition,
    floor: changes.floor ?? current.floor,
    instagram_status: changes.instagram_status ?? current.instagram_status,
    phone: changes.phone === undefined ? current.phone : changes.phone,
    notes: changes.notes === undefined ? current.notes : changes.notes
  });
  const result = await pool.query(
    `UPDATE point_shops
     SET geometry = jsonb_build_object('type','Point','coordinates',jsonb_build_array($2::double precision,$3::double precision)),
         longitude = $2, latitude = $3, shop_name = $4, activity = $5, activity_other = $6,
         building_condition = $7, floor = $8, instagram_status = $9, phone = $10, notes = $11,
         updated_at = now()
     WHERE point_shop_id = $1
     RETURNING *`,
    [pointShopId, input.longitude, input.latitude, input.shop_name, input.activity,
      input.activity_other, input.building_condition, input.floor, input.instagram_status,
      input.phone, input.notes]
  );
  return mapPointShop(result.rows[0]);
}

export async function deletePointShop(pointShopId: string, userId: number, isAdmin: boolean): Promise<void> {
  const current = await getPointShopForMutation(pointShopId);
  assertCanMutate(current, userId, isAdmin);
  await pool.query('DELETE FROM point_shops WHERE point_shop_id = $1', [pointShopId]);
}

export async function listPointShops(bounds: PointShopBounds = {}) {
  const limit = Math.min(Math.max(bounds.limit ?? 5000, 1), 20000);
  const hasBounds = [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat].every((value) => value !== undefined);
  const params: unknown[] = [];
  let where = '';
  if (hasBounds) {
    params.push(bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat);
    where = `WHERE longitude BETWEEN $1 AND $3 AND latitude BETWEEN $2 AND $4`;
  }
  params.push(limit);
  const result = await pool.query(
    `SELECT p.*, u.username AS created_by_username
     FROM point_shops p JOIN users u ON u.id = p.created_by
     ${where}
     ORDER BY p.point_shop_id
     LIMIT $${params.length}`,
    params
  );
  return {
    type: 'FeatureCollection',
    features: result.rows.map((row) => ({
      type: 'Feature',
      properties: {
        point_shop_id: row.point_shop_id,
        shop_name: row.shop_name,
        activity: row.activity,
        activity_other: row.activity_other,
        building_condition: row.building_condition,
        floor: row.floor,
        instagram_status: row.instagram_status,
        phone: row.phone,
        notes: row.notes,
        created_by: row.created_by_username,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
      },
      geometry: row.geometry
    }))
  };
}
