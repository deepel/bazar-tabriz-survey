import { pool } from '../db';

export type SortDirection = 'asc' | 'desc';
export type SurveyedFilter = 'yes' | 'no';

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
}

export interface AdminShopRecord {
  shop_id: string;
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  surveyed: boolean;
  surveyed_at: Date | null;
  surveyor_username: string | null;
}

/**
 * Extensibility point: future survey fields (e.g. وضعیت میراثی، تعداد طبقات،
 * نوع مالکیت، نوع کاربری جدید) become new columns/filters/exports by adding
 * one entry here and one `WHERE` branch in `buildWhereClause`. Everything else
 * (sorting, pagination, summary, Excel export) picks the field up automatically.
 */
export const ADMIN_SORT_COLUMNS: Record<string, string> = {
  shop_name: 'sv.shop_name',
  activity: 'sv.activity',
  activity_other: 'sv.activity_other',
  building_condition: 'sv.building_condition',
  surveyed: '(sv.surveyed_at IS NOT NULL)',
  surveyor: 'u.username',
  surveyed_at: 'sv.surveyed_at',
  shop_id: 's.shop_id'
};

const SHOP_LIST_SELECT = `
  SELECT
    s.shop_id,
    sv.shop_name,
    sv.activity,
    sv.activity_other,
    sv.building_condition,
    (sv.surveyed_at IS NOT NULL) AS surveyed,
    sv.surveyed_at,
    u.username AS surveyor_username
  FROM shops s
  LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
  LEFT JOIN users u ON u.id = sv.surveyor_id`;

const SURVEY_COUNT_SELECT = `
  SELECT COUNT(*)::int AS total
  FROM shops s
  LEFT JOIN surveys sv ON sv.shop_id = s.shop_id
  LEFT JOIN users u ON u.id = sv.surveyor_id`;

const SUMMARY_SELECT = `
  SELECT
    (SELECT COUNT(*)::int FROM shops) AS total,
    (SELECT COUNT(*)::int FROM surveys) AS surveyed`;

interface WhereClause {
  sql: string;
  params: unknown[];
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => '\\' + m);
}

function containsPattern(term: string): string {
  return '%' + escapeLike(term) + '%';
}

/** Builds a parameterized WHERE clause. User values never enter the SQL text. */
export function buildWhereClause(filters: AdminShopFilters): WhereClause {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let index = 1;
  const param = (value: unknown): string => {
    params.push(value);
    return '$' + index++;
  };

  if (filters.search) {
    const pattern = containsPattern(filters.search);
    conditions.push(
      `(sv.shop_name ILIKE ${param(pattern)} ESCAPE '\\'
        OR s.shop_id ILIKE ${param(pattern)} ESCAPE '\\'
        OR sv.activity ILIKE ${param(pattern)} ESCAPE '\\')`
    );
  }
  if (filters.shop_name) {
    conditions.push(`sv.shop_name ILIKE ${param(containsPattern(filters.shop_name))} ESCAPE '\\'`);
  }
  if (filters.activity) {
    conditions.push(`sv.activity = ${param(filters.activity)}`);
  }
  if (filters.activity_other) {
    conditions.push(`sv.activity_other ILIKE ${param(containsPattern(filters.activity_other))} ESCAPE '\\'`);
  }
  if (filters.building_condition) {
    conditions.push(`sv.building_condition = ${param(filters.building_condition)}`);
  }
  if (filters.surveyed === 'yes') {
    conditions.push('sv.surveyed_at IS NOT NULL');
  }
  if (filters.surveyed === 'no') {
    conditions.push('sv.surveyed_at IS NULL');
  }
  if (filters.surveyor) {
    conditions.push(`u.username = ${param(filters.surveyor)}`);
  }
  if (filters.date_from) {
    conditions.push(`sv.surveyed_at::date >= ${param(filters.date_from)}::date`);
  }
  if (filters.date_to) {
    conditions.push(`sv.surveyed_at::date <= ${param(filters.date_to)}::date`);
  }

  return { sql: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', params };
}

function mapRecord(row: AdminShopRecord): AdminShopRecord {
  return { ...row, surveyed: Boolean(row.surveyed) };
}

/**
 * One page of the admin shop data table. `summary` is always the whole-database
 * overview (کل/برداشت شده/باقی‌مانده), while `total` is the filtered row count.
 */
export async function queryAdminShopsPage(
  filters: AdminShopFilters,
  sortKey: string,
  order: SortDirection,
  page: number,
  pageSize: number
) {
  const where = buildWhereClause(filters);
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const sortExpr = ADMIN_SORT_COLUMNS[sortKey] ?? ADMIN_SORT_COLUMNS.shop_name;
  const offset = (page - 1) * pageSize;

  const [rowsResult, countResult, summaryResult] = await Promise.all([
    pool.query(
      `${SHOP_LIST_SELECT}${where.sql}
       ORDER BY ${sortExpr} ${dir} NULLS LAST
       LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
      [...where.params, pageSize, offset]
    ),
    pool.query(`${SURVEY_COUNT_SELECT}${where.sql}`, where.params),
    pool.query(SUMMARY_SELECT)
  ]);

  const summary = summaryResult.rows[0];
  return {
    summary: {
      total: Number(summary.total),
      surveyed: Number(summary.surveyed),
      unsurveyed: Number(summary.total) - Number(summary.surveyed)
    },
    rows: rowsResult.rows.map((row) => ({
      ...mapRecord(row),
      surveyed_at: row.surveyed_at ? (row.surveyed_at as Date).toISOString() : null
    })),
    total: Number(countResult.rows[0].total),
    page,
    pageSize,
    sort: sortKey,
    order
  };
}

/** Every shop matching the current filters (no pagination) for Excel export. */
export async function queryAdminShopsExport(
  filters: AdminShopFilters,
  sortKey: string,
  order: SortDirection
): Promise<AdminShopRecord[]> {
  const where = buildWhereClause(filters);
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const sortExpr = ADMIN_SORT_COLUMNS[sortKey] ?? ADMIN_SORT_COLUMNS.shop_name;
  const result = await pool.query(
    `${SHOP_LIST_SELECT}${where.sql}
     ORDER BY ${sortExpr} ${dir} NULLS LAST`,
    where.params
  );
  return result.rows.map(mapRecord);
}