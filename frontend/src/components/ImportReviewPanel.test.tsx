import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ImportFeatureMatch, ImportResolution } from '../types/importReview';
import ImportReviewPanel from './ImportReviewPanel';
import ImportCandidateCard from './ImportCandidateCard';

const GEOMETRY = { type: 'Polygon', coordinates: [] };

function candidate(oldIndex: number, oldShopId: string, score = 0.9): ImportFeatureMatch['candidates'][number] {
  return {
    oldIndex,
    oldShopId,
    oldName: null,
    oldSurveyed: false,
    oldFingerprint: `fp_${oldShopId}`,
    oldHandle: null,
    oldGeometryValid: true,
    oldWgs84Geometry: GEOMETRY,
    evidence: { centroidDistanceMeters: 1.2, areaRatio: 0.95, overlapRatio: 0.97, bboxSimilarity: 0.91 },
    score
  };
}

function match(status: ImportFeatureMatch['status'], withCandidates = false): ImportFeatureMatch {
  return {
    newIndex: 2,
    newFingerprint: 'fp_new',
    newHandle: '1DA',
    newProperties: {},
    status,
    matchedOldIndex: status === 'GEOMETRY_MATCH' ? 0 : null,
    matchedOldShopId: status === 'GEOMETRY_MATCH' ? 's1' : null,
    bestScore: withCandidates ? 0.9 : null,
    candidates: withCandidates ? [candidate(0, 's1'), candidate(1, 's2', 0.81)] : [],
    reviewRequired: status === 'REVIEW' || status === 'INVALID' || status === 'DUPLICATE',
    reason:
      status === 'REVIEW'
        ? 'ambiguous_candidates'
        : status === 'INVALID'
          ? 'invalid_geometry'
          : status === 'DUPLICATE'
            ? 'duplicate_of_new_0'
            : null,
    geometryValid: status !== 'INVALID',
    geometryIssues: status === 'INVALID' ? ['shell_self_intersects'] : [],
    newWgs84Geometry: GEOMETRY
  };
}

const render = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ImportReviewPanel markup', () => {
  it('offers both REVIEW decisions with the best candidate as the default target', () => {
    const html = render(<ImportReviewPanel match={match('REVIEW', true)} />);
    expect(html).toContain('همین فروشگاه است');
    expect(html).toContain('این مکان فروشگاه جدیدی است');
    expect(html).toContain('s1');
    expect(html).toContain('پیشنهاد برتر');
    expect(html).toContain('چند گزینهٔ مشابه برای این ویژگی یافت شد');
  });

  it('never suggests merging an INVALID feature; only exclusion is offered', () => {
    const html = render(<ImportReviewPanel match={match('INVALID')} />);
    expect(html).toContain('هندسه نامعتبر است');
    expect(html).toContain('اصلاح خودکار انجام نمی‌شود');
    expect(html).toContain('حذف از فایل');
    expect(html).not.toContain('همین فروشگاه است');
    expect(html).not.toContain('فروشگاه جدیدی است');
  });

  it('marks non-blocking matches as auto-applied without decisions', () => {
    const geometryChanged = render(<ImportReviewPanel match={match('GEOMETRY_MATCH')} />);
    expect(geometryChanged).toContain('شناسهٔ فروشگاه حفظ می‌شود');
    expect(geometryChanged).not.toContain('همین فروشگاه است');

    const fresh = render(<ImportReviewPanel match={match('NEW')} />);
    expect(fresh).toContain('این مورد نیازی به بررسی ندارد');
    expect(fresh).toContain('مکان جدید');
  });

  it('shows the resolved banner and a way to change the decision', () => {
    const resolution: ImportResolution = { action: 'same_existing_shop', oldShopId: 's2' };
    const html = render(
      <ImportReviewPanel match={match('REVIEW', true)} resolution={resolution} pinnedOldIndex={1} />
    );
    expect(html).toContain('این مورد برای اعمال آماده است.');
    expect(html).toContain('ادغام با مغازهٔ s2');
    expect(html).toContain('تغییر تصمیم');
    // The decision buttons are gone once resolved.
    expect(html).not.toContain('فروشگاه جدیدی است');
  });
});

describe('ImportCandidateCard markup', () => {
  it('hides the raw technical evidence behind a collapsible block', () => {
    const html = render(<ImportCandidateCard candidate={candidate(0, 's1')} best />);
    expect(html).toContain('جزئیات فنی');
    expect(html).toContain('fp_s1');
    expect(html).toContain('انتخاب این گزینه');
  });
});