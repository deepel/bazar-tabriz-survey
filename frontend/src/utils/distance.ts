import distance from '@turf/distance';
import type { GeoJsonFeature } from '../types';

export interface LatLng {
  lat: number;
  lon: number;
}

/** Distance between the surveyor and the shop centroid in meters. */
export function distanceToShop(
  position: LatLng | null,
  feature: GeoJsonFeature | null
): number | null {
  if (!feature || !position) return null;
  const lat = feature.properties.centroid_lat;
  const lon = feature.properties.centroid_lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const from = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [position.lon, position.lat] } };
  const to = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } };
  return distance(from as never, to as never, { units: 'meters' });
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function toPersianDigits(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number.parseInt(d, 10)]);
}

export function formatDistance(meters: number | null): string | null {
  if (meters === null) return null;
  return `${toPersianDigits(Math.round(meters))} متر`;
}

export function fromLeafletLatLng(position: { lat: number; lng: number }): LatLng {
  return { lat: position.lat, lon: position.lng };
}