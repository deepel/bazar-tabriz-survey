export type Role = 'admin' | 'surveyor';

export interface User {
  id: number;
  username: string;
  role: Role;
  is_active?: boolean;
  assignment_color?: string;
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
    assignment_id?: string | null;
    assignment_color?: string | null;
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
  pointShops?: number;
}

export interface OptionsResponse {
  activities: string[];
  buildingConditions: string[];
  floors?: Array<string | { value: string; label: string }>;
  instagramStatuses?: Array<string | { value: string; label: string }>;
  serviceTypes?: Array<{ value: string; label: string }>;
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
  floor: string;
  instagram_status: string;
  phone?: string;
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

export type SystemLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface SystemLog {
  id: number;
  created_at: string;
  level: SystemLogLevel;
  event: string;
  details: Record<string, unknown>;
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

export interface AssignmentMember {
  user_id: number;
  username: string;
  color: string;
  initials: string;
}

export type AssignmentStatus = 'active' | 'completed' | 'cancelled' | 'archived';

export interface Assignment {
  id: string;
  requested_count: number;
  actual_count: number;
  surveyed_count: number;
  status: AssignmentStatus;
  created_at: string;
  completed_at: string | null;
  archived_at: string | null;
  primary_color: string;
  color_snapshot: AssignmentMember[];
  members: AssignmentMember[];
  shop_ids: string[];
}

export interface AssignmentSurveyor {
  id: number;
  username: string;
  color: string;
  initials: string;
}

export interface AssignmentPreview {
  previewId: string;
  requestedCount: number;
  actualCount: number;
  sufficient: boolean;
  reason: string | null;
  members: AssignmentMember[];
  shops: GeoJSON.FeatureCollection;
}

export type AdminShopsSortKey =
  | 'record_type'
  | 'shop_name'
  | 'activity'
  | 'activity_other'
  | 'building_condition'
  | 'floor'
  | 'instagram_status'
  | 'phone'
  | 'service_type'
  | 'opening_time'
  | 'closing_time'
  | 'surveyed'
  | 'surveyor'
  | 'surveyed_at'
  | 'shop_id';

export type AdminShopsSortDirection = 'asc' | 'desc';

export interface AdminShopRow {
  shop_id: string;
  record_id: string;
  record_type: 'shops' | 'shops-point' | 'services' | 'doors';
  shop_name: string | null;
  activity: string | null;
  activity_other: string | null;
  building_condition: string | null;
  surveyed: boolean | null;
  floor: string | null;
  instagram_status: string | null;
  phone: string | null;
  service_type: string | null;
  opening_time: string | null;
  closing_time: string | null;
  notes: string | null;
  created_by_username: string | null;
  created_at: string | null;
  updated_at: string | null;
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
  record_type: '' | 'shops' | 'shops-point' | 'services' | 'doors';
  shop_name: string;
  activity: string;
  activity_other: string;
  building_condition: string;
  surveyed: '' | 'yes' | 'no';
  surveyor: string;
  date_from: string;
  date_to: string;
  floor: string;
  instagram_status: string;
  service_type: string;
  opening_time: string;
  closing_time: string;
}

export interface PointShopProperties {
  point_shop_id: string;
  shop_name: string | null;
  activity: string;
  activity_other: string | null;
  building_condition: string;
  floor: string;
  instagram_status: string;
  phone: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PointShopFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: PointShopProperties;
}

export interface PointShopsResponse extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  features: PointShopFeature[];
}

export interface ServicePointProperties {
  service_point_id: string;
  service_type: string;
  name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServicePointFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: ServicePointProperties;
}

export interface ServicePointsResponse extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  features: ServicePointFeature[];
}

export interface DoorPointProperties {
  door_point_id: string;
  name: string;
  opening_time: string;
  closing_time: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DoorPointFeature extends GeoJSON.Feature<GeoJSON.Point> {
  properties: DoorPointProperties;
}

export interface DoorPointsResponse extends GeoJSON.FeatureCollection<GeoJSON.Point> {
  features: DoorPointFeature[];
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
