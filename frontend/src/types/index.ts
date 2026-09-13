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
  gpsWarningDistanceMeters: number;
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
  position: { lat: number; lon: number; accuracy?: number } | null;
  error: string | null;
  errorKind: 'unavailable' | 'denied' | 'error' | null;
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