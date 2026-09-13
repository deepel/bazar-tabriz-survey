// Fallback lists. The server (/api/options) is the source of truth; these
// values are only used before options load or as a safety net.
export const APP_NAME = 'بازار تبریز';

export const FALLBACK_ACTIVITIES = [
  'پوشاک',
  'کفش',
  'فرش',
  'صنایع دستی',
  'مواد غذایی',
  'طلا و جواهر',
  'لوازم خانگی',
  'خدمات',
  'سایر'
];

export const FALLBACK_BUILDING_CONDITIONS = [
  'سالم',
  'مرمت شده',
  'نیازمند مرمت',
  'نامناسب',
  'سایر'
];

export const OTHER = 'سایر';

export const TABRIZ_CENTER: [number, number] = [38.0739, 46.2914];

export const MAP = {
  initialZoom: 17,
  minZoom: 14,
  maxZoom: 20
};

export const COLORS = {
  unsurveyed: {
    color: '#7f1d1d',
    fillColor: '#dc2626'
  },
  surveyed: {
    color: '#14532d',
    fillColor: '#16a34a'
  },
  selected: {
    color: '#92400e',
    fillColor: '#f59e0b'
  }
};