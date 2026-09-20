import { IMPORT_COLORS } from '../config/constants';
import type {
  ImportFeatureMatch,
  ImportMatchStatus,
  ImportResolution,
  ImportReviewResult
} from '../types/importReview';
import { isReviewReason } from './importReview';

export type ImportFilter = 'all' | 'geometryChanged' | 'new' | 'review' | 'invalid';

export const IMPORT_FILTER_LABELS: Record<ImportFilter, string> = {
  all: 'همه',
  geometryChanged: 'تغییر هندسه',
  new: 'جدید',
  review: 'نیاز به بررسی',
  invalid: 'نامعتبر'
};

export const IMPORT_FILTERS: ImportFilter[] = [
  'all',
  'geometryChanged',
  'new',
  'review',
  'invalid'
];

/** Tone key of the shared IMPORT_COLORS palette for a feature status. */
export type ImportTone = keyof typeof IMPORT_COLORS;

/** Statuses that MUST receive an explicit human decision before applying. */
export function isBlockingStatus(status: ImportMatchStatus): boolean {
  return status === 'REVIEW' || status === 'INVALID' || status === 'DUPLICATE';
}

/**
 * Map color per status. Duplicates share the muted invalid tone: they are
 * excluded from the file, never stored, so they must read as "problem".
 */
export function statusTone(status: ImportMatchStatus): ImportTone {
  switch (status) {
    case 'EXACT_MATCH':
      return 'existing';
    case 'GEOMETRY_MATCH':
      return 'geometryChanged';
    case 'NEW':
      return 'new';
    case 'REVIEW':
      return 'review';
    case 'INVALID':
    case 'DUPLICATE':
      return 'invalid';
  }
}

const STATUS_TO_FILTER: Partial<Record<ImportMatchStatus, ImportFilter>> = {
  GEOMETRY_MATCH: 'geometryChanged',
  NEW: 'new',
  REVIEW: 'review',
  INVALID: 'invalid'
};

export function matchesFilter(status: ImportMatchStatus, filter: ImportFilter): boolean {
  if (filter === 'all') return true;
  return STATUS_TO_FILTER[status] === filter;
}

/** A blocking feature counts as resolved once it has a stored decision. */
export function isResolved(
  feature: ImportFeatureMatch,
  resolutions: Record<number, ImportResolution>
): boolean {
  if (!isBlockingStatus(feature.status)) return true;
  return feature.newIndex in resolutions;
}

export function pendingBlocking(
  result: ImportReviewResult,
  resolutions: Record<number, ImportResolution>
): number {
  return result.features.filter((f) => !isResolved(f, resolutions)).length;
}

export function allResolved(
  result: ImportReviewResult,
  resolutions: Record<number, ImportResolution>
): boolean {
  return pendingBlocking(result, resolutions) === 0;
}

/** Blocking features (in file order) come first for review, then the rest. */
export function reviewOrder(result: ImportReviewResult): ImportFeatureMatch[] {
  return [...result.features].sort((a, b) => {
    const aBlocking = isBlockingStatus(a.status) ? 0 : 1;
    const bBlocking = isBlockingStatus(b.status) ? 0 : 1;
    return aBlocking - bBlocking || a.newIndex - b.newIndex;
  });
}

/** Next/previous index inside `list`; returns null at the boundary. */
export function neighborIndex(
  list: ImportFeatureMatch[],
  currentIndex: number,
  direction: 1 | -1
): number | null {
  const i = list.findIndex((f) => f.newIndex === currentIndex);
  if (i === -1) return direction === 1 ? list[0]?.newIndex ?? null : list[list.length - 1]?.newIndex ?? null;
  const next = list[i + direction];
  return next ? next.newIndex : null;
}

export function countByFilter(
  result: ImportReviewResult,
  filter: ImportFilter
): number {
  if (filter === 'all') return result.features.length;
  return result.features.filter((f) => matchesFilter(f.status, filter)).length;
}

export function countByStatus(result: ImportReviewResult, status: ImportMatchStatus): number {
  return result.features.filter((f) => f.status === status).length;
}

/** Persian text describing a stored decision. */
export function decisionLabel(resolution: ImportResolution): string {
  switch (resolution.action) {
    case 'same_existing_shop':
      return `ادغام با مغازهٔ ${resolution.oldShopId ?? '—'}`;
    case 'new_shop':
      return 'ثبت به‌عنوان مکان جدید';
    case 'exclude':
      return 'حذف از فایل';
  }
}

export interface ImportPanelContext {
  ordered: ImportFeatureMatch[];
  /** Blocking features only, in review order. */
  blocking: ImportFeatureMatch[];
  pending: number;
  resolvedCount: number;
  totalBlocking: number;
  /** Whether `current` has no decision yet and the panel should show actions. */
  needsDecision: boolean;
}

export function buildPanelContext(
  result: ImportReviewResult,
  current: ImportFeatureMatch | null,
  resolutions: Record<number, ImportResolution>
): ImportPanelContext {
  const ordered = reviewOrder(result);
  const blocking = ordered.filter((f) => isBlockingStatus(f.status));
  const pending = pendingBlocking(result, resolutions);
  const resolvedCount = blocking.length - pending;
  return {
    ordered,
    blocking,
    pending,
    resolvedCount,
    totalBlocking: blocking.length,
    needsDecision: !!current && isBlockingStatus(current.status) && !isResolved(current, resolutions)
  };
}

export { isReviewReason };