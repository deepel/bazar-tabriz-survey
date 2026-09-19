import ExcelJS from 'exceljs';
import { SERVICE_TYPE_LABELS, type ServiceType } from '../config';
import type { AdminShopRecord } from './admin-shops.service';

export const SHOPS_WORKBOOK_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Human-readable Excel columns. Do not include hashes, secrets, or internal
 * GIS/database fields here.
 */
export const SHOPS_EXCEL_COLUMNS = [
  { header: 'نام مغازه', key: 'shop_name', width: 30 },
  { header: 'کاربری', key: 'activity', width: 18 },
  { header: 'سایر کاربری', key: 'activity_other', width: 22 },
  { header: 'وضعیت بنا', key: 'building_condition', width: 18 },
  { header: 'وضعیت برداشت', key: 'surveyed', width: 16 },
  { header: 'برداشت‌کننده', key: 'surveyor_username', width: 16 },
  { header: 'تاریخ و ساعت برداشت', key: 'surveyed_at', width: 26 },
  { header: 'Shop ID', key: 'shop_id', width: 42 },
  { header: 'نوع رکورد', key: 'record_type_label', width: 24 },
  { header: 'موقعیت عمودی', key: 'floor', width: 16 },
  { header: 'Instagram', key: 'instagram_status', width: 18 },
  { header: 'تلفن', key: 'phone', width: 20 },
  { header: 'نوع خدمات', key: 'service_type_label', width: 20 },
  { header: 'ساعت باز شدن', key: 'opening_time', width: 16 },
  { header: 'ساعت بسته شدن', key: 'closing_time', width: 16 },
  { header: 'توضیحات', key: 'notes', width: 30 },
  { header: 'ایجادکننده', key: 'created_by_username', width: 16 },
  { header: 'تاریخ ایجاد', key: 'created_at', width: 24 },
  { header: 'تاریخ بروزرسانی', key: 'updated_at', width: 24 }
];

function formatPersianDateTime(date: Date | null): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return date.toISOString();
  }
}

export async function buildShopsWorkbook(rows: AdminShopRecord[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('مغازه‌ها');
  // Display columns right-to-left so Persian headers/values read naturally.
  sheet.views = [{ rightToLeft: true }];

  sheet.columns = SHOPS_EXCEL_COLUMNS;
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      shop_name: row.shop_name ?? '',
      activity: row.activity ?? '',
      activity_other: row.activity_other ?? '',
      building_condition: row.building_condition ?? '',
      surveyed: row.surveyed ? 'برداشت شده' : 'برداشت نشده',
      surveyor_username: row.surveyor_username ?? '',
      surveyed_at: formatPersianDateTime(row.surveyed_at),
      shop_id: row.shop_id,
      record_type_label: row.record_type === 'shops'
        ? 'مغازه اصلی'
        : row.record_type === 'shops-point' ? 'مکان تکمیلی (Point)' : row.record_type === 'services' ? 'خدمات' : 'در',
      floor: row.floor ?? '',
      instagram_status: row.instagram_status ?? '',
      phone: row.phone ?? '',
      service_type_label: row.service_type
        ? SERVICE_TYPE_LABELS[row.service_type as ServiceType] ?? row.service_type
        : '',
      opening_time: row.opening_time ?? '',
      closing_time: row.closing_time ?? '',
      notes: row.notes ?? '',
      created_by_username: row.created_by_username ?? '',
      created_at: formatPersianDateTime(row.created_at),
      updated_at: formatPersianDateTime(row.updated_at)
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
