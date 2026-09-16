export type Role = 'admin' | 'surveyor';

export interface User {
  id: number;
  username: string;
  role: Role;
  is_active?: boolean;
}

export interface SessionInfo {
  user: User | null;
  loading: boolean;
}

export interface GeoJsonFeature extends GeoJSON.Feature {
  id?: string;
  properties: {
    shop_id: string;
    surveyed: boolean;
    shop_name?: string | null;
    activity?: string | null;
    building_condition?: string | null;
    centroid_lat?: number;
    centroid_lon?: number;
    [key: string]: unknown;
  };
}

export interface ShopsResponse extends GeoJSON.FeatureCollection {
  truncated?: boolean;
}

export interface Stats {
  total: number;
  surveyed: number;
  unsurveyed: number;
  progress: number;
}

export interface OptionsResponse {
  activities: string[];
  buildingConditions: string[];
}

export interface ImportStats {
  totalFeatures: number;
  existingShops: number;
  newShops: number;
  geometryChanges: number;
  duplicateIds: number;
  missingIds: number;
  invalidGeometries: number;
  invalidFeatures: number;
}

export interface ImportPreview {
  previewId: string;
  filename: string;
  stats: ImportStats;
  errors: Array<{ index: number; message: string }>;
}

export interface SurveyPayload {
  shop_id: string;
  shop_name: string;
  activity: string;
  activity_other?: string;
  building_condition: string;
  survey_lat?: number | null;
  survey_lon?: number | null;
}

export interface GpsState {
  position: { lat: number; lon: number } | null;
  watching: boolean;
}

export interface GithubStatus {
  configured: boolean;
  lastState?: {
    ok?: boolean;
    lastSyncedAt?: string;
    surveyedRecords?: number;
    error?: string;
  };
  interval?: number;
}

export interface CategoryCount {
  activity: string;
  count: number;
}

export interface CategoryStatsResponse {
  total: number;
  categories: CategoryCount[];
}

export interface SurveyorStat {
  id: number;
  username: string;
  role: Role;
  survey_count: number;
}

export interface SurveyorStatsResponse {
  totalSurveyed: number;
  surveyors: SurveyorStat[];
}

export interface AppMessage {
  id: number;
  sender_id: number;
  sender_username: string;
  is_broadcast: boolean;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface MessagesResponse {
  messages: AppMessage[];
  unread: number;
}

export type AdminShopsSortKey =
  | 'shop_name'
  | 'activity'
  | 'activity_other'
  | 'building_condition'
  | 'surveyed'
  | 'surveyor'
  | 'surveyed_at'
  | 'shop_id';

export type AdminShopsSortDirection = 'asc' | 'desc';

export interface AdminShopRow {
  shop_id: string;
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  surveyed: boolean;
  surveyed_at: string | null;
  surveyor_username: string | null;
}

export interface AdminShopsSummary {
  total: number;
  surveyed: number;
  unsurveyed: number;
}

export interface AdminShopsResponse {
  summary: AdminShopsSummary;
  rows: AdminShopRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: AdminShopsSortKey;
  order: AdminShopsSortDirection;
}

export interface AdminShopsFilters {
  shop_name: string;
  activity: string;
  activity_other: string;
  building_condition: string;
  surveyed: '' | 'yes' | 'no';
  surveyor: string;
  date_from: string;
  date_to: string;
}

export interface GisLayer {
  layer_key: string;
  display_name: string;
  enabled: boolean;
  source_url: string;
  order_index: number;
  cache_version: number;
  min_zoom?: number;
  detail_zoom?: number;
  updated_at: string;
}

export interface GisLayersResponse {
  layers: GisLayer[];
}
