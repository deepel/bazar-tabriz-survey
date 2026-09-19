import { pool } from '../db';

export type SortDirection = 'asc' | 'desc';
export type SurveyedFilter = 'yes' | 'no';
export type RecordType = 'shops' | 'shops-point' | 'services' | 'doors';

export interface AdminShopFilters {
  search?: string;
  shop_name?: string;
  activity?: string;
  activity_other?: string;
  building_condition?: string;
  surveyed?: SurveyedFilter;
  surveyor?: string;
  date_from?: string;
  date_to?: string;
  record_type?: RecordType;
  floor?: string;
  instagram_status?: string;
  service_type?: string;
  opening_time?: string;
  closing_time?: string;
}

export interface AdminShopRecord {
  shop_id: string;
  record_id: string;
  point_shop_id: string | null;
  service_point_id: string | null;
  door_point_id: string | null;
  record_type: RecordType;
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  floor: string | null;
  instagram_status: string | null;
  phone: string | null;
  service_type: string | null;
  opening_time: string | null;
  closing_time: string | null;
  notes: string | null;
  created_by_username: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  surveyed: boolean | null;
  surveyed_at: Date | null;
  surveyor_username: string | null;
}

export const ADMIN_SORT_COLUMNS: Record<string, string> = {
  record_type: 'r.record_type', shop_name: 'r.shop_name', activity: 'r.activity',
  activity_other: 'r.activity_other', building_condition: 'r.building_condition',
  floor: 'r.floor', instagram_status: 'r.instagram_status', phone: 'r.phone',
  service_type: 'r.service_type', opening_time: 'r.opening_time', closing_time: 'r.closing_time',
  surveyed: 'r.surveyed_at IS NOT NULL',
  surveyor: 'r.surveyor_username', surveyed_at: 'r.surveyed_at', shop_id: 'r.record_id'
};

const RECORDS_CTE = `
WITH records AS (
  SELECT 'shops'::text AS record_type, s.shop_id AS record_id, s.shop_id,
    NULL::text AS point_shop_id, NULL::text AS service_point_id, NULL::text AS door_point_id,
    sv.shop_name, sv.activity, sv.activity_other, sv.building_condition,
    sv.floor, sv.instagram_status, sv.phone, NULL::text AS service_type,
    NULL::text AS opening_time, NULL::text AS closing_time, NULL::text AS notes,
    (sv.id IS NOT NULL) AS surveyed, sv.surveyed_at, u.username AS surveyor_username,
    NULL::text AS created_by_username, NULL::timestamptz AS created_at, NULL::timestamptz AS updated_at
  FROM shops s LEFT JOIN surveys sv ON sv.shop_id = s.shop_id LEFT JOIN users u ON u.id = sv.surveyor_id
  UNION ALL
  SELECT 'shops-point'::text AS record_type, p.point_shop_id AS record_id, p.point_shop_id AS shop_id,
    p.point_shop_id, NULL::text AS service_point_id, NULL::text AS door_point_id, p.shop_name, p.activity, p.activity_other,
    p.building_condition, p.floor, p.instagram_status, p.phone, NULL::text AS service_type,
    NULL::text AS opening_time, NULL::text AS closing_time, p.notes,
    NULL::boolean, NULL::timestamptz, u.username AS surveyor_username,
    u.username AS created_by_username, p.created_at, p.updated_at
  FROM point_shops p LEFT JOIN users u ON u.id = p.created_by
  UNION ALL
  SELECT 'services'::text AS record_type, p.service_point_id AS record_id, p.service_point_id AS shop_id,
    NULL::text AS point_shop_id, p.service_point_id, NULL::text AS door_point_id, p.name, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, p.service_type,
    NULL::text AS opening_time, NULL::text AS closing_time, p.notes,
    NULL::boolean, NULL::timestamptz, u.username AS surveyor_username,
    u.username AS created_by_username, p.created_at, p.updated_at
  FROM service_points p LEFT JOIN users u ON u.id = p.created_by
  UNION ALL
  SELECT 'doors'::text AS record_type, p.door_point_id AS record_id, p.door_point_id AS shop_id,
    NULL::text AS point_shop_id, NULL::text AS service_point_id, p.door_point_id,
    p.name, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    to_char(p.opening_time, 'HH24:MI'), to_char(p.closing_time, 'HH24:MI'), p.notes,
    NULL::boolean, NULL::timestamptz, NULL::text AS surveyor_username,
    u.username AS created_by_username, p.created_at, p.updated_at
  FROM door_points p LEFT JOIN users u ON u.id = p.created_by
)
`;

const SUMMARY_SELECT = `SELECT (SELECT COUNT(*)::int FROM shops) AS total, (SELECT COUNT(*)::int FROM surveys) AS surveyed`;
interface WhereClause { sql: string; params: unknown[] }

