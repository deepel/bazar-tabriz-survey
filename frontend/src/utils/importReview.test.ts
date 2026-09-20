import { describe, expect, it } from 'vitest';
import {
  IMPORT_STATUS_LABELS,
  formatMeters,
  formatScore,
  isReviewReason,
  issueLabel,
  reasonLabel
} from './importReview';

describe('import review labels', () => {
  it('labels every engine status', () => {
    expect(IMPORT_STATUS_LABELS).toMatchObject({
      EXACT_MATCH: 'بدون تغییر',
      GEOMETRY_MATCH: 'تغییر هندسه',
      NEW: 'جدید',
      REVIEW: 'نیاز به بررسی',
      INVALID: 'نامعتبر',
      DUPLICATE: 'تکراری'
    });
  });

  it('maps reason codes to Persian and backtick duplicate reasons', () => {
    expect(reasonLabel(null)).toBeNull();
    expect(reasonLabel('ambiguous_candidates')).toBe('چند گزینهٔ مشابه برای این ویژگی یافت شد');
    expect(reasonLabel('invalid_old_geometry')).toContain('نامعتبر');
    expect(reasonLabel('conflict_one_to_many')).toContain('تخصیص');
    expect(reasonLabel('whatever_unknown')).toBe('نیازمند بررسی');
    expect(reasonLabel('duplicate_of_new_42')).toBe('تکراری با ویژگی #42');
  });

  it('treats every review reason as REVIEW, duplicates as not review', () => {
    expect(isReviewReason('invalid_geometry')).toBe(true);
    expect(isReviewReason('invalid_old_geometry')).toBe(true);
    expect(isReviewReason('ambiguous_candidates')).toBe(true);
    expect(isReviewReason('low_confidence')).toBe(true);
    expect(isReviewReason('conflict_one_to_many')).toBe(true);
    expect(isReviewReason('duplicate_of_new_3')).toBe(false);
    expect(isReviewReason(null)).toBe(false);
  });

  it('maps geometry issue codes (including the real bowtie/flag case)', () => {
    expect(issueLabel('shell_self_intersects')).toBe('بدنه خطوط را قطع می‌کند');
    expect(issueLabel('hole_outside_shell')).toBe('حفره خارج از بدنه قرار دارد');
    expect(issueLabel('ring_not_closed')).toMatch(/بسته/);
    expect(issueLabel('mystery_code')).toBe('mystery_code');
  });
});

describe('import review formatting', () => {
  it('formats meters with one decimal below 100 m', () => {
    expect(formatMeters(3.7)).toBe('۳.۷ متر');
    expect(formatMeters(38.78)).toBe('۳۸.۸ متر');
    expect(formatMeters(120)).toBe('۱۲۰ متر');
  });

  it('formats scores as percents (null-safe)', () => {
    expect(formatScore(0.696)).toBe('۷۰٪');
    expect(formatScore(1)).toBe('۱۰۰٪');
    expect(formatScore(null)).toBe('—');
  });
});