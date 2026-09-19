import { POINTS_MIN_ZOOM } from '../config/constants';

export function areMapPointsVisible(zoom: number): boolean {
  return zoom >= POINTS_MIN_ZOOM;
}

export function isMeaningfulViewportChange(
  previous: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null,
  next: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): boolean {
  if (!previous) return true;
  const previousWidth = Math.max(previous.maxLon - previous.minLon, 0.000001);
  const previousHeight = Math.max(previous.maxLat - previous.minLat, 0.000001);
  const centerDeltaLon = Math.abs((next.minLon + next.maxLon) - (previous.minLon + previous.maxLon)) / 2;
  const centerDeltaLat = Math.abs((next.minLat + next.maxLat) - (previous.minLat + previous.maxLat)) / 2;
  return centerDeltaLon > previousWidth * 0.2 || centerDeltaLat > previousHeight * 0.2;
}
