import { describe, expect, it } from 'vitest';
import { POINTS_MIN_ZOOM } from '../config/constants';
import { areMapPointsVisible, isMeaningfulViewportChange } from './mapPointVisibility';

describe('map point visibility', () => {
  it('keeps both point layers hidden below the centralized threshold', () => {
    expect(areMapPointsVisible(POINTS_MIN_ZOOM - 1)).toBe(false);
    expect(areMapPointsVisible(POINTS_MIN_ZOOM)).toBe(true);
    expect(areMapPointsVisible(POINTS_MIN_ZOOM + 2)).toBe(true);
  });

  it('does not treat tiny pans as a new point viewport', () => {
    const base = { minLon: 46.28, minLat: 38.06, maxLon: 46.30, maxLat: 38.08 };
    expect(isMeaningfulViewportChange(base, { minLon: 46.2801, minLat: 38.0601, maxLon: 46.3001, maxLat: 38.0801 })).toBe(false);
    expect(isMeaningfulViewportChange(base, { minLon: 46.285, minLat: 38.06, maxLon: 46.305, maxLat: 38.08 })).toBe(true);
  });
});
