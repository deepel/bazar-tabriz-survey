import { describe, expect, it } from 'vitest';
import { IMPORT_COLORS } from '../config/constants';
import type { ImportFeatureMatch, ImportResolution, ImportReviewResult } from '../types/importReview';
import {
  allResolved,
  buildPanelContext,
  countByFilter,
  countByStatus,
  decisionLabel,
  isBlockingStatus,
  isResolved,
  neighborIndex,
  pendingBlocking,
  reviewOrder,
  statusTone
} from './importReviewState';

function feature(newIndex: number, status: ImportFeatureMatch['status']): ImportFeatureMatch {
  const blocking = status === 'REVIEW' || status === 'INVALID' || status === 'DUPLICATE';
  return {
    newIndex,
    newFingerprint: `f${newIndex}`,
    newHandle: null,
    newProperties: {},
    status,
    matchedOldIndex: null,
    matchedOldShopId: null,
    bestScore: status === 'REVIEW' ? 0.9 : status === 'GEOMETRY_MATCH' ? 0.95 : 0,
    candidates: [],
    reviewRequired: blocking,
    reason: status === 'REVIEW' ? 'low_confidence' : null,
    geometryValid: status !== 'INVALID',
    geometryIssues: status === 'INVALID' ? ['shell_self_intersects'] : [],
    newWgs84Geometry: { type: 'Polygon', coordinates: [] }
  };
}

function resultOf(...features: ImportFeatureMatch[]): ImportReviewResult {
  return {
    options: { targetEpsg: 32638, searchRadiusMeters: 15, minCandidateScore: 0.6, highConfidenceScore: 0.8, ambiguityMargin: 0.15 },
    summary: {
      totalFeatures: features.length,
      existing: 0,
      geometryChanged: 0,
      exact: 0,
      newFeatures: 0,
      reviewRequired: 0,
      invalid: 0,
      duplicate: 0,
      oldMatched: 0,
      oldReferenced: 0
    },
    features
  };
}

describe('importReviewState', () => {
  it('considers REVIEW, INVALID and DUPLICATE blocking and everything else not', () => {
    expect(isBlockingStatus('REVIEW')).toBe(true);
    expect(isBlockingStatus('INVALID')).toBe(true);
    expect(isBlockingStatus('DUPLICATE')).toBe(true);
    expect(isBlockingStatus('NEW')).toBe(false);
    expect(isBlockingStatus('GEOMETRY_MATCH')).toBe(false);
    expect(isBlockingStatus('EXACT_MATCH')).toBe(false);
  });

  it('maps every status to one of the shared IMPORT_COLORS (duplicates re-use the invalid tone)', () => {
    const tones = ['EXACT_MATCH', 'GEOMETRY_MATCH', 'NEW', 'REVIEW', 'INVALID', 'DUPLICATE'].map(
      (s) => statusTone(s as ImportFeatureMatch['status'])
    );
    tones.forEach((tone) => expect(tones.includes(tone)).toBe(true));
    expect(statusTone('NEW')).toBe('new');
    expect(statusTone('DUPLICATE')).toBe('invalid');
    expect(statusTone('REVIEW')).toBe('review');
    for (const tone of new Set(tones)) {
      expect(IMPORT_COLORS[tone]).toBeTruthy();
    }
  });

  it('counts blocking features still awaiting a decision (non-blocking are always resolved)', () => {
    const result = resultOf(
      feature(0, 'NEW'),
      feature(1, 'REVIEW'),
      feature(2, 'INVALID'),
      feature(3, 'GEOMETRY_MATCH')
    );
    const none: Record<number, ImportResolution> = {};
    expect(pendingBlocking(result, none)).toBe(2);
    expect(allResolved(result, none)).toBe(false);
    expect(isResolved(result.features[0], none)).toBe(true);
    expect(isResolved(result.features[1], none)).toBe(false);

    const decided: Record<number, ImportResolution> = { 1: { action: 'new_shop' }, 2: { action: 'exclude' } };
    expect(pendingBlocking(result, decided)).toBe(0);
    expect(allResolved(result, decided)).toBe(true);
  });

  it('orders blocking features first while keeping file order within each group', () => {
    const result = resultOf(
      feature(10, 'NEW'),
      feature(11, 'REVIEW'),
      feature(12, 'DUPLICATE'),
      feature(13, 'NEW'),
      feature(14, 'GEOMETRY_MATCH')
    );
    expect(reviewOrder(result).map((f) => f.newIndex)).toEqual([11, 12, 10, 13, 14]);
  });

  it('steps back and forward over a review list, returning null at the boundaries', () => {
    const result = resultOf(feature(0, 'NEW'), feature(1, 'REVIEW'), feature(2, 'NEW'));
    const order = reviewOrder(result); // positions: 0->[1(REVIEW)], 1->[0(NEW)], 2->[2(NEW)]
    expect(order.map((f) => f.newIndex)).toEqual([1, 0, 2]);
    expect(neighborIndex(order, 1, 1)).toBe(0);
    expect(neighborIndex(order, 0, 1)).toBe(2);
    expect(neighborIndex(order, 2, 1)).toBeNull();
    expect(neighborIndex(order, 1, -1)).toBeNull();
    expect(neighborIndex(order, 2, -1)).toBe(0);
    // Unknown index wraps to the nearest end of the list (head).
    expect(neighborIndex(order, 99, 1)).toBe(1);
  });

  it('counts members per filter chip', () => {
    const result = resultOf(
      feature(0, 'NEW'),
      feature(1, 'GEOMETRY_MATCH'),
      feature(2, 'REVIEW'),
      feature(3, 'INVALID'),
      feature(4, 'NEW')
    );
    expect(countByFilter(result, 'all')).toBe(5);
    expect(countByFilter(result, 'new')).toBe(2);
    expect(countByFilter(result, 'geometryChanged')).toBe(1);
    expect(countByFilter(result, 'review')).toBe(1);
    expect(countByFilter(result, 'invalid')).toBe(1);
    expect(countByStatus(result, 'GEOMETRY_MATCH')).toBe(1);
  });

  it('labels stored decisions in Persian', () => {
    expect(decisionLabel({ action: 'same_existing_shop', oldShopId: 's42' })).toBe('ادغام با مغازهٔ s42');
    expect(decisionLabel({ action: 'new_shop' })).toBe('ثبت به‌عنوان مکان جدید');
    expect(decisionLabel({ action: 'exclude' })).toBe('حذف از فایل');
  });

  it('builds a panel context the page can drive from', () => {
    const result = resultOf(feature(0, 'NEW'), feature(1, 'REVIEW'), feature(2, 'DUPLICATE'));
    const decided: Record<number, ImportResolution> = { 1: { action: 'new_shop' } };
    const ctx = buildPanelContext(result, result.features[2], decided);
    expect(ctx.totalBlocking).toBe(2);
    expect(ctx.resolvedCount).toBe(1);
    expect(ctx.pending).toBe(1);
    expect(ctx.needsDecision).toBe(true);
    expect(ctx.blocking.map((f) => f.newIndex)).toEqual([1, 2]);

    const doneCtx = buildPanelContext(result, result.features[1], decided);
    expect(doneCtx.needsDecision).toBe(false);
  });
});