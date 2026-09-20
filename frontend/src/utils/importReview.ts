import type { ImportMatchStatus } from '../types/importReview';
import { formatNumber } from './format';

export const IMPORT_STATUS_LABELS: Record<ImportMatchStatus, string> = {
  EXACT_MATCH: 'بدون تغییر',
  GEOMETRY_MATCH: 'تغییر هندسه',
  NEW: 'جدید',
  REVIEW: 'نیاز به بررسی',
  INVALID: 'نامعتبر',
  DUPLICATE: 'تکراری'
};

/** Rounds distances (meters) for display: high-precision below 100 m. */
export function formatMeters(m: number): string {
  return `${formatNumber(Number(m.toFixed(m < 100 ? 1 : 0)))} متر`;
}

/** Formats a 0..1 score as a percent. */
export function formatScore(score: number | null): string {
  if (score === null) return '—';
  return `${formatNumber(Math.round(score * 100))}٪`;
}

/** Persian wording for a review/invalid reason code (null reasons stay null). */
export function reasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.startsWith('duplicate_of_new_')) {
    const origin = reason.slice('duplicate_of_new_'.length);
    return `تکراری با ویژگی #${origin}`;
  }
  const labels: Record<string, string> = {
    invalid_geometry: 'هندسه این ویژگی نامعتبر است',
    invalid_old_geometry: 'هندسهٔ مغازهٔ موجود نامعتبر است؛ تأیید لازم است',
    ambiguous_candidates: 'چند گزینهٔ مشابه برای این ویژگی یافت شد',
    low_confidence: 'میزان شباهت برای تأیید خودکار کافی نیست',
    conflict_one_to_many: 'این مغازهٔ موجود قبلاً به ویژگی دیگری تخصیص یافته'
  };
  return labels[reason] ?? 'نیازمند بررسی';
}

const ISSUE_LABELS: Record<string, string> = {
  non_finite_coordinates: 'مختصات نامعتبر (غیرعددی)',
  unsupported_geometry_type: 'نوع هندسه پشتیبانی‌نشده',
  polygon_has_no_rings: 'چندضلعی بدون رینگ',
  shell_has_less_than_4_points: 'بدنه کمتر از ۴ نقطه دارد',
  hole_has_less_than_4_points: 'حفره کمتر از ۴ نقطه دارد',
  ring_has_less_than_4_points: 'رینگ کمتر از ۴ نقطه دارد',
  ring_not_closed: 'رینگ بسته نیست',
  ring_has_zero_area: 'رینگ مساحت صفر دارد',
  ring_has_repeated_consecutive_points: 'رینگ نقطه تکراری پیاپی دارد',
  shell_self_intersects: 'بدنه خطوط را قطع می‌کند',
  hole_self_intersects: 'حفره خطوط را قطع می‌کند',
  hole_outside_shell: 'حفره خارج از بدنه قرار دارد',
  multipolygon_parts_overlap: 'بخش‌های MultiPolygon با هم هم‌پوشانی دارند'
};

export function issueLabel(issue: string): string {
  return ISSUE_LABELS[issue] ?? issue;
}

const DEFAULT_REVIEW_REASONS: ReadonlySet<string> = new Set([
  'invalid_geometry',
  'invalid_old_geometry',
  'ambiguous_candidates',
  'low_confidence',
  'conflict_one_to_many'
]);

/** Scores the engine calls REVIEW by default; everything else must be mapped explicitly. */
export function isReviewReason(reason: string | null): boolean {
  if (!reason || reason.startsWith('duplicate_of_new_')) return false;
  return DEFAULT_REVIEW_REASONS.has(reason);
}