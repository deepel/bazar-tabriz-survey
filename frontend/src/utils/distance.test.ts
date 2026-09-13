import { describe, expect, it } from 'vitest';
import { distanceToShop, formatDistance } from './distance';

const feature = {
  type: 'Feature',
  properties: { shop_id: 'x', surveyed: false, centroid_lat: 38.08, centroid_lon: 46.29 }
} as never;

describe('distance utils', () => {
  it('returns null without a shop or position', () => {
    expect(distanceToShop(null, feature)).toBeNull();
  });

  it('formats meter distances in Persian digits', () => {
    expect(formatDistance(18.2)).toBe('۱۸ متر');
    expect(formatDistance(47.5)).toBe('۴۸ متر');
  });

  it('returns a plausible distance between two close points', () => {
    const d = distanceToShop({ lat: 38.080001, lon: 46.290001 }, feature);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(0);
    expect(d!).toBeLessThan(5);
  });
});