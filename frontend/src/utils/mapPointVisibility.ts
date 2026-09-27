import { POINTS_MIN_ZOOM } from '../config/constants';

const METERS_PER_LAT_DEGREE = 111320;
const POINT_RELOAD_TOLERANCE_METERS = 25;

export function areMapPointsVisible(zoom: number): boolean {
  return zoom >= POINTS_MIN_ZOOM;
}

export function isMeaningfulViewportChange(
  previous: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null,
  next: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): boolean {
  if (!previous) return true;
  const centerLat = (previous.minLat + previous.maxLat) / 2;
  const centerDeltaLat = Math.abs((next.minLat + next.maxLat) - (previous.minLat + previous.maxLat)) / 2;
  const centerDeltaLon = Math.abs((next.minLon + next.maxLon) - (previous.minLon + previous.maxLon)) / 2;
  const metersLat = centerDeltaLat * METERS_PER_LAT_DEGREE;
  const metersLon = centerDeltaLon * METERS_PER_LAT_DEGREE * Math.cos((centerLat * Math.PI) / 180);
  return metersLat > POINT_RELOAD_TOLERANCE_METERS || metersLon > POINT_RELOAD_TOLERANCE_METERS;
}