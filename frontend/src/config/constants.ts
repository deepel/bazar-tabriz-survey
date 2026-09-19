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

export const FLOORS = [
  { value: 'ground_floor', label: 'همکف' },
  { value: 'basement', label: 'زیرزمین' },
  { value: 'floor_1', label: 'طبقه ۱' },
  { value: 'floor_2', label: 'طبقه ۲' }
] as const;

export const INSTAGRAM_STATUSES = [
  { value: 'has', label: 'دارد' },
  { value: 'does_not_have', label: 'ندارد' },
  { value: 'not_checked', label: 'بررسی نشده' }
] as const;

export const SERVICE_TYPES = [
  { value: 'toilet', label: 'سرویس بهداشتی' },
  { value: 'prayer_room', label: 'نمازخانه' },
  { value: 'mosque', label: 'مسجد' }
] as const;

// Points stay hidden at the broad bazaar view and are fetched only when a
// surveyor is close enough for their markers to be useful. Keep this in one
// place so it can be tuned after real mobile testing.
export const POINTS_MIN_ZOOM = 18;

export const OTHER = 'سایر';

export const ASSIGNMENT_COLOR_OPTIONS = [
  '#2563eb', '#7c3aed', '#0891b2', '#d97706',
  '#db2777', '#4f46e5', '#0f766e', '#64748b'
] as const;

export const TABRIZ_CENTER: [number, number] = [38.0739, 46.2914];

export const MAP = {
  initialZoom: 17,
  minZoom: 14,
  // The map itself may zoom in far; OSM base tiles are upscaled from
  // `TILE_MAX_NATIVE_ZOOM` so the background never goes blank at high zoom.
  maxZoom: 22
};

// Standard OpenStreetMap raster tiles are only generated up to z19. Without
// `maxNativeZoom` Leaflet requests z20+ tiles, which the tile server does not
// serve, so the base map appears blank when the user zooms in. With these
// options the highest available tiles are loaded and upscaled instead.
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_MAX_NATIVE_ZOOM = 19;
// Configurable so a production deployment can use an official Google Maps
// tile/API configuration without changing the map component. The fallback is
// useful for local preview only; production deployments should use a licensed
// Google Maps tile endpoint and key.
export const SATELLITE_TILE_URL =
  import.meta.env.VITE_GOOGLE_SATELLITE_TILE_URL ||
  'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';

// Loose maximum bounds around Tabriz so the map cannot be panned too far
// away from the bazaar while inspecting it.
export const MAP_BOUNDS: [[number, number], [number, number]] = [
  [37.9, 46.1],
  [38.25, 46.55]
];

// Leaflet pane names for the historical GIS reference layers. Both panes sit
// above the OSM tiles but below the default overlay pane so that shop
// polygons and the GPS marker always stay on top and keep their interaction.
export const GIS_MASK_PANE = 'gis-mask';
export const GIS_MASK_PANE_Z = 340;
export const GIS_REF_PANE = 'gis-ref';
export const GIS_REF_PANE_Z = 350;

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