function escapeLike(term: string): string { return term.replace(/[\\%_]/g, (m) => '\\' + m); }
function containsPattern(term: string): string { return '%' + escapeLike(term) + '%'; }

export function buildWhereClause(filters: AdminShopFilters): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  const param = (value: unknown): string => { params.push(value); return '$' + index++; };
  if (filters.search) {
    const pattern = containsPattern(filters.search);
    conditions.push(`(r.shop_name ILIKE ${param(pattern)} ESCAPE '\\' OR r.record_id ILIKE ${param(pattern)} ESCAPE '\\' OR r.activity ILIKE ${param(pattern)} ESCAPE '\\' OR r.service_type ILIKE ${param(pattern)} ESCAPE '\\' OR r.opening_time ILIKE ${param(pattern)} ESCAPE '\\' OR r.closing_time ILIKE ${param(pattern)} ESCAPE '\\')`);
  }
  if (filters.shop_name) conditions.push(`r.shop_name ILIKE ${param(containsPattern(filters.shop_name))} ESCAPE '\\'`);
  if (filters.activity) conditions.push(`r.activity = ${param(filters.activity)}`);
  if (filters.activity_other) conditions.push(`r.activity_other ILIKE ${param(containsPattern(filters.activity_other))} ESCAPE '\\'`);
  if (filters.building_condition) conditions.push(`r.building_condition = ${param(filters.building_condition)}`);
  if (filters.record_type) conditions.push(`r.record_type = ${param(filters.record_type)}`);
  if (filters.floor) conditions.push(`r.floor = ${param(filters.floor)}`);
  if (filters.instagram_status) conditions.push(`r.instagram_status = ${param(filters.instagram_status)}`);
  if (filters.service_type) conditions.push(`r.service_type = ${param(filters.service_type)}`);
  if (filters.opening_time) conditions.push(`r.opening_time = ${param(filters.opening_time)}`);
  if (filters.closing_time) conditions.push(`r.closing_time = ${param(filters.closing_time)}`);
  if (filters.surveyed === 'yes') conditions.push(`r.record_type = 'shops' AND r.surveyed_at IS NOT NULL`);
  if (filters.surveyed === 'no') conditions.push(`r.record_type = 'shops' AND r.surveyed_at IS NULL`);
  if (filters.surveyor) conditions.push(`r.surveyor_username = ${param(filters.surveyor)}`);
  if (filters.date_from) conditions.push(`r.surveyed_at::date >= ${param(filters.date_from)}::date`);
  if (filters.date_to) conditions.push(`r.surveyed_at::date <= ${param(filters.date_to)}::date`);
  return { sql: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', params };
}

function normalizeRows(rows: AdminShopRecord[]) {
  return rows.map((row) => ({ ...row, surveyed: row.surveyed === null ? null : Boolean(row.surveyed) }));
}

export async function queryAdminShopsPage(filters: AdminShopFilters, sortKey: string, order: SortDirection, page: number, pageSize: number) {
  const where = buildWhereClause(filters);
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const sortExpr = ADMIN_SORT_COLUMNS[sortKey] ?? ADMIN_SORT_COLUMNS.shop_name;
  const offset = (page - 1) * pageSize;
  const [rowsResult, countResult, summaryResult] = await Promise.all([
    pool.query<AdminShopRecord>(`${RECORDS_CTE} SELECT r.* FROM records r${where.sql} ORDER BY ${sortExpr} ${dir} NULLS LAST LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`, [...where.params, pageSize, offset]),
    pool.query<{ total: number }>(`${RECORDS_CTE} SELECT COUNT(*)::int AS total FROM records r${where.sql}`, where.params),
    pool.query<{ total: number; surveyed: number }>(SUMMARY_SELECT)
  ]);
  const summary = summaryResult.rows[0];
  return {
    summary: { total: Number(summary.total), surveyed: Number(summary.surveyed), unsurveyed: Number(summary.total) - Number(summary.surveyed) },
    rows: normalizeRows(rowsResult.rows), total: Number(countResult.rows[0].total), page, pageSize, sort: sortKey, order
  };
}

export async function queryAdminShopsExport(filters: AdminShopFilters, sortKey: string, order: SortDirection): Promise<AdminShopRecord[]> {
  const where = buildWhereClause(filters);
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const sortExpr = ADMIN_SORT_COLUMNS[sortKey] ?? ADMIN_SORT_COLUMNS.shop_name;
  const result = await pool.query<AdminShopRecord>(`${RECORDS_CTE} SELECT r.* FROM records r${where.sql} ORDER BY ${sortExpr} ${dir} NULLS LAST`, where.params);
  return normalizeRows(result.rows);
}
