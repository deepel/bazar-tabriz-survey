// @vitest-environment jsdom
/**
 * End-to-end smoke QA of the import-review journey (Upload → Review → resolve
 * every blocking status → Confirm → Apply → Success) using the real page,
 * real state utils, real api client, and a fake fetch. Only the Leaflet map
 * and the auth-dependent Header are mocked. RTL + Persian digit assertions
 * match the production markup.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportResolution, ImportReviewSession } from '../types/importReview';
import ImportGeoJSON from './ImportGeoJSON';

vi.mock('../components/Header', () => ({
  default: () => <header data-testid="app-header">header</header>
}));

vi.mock('../components/ImportReviewMap', () => ({
  default: (props: { result: ImportReviewSession['result']; onSelect: (newIndex: number) => void }) => (
    <div data-testid="import-map">
      <button data-testid="map-select-first" onClick={() => props.onSelect(props.result.features[0].newIndex)}>
        select-first
      </button>
    </div>
  )
}));

const geo = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };

function reviewResult(): ImportReviewSession['result'] {
  return {
    options: {
      targetEpsg: 32638,
      searchRadiusMeters: 15,
      minCandidateScore: 0.6,
      highConfidenceScore: 0.8,
      ambiguityMargin: 0.15
    },
    summary: {
      totalFeatures: 7,
      existing: 2,
      geometryChanged: 1,
      exact: 1,
      newFeatures: 2,
      reviewRequired: 1,
      invalid: 1,
      duplicate: 1,
      oldMatched: 3,
      oldReferenced: 4
    },
    features: [
      {
        newIndex: 0,
        newFingerprint: 'f0',
        newHandle: null,
        newProperties: {},
        status: 'NEW',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: false,
        reason: null,
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      },
      {
        newIndex: 1,
        newFingerprint: 'f1',
        newHandle: 'H1',
        newProperties: {},
        status: 'REVIEW',
        matchedOldIndex: 9,
        matchedOldShopId: 's9',
        bestScore: 0.91,
        candidates: [
          {
            oldIndex: 9,
            oldShopId: 's9',
            oldName: 'صندوقی',
            oldSurveyed: true,
            oldFingerprint: 'old9',
            oldHandle: 's9',
            oldGeometryValid: true,
            oldWgs84Geometry: geo,
            evidence: { centroidDistanceMeters: 2.1, areaRatio: 0.85, overlapRatio: 0.8, bboxSimilarity: 0.83 },
            score: 0.91
          },
          {
            oldIndex: 11,
            oldShopId: 's11',
            oldName: 'کفاشی',
            oldSurveyed: false,
            oldFingerprint: 'old11',
            oldHandle: 's11',
            oldGeometryValid: true,
            oldWgs84Geometry: geo,
            evidence: { centroidDistanceMeters: 3.4, areaRatio: 0.7, overlapRatio: 0.62, bboxSimilarity: 0.7 },
            score: 0.87
          }
        ],
        reviewRequired: true,
        reason: 'ambiguous_candidates',
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      },
      {
        newIndex: 2,
        newFingerprint: 'f2',
        newHandle: 'H2',
        newProperties: {},
        status: 'GEOMETRY_MATCH',
        matchedOldIndex: 3,
        matchedOldShopId: 's3',
        bestScore: 0.84,
        candidates: [
          {
            oldIndex: 3,
            oldShopId: 's3',
            oldName: 'بزاز',
            oldSurveyed: true,
            oldFingerprint: 'old3',
            oldHandle: 's3',
            oldGeometryValid: true,
            oldWgs84Geometry: geo,
            evidence: { centroidDistanceMeters: 4.2, areaRatio: 0.55, overlapRatio: 0.4, bboxSimilarity: 0.6 },
            score: 0.84
          }
        ],
        reviewRequired: false,
        reason: null,
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      },
      {
        newIndex: 3,
        newFingerprint: 'f3',
        newHandle: 'H3',
        newProperties: {},
        status: 'INVALID',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: true,
        reason: 'invalid_geometry',
        geometryValid: false,
        geometryIssues: ['ring_has_less_than_4_points'],
        newWgs84Geometry: geo
      },
      {
        newIndex: 4,
        newFingerprint: 'f4',
        newHandle: 'H4',
        newProperties: {},
        status: 'DUPLICATE',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: true,
        reason: 'duplicate_of_new_0',
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      },
      {
        newIndex: 5,
        newFingerprint: 'f5',
        newHandle: 'H5',
        newProperties: {},
        status: 'EXACT_MATCH',
        matchedOldIndex: 4,
        matchedOldShopId: 's4',
        bestScore: 1,
        candidates: [
          {
            oldIndex: 4,
            oldShopId: 's4',
            oldName: 'آجیل‌فروشی',
            oldSurveyed: true,
            oldFingerprint: 'old4',
            oldHandle: 's4',
            oldGeometryValid: true,
            oldWgs84Geometry: geo,
            evidence: { centroidDistanceMeters: 0.05, areaRatio: 0.99, overlapRatio: 0.98, bboxSimilarity: 0.99 },
            score: 1
          }
        ],
        reviewRequired: false,
        reason: null,
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      },
      {
        newIndex: 6,
        newFingerprint: 'f6',
        newHandle: null,
        newProperties: {},
        status: 'NEW',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: false,
        reason: null,
        geometryValid: true,
        geometryIssues: [],
        newWgs84Geometry: geo
      }
    ]
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

const BLOCKING_INDICES = [1, 3, 4];

/** Fake fetch implementing the backend review session in-memory. */
function makeFetchMock(applyStatus = 200) {
  const serverResolutions = new Map<number, ImportResolution>();
  const fetchMock = vi.fn(async (url: unknown, opts?: { body?: string }) => {
    const path = String(url);
    if (path.endsWith('/import/review')) {
      return jsonResponse({ previewId: 'preview-1', filename: 'review.geojson', result: reviewResult() });
    }
    if (path.endsWith('/import/review/resolve')) {
      const body = JSON.parse(opts?.body ?? '{}') as { newIndex: number; resolution: ImportResolution };
      serverResolutions.set(body.newIndex, body.resolution);
      const resolutions: Record<number, ImportResolution> = {};
      for (const [k, v] of serverResolutions) resolutions[k] = v;
      return jsonResponse({
        ok: true,
        previewId: 'preview-1',
        resolutions,
        pending: BLOCKING_INDICES.filter((i) => !serverResolutions.has(i)).length
      });
    }
    if (path.endsWith('/import/review/apply')) {
      if (applyStatus !== 200) {
        return jsonResponse(
          { error: 'stale_import_review', message: 'داده‌های پایگاه پس از بررسی تغییر کرده؛ لطفاً دوباره بررسی کنید.' },
          applyStatus
        );
      }
      return jsonResponse({
        ok: true,
        filename: 'review.geojson',
        summary: reviewResult().summary,
        applied: { newShops: 2, updates: 3, excluded: 2 }
      });
    }
    return jsonResponse({ error: 'not_found', message: 'آدرس یافت نشد' }, 404);
  });
  return fetchMock;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.unstubAllGlobals();
});

