import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../middleware/auth';
import {
  ADMIN_SORT_COLUMNS,
  queryAdminShopsExport,
  queryAdminShopsPage,
  type AdminShopFilters,
  type SortDirection
} from '../../services/admin-shops.service';
import { buildShopsWorkbook, SHOPS_WORKBOOK_MIME } from '../../services/excel.service';
import { AppError } from '../../utils/errors';

interface ShopsQuery {
  search?: string;
  shop_name?: string;
  activity?: string;
  activity_other?: string;
  building_condition?: string;
  surveyed?: string;
  surveyor?: string;
  date_from?: string;
  date_to?: string;
  record_type?: string;
  floor?: string;
  instagram_status?: string;
  service_type?: string;
  opening_time?: string;
  closing_time?: string;
  sort?: string;
  order?: string;
  page?: string;
  pageSize?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseShopsQuery(query: ShopsQuery) {
  const filters: AdminShopFilters = {
    search: query.search?.trim() || undefined,
    shop_name: query.shop_name?.trim() || undefined,
    activity: query.activity || undefined,
    activity_other: query.activity_other?.trim() || undefined,
    building_condition: query.building_condition || undefined,
    surveyed: query.surveyed === 'yes' || query.surveyed === 'no' ? query.surveyed : undefined,
    surveyor: query.surveyor?.trim() || undefined,
    date_from: query.date_from || undefined,
    date_to: query.date_to || undefined,
    record_type: query.record_type === 'shops' || query.record_type === 'shops-point' || query.record_type === 'services' || query.record_type === 'doors' ? query.record_type : undefined,
    floor: query.floor || undefined,
    instagram_status: query.instagram_status || undefined,
    service_type: query.service_type || undefined
    ,opening_time: query.opening_time || undefined
    ,closing_time: query.closing_time || undefined
  };

  for (const field of ['date_from', 'date_to'] as const) {
    const value = filters[field];
    if (value && !DATE_PATTERN.test(value)) {
      throw new AppError(400, 'bad_date', 'قالب تاریخ باید سال-ماه-روز (YYYY-MM-DD) باشد.');
    }
  }

  const sortKey = query.sort && Object.prototype.hasOwnProperty.call(ADMIN_SORT_COLUMNS, query.sort)
    ? query.sort
    : 'shop_name';
  const order: SortDirection = query.order === 'desc' ? 'desc' : 'asc';
  const parsedSize = Number.parseInt(query.pageSize || '50', 10);
  const pageSize = [25, 50, 100].includes(parsedSize) ? parsedSize : 50;
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);

  return { filters, sortKey, order, page, pageSize };
}

export function registerAdminShopRoutes(app: FastifyInstance): void {
  app.get(
    '/api/admin/shops',
    { preHandler: [requireAdmin] },
    async (request) => {
      const { filters, sortKey, order, page, pageSize } = parseShopsQuery(request.query as ShopsQuery);
      return queryAdminShopsPage(filters, sortKey, order, page, pageSize);
    }
  );

  app.get(
    '/api/admin/shops/export',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const { filters, sortKey, order } = parseShopsQuery(request.query as ShopsQuery);
      const rows = await queryAdminShopsExport(filters, sortKey, order);
      const buffer = await buildShopsWorkbook(rows);
      const date = new Date().toISOString().slice(0, 10);
      return reply
        .header('Content-Type', SHOPS_WORKBOOK_MIME)
        .header('Content-Disposition', `attachment; filename="bazar_shops_${date}.xlsx"`)
        .send(buffer);
    }
  );
}