async function renderPage() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ImportGeoJSON />
      </MemoryRouter>
    );
  });
}

async function uploadFile() {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  // jsdom's File lacks Blob.prototype.text(); the page only uses name + text().
  const file = {
    name: 'review.geojson',
    text: () => Promise.resolve(JSON.stringify(reviewResult()))
  };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const button = buttons.find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === text.trim());
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

async function clickButton(text: string) {
  await act(async () => {
    buttonByText(text).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// --- REVIEW ----------------------------------------------------------------

describe('ImportGeoJSON journey', () => {
  it('runs the full upload → review → resolve → apply → success flow', async () => {
    const fetchMock = makeFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    await renderPage();

    // Upload screen: intro, legend, file only.
    expect(container.textContent).toContain('ورود GeoJSON');
    await uploadFile();

    // Review screen opens on the first blocking feature (REVIEW #1).
    const aside = (() => {
      const el = container.querySelector('aside') as HTMLElement;
      if (!el) throw new Error('no aside');
      return el;
    })();
    const text = () => aside.textContent ?? '';

    expect(container.querySelector('[data-testid="import-map"]')).not.toBeNull();
    expect(text()).toContain('مورد ۱ از ۷');
    expect(text()).toContain('۳ مورد باقی‌مانده');
    expect(text()).toContain('همین فروشگاه است (#s9)');
    expect(text()).toContain('این مکان فروشگاه جدیدی است');
    const applyDisabled = buttonByText('هنوز ۳ مورد بررسی نشده');
    expect((applyDisabled as HTMLButtonElement).disabled).toBe(true);

    // Resolve REVIEW → advance to INVALID #3.
    await clickButton('همین فروشگاه است (#s9)');
    expect(text()).toContain('هندسه نامعتبر است');
    expect(text()).toContain('حذف از فایل (هندسه نامعتبر)');
    expect(text()).not.toContain('همین فروشگاه است');

    // Resolve INVALID → advance to DUPLICATE #4.
    await clickButton('حذف از فایل (هندسه نامعتبر)');
    expect(text()).toContain('تکراری با ویژگی #0');

    // Resolve DUPLICATE → nothing left; apply becomes enabled.
    await clickButton('حذف از فایل (تکراری)');
    expect(text()).toContain('همهٔ موارد بررسی شدند');
    buttonByText('اعمال فایل بررسی‌شده');

    // Handle NEW: select it from the (mocked) map.
    await act(async () => {
      (container.querySelector('[data-testid="map-select-first"]') as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(text()).toContain('مکان جدید — هنگام اعمال، با شناسهٔ تازه ثبت می‌شود.');
    expect(text()).toContain('این مورد نیازی به بررسی ندارد');

    // Navigate to the GEOMETRY_MATCH #2.
    await clickButton('بعدی ←');
    expect(text()).toContain('شناسهٔ فروشگاه حفظ می‌شود: #s3');

    // Filters: 'review' shows only the solved REVIEW (count ۱), 'invalid'
    // shows INVALID only (excludes the DUPLICATE), back to 'all' (۷).
    await clickButton('نیاز به بررسی ۱');
    expect(text()).toContain('مورد ۱ از ۱');
    await clickButton('نامعتبر ۱');
    expect(text()).toContain('مورد ۱ از ۱');
    await clickButton('همه ۷');
    expect(text()).toContain('مورد ۲ از ۷');

    // Confirm + apply → success screen with server-side numbers.
    await clickButton('اعمال فایل بررسی‌شده');
    expect(container.textContent).toContain('تأیید اعمال نهایی');
    await clickButton('اعمال نهایی');
    expect(container.textContent).toContain('اعمال با موفقیت انجام شد.');
    expect(container.textContent).toContain('۲ مغازهٔ جدید');
    expect(container.textContent).toContain('۳ مغازهٔ موجود');
    expect(container.textContent).toContain('۲ مورد کنار گذاشته شد');
    expect(buttonByText('ورود فایل جدید').disabled).toBe(false);

    // Exactly 3 resolve calls + 1 apply, no accidental extra API churn.
    const resolveCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/resolve'));
    const applyCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/apply'));
    expect(resolveCalls).toHaveLength(3);
    expect(applyCalls).toHaveLength(1);
  });

  it('surfaces the stale-apply error and resets to upload while keeping the reason visible', async () => {
    vi.stubGlobal('fetch', makeFetchMock(409));
    await renderPage();
    await uploadFile();

    await clickButton('همین فروشگاه است (#s9)');
    await clickButton('حذف از فایل (هندسه نامعتبر)');
    await clickButton('حذف از فایل (تکراری)');
    await clickButton('اعمال فایل بررسی‌شده');

    const text = () => container.textContent ?? '';
    expect(text()).toContain('اعمال نهایی');
    await clickButton('اعمال نهایی');

    // Back on the upload screen, with the friendly reason still visible.
    expect(text()).toContain('ورود GeoJSON');
    expect(text()).toContain('داده‌های پایگاه پس از بررسی تغییر کرده');
    expect(container.querySelector('[data-testid="import-map"]')).toBeNull();
  });
});