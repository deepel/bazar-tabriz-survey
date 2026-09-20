import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import ImportLegend from '../components/ImportLegend';
import ImportReviewMap from '../components/ImportReviewMap';
import ImportReviewPanel from '../components/ImportReviewPanel';
import ImportSummary from '../components/ImportSummary';
import { IMPORT_COLORS } from '../config/constants';
import type {
  ApplyReviewResponse,
  ImportFeatureMatch,
  ImportResolution,
  ImportReviewResult,
  ImportReviewSession,
  ResolveReviewResponse
} from '../types/importReview';
import { formatNumber } from '../utils/format';
import {
  IMPORT_FILTER_LABELS,
  IMPORT_FILTERS,
  buildPanelContext,
  countByFilter,
  countByStatus,
  isBlockingStatus,
  matchesFilter,
  neighborIndex,
  pendingBlocking,
  type ImportFilter,
  type ImportPanelContext
} from '../utils/importReviewState';

type Stage = 'upload' | 'review' | 'success';

export default function ImportGeoJSON() {
  const fileInput = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<Stage>('upload');
  const [reviewData, setReviewData] = useState<ImportReviewSession | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, ImportResolution>>({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<ImportFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [successResult, setSuccessResult] = useState<ApplyReviewResponse | null>(null);

  const result = reviewData?.result ?? null;

  const currentMatch = useMemo(
    () => (result ? result.features.find((f) => f.newIndex === selectedIndex) ?? null : null),
    [result, selectedIndex]
  );

  const ctx = useMemo(
    () => (result ? buildPanelContext(result, currentMatch, resolutions) : null),
    [result, currentMatch, resolutions]
  );

  /** Features the panel navigates through, honoring the active filter. */
  const navList = useMemo<ImportFeatureMatch[]>(() => {
    if (!result) return [];
    return filter === 'all' ? (ctx?.ordered ?? []) : result.features.filter((f) => matchesFilter(f.status, filter));
  }, [result, filter, ctx]);

  const navPos = selectedIndex === null ? 0 : navList.findIndex((f) => f.newIndex === selectedIndex) + 1;
  const pending = result ? pendingBlocking(result, resolutions) : 0;

  const filterCounts: Record<ImportFilter, number> = result
    ? {
        all: result.features.length,
        geometryChanged: countByFilter(result, 'geometryChanged'),
        new: countByFilter(result, 'new'),
        review: countByFilter(result, 'review'),
        invalid: countByFilter(result, 'invalid')
      }
    : { all: 0, geometryChanged: 0, new: 0, review: 0, invalid: 0 };

  const expectedNew =
    (result ? countByStatus(result, 'NEW') : 0) +
    Object.values(resolutions).filter((r) => r.action === 'new_shop').length;
  const expectedUpdates =
    (result ? countByStatus(result, 'EXACT_MATCH') + countByStatus(result, 'GEOMETRY_MATCH') : 0) +
    Object.values(resolutions).filter((r) => r.action === 'same_existing_shop').length;
  const expectedExcluded = result ? countByStatus(result, 'INVALID') + countByStatus(result, 'DUPLICATE') : 0;

  function resetAll() {
    setReviewData(null);
    setResolutions({});
    setSelectedIndex(null);
    setFilter('all');
    setError(null);
    setDialogError(null);
    setConfirmApply(false);
    setSuccessResult(null);
    setBusy(null);
    setStage('upload');
  }

  async function handleFile(file: File) {
    setError(null);
    setBusy('در حال بررسی فایل...');
    try {
      const content = await file.text();
      const data = await api.post<ImportReviewSession>('/api/admin/geojson/import/review', {
        filename: file.name,
        content
      });
      if (data.result.features.length === 0) {
        setError('این فایل ویژگی قابل بررسی‌ای ندارد.');
        return;
      }
      const firstBlocking = data.result.features.find((f) => isBlockingStatus(f.status));
      setReviewData(data);
      setSelectedIndex(firstBlocking?.newIndex ?? data.result.features[0].newIndex);
      setStage('review');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'بررسی فایل ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  function switchFilter(next: ImportFilter) {
    setFilter(next);
    if (!result) return;
    const list =
      next === 'all' ? (ctx?.ordered ?? []) : result.features.filter((f) => matchesFilter(f.status, next));
    if (!list.some((f) => f.newIndex === selectedIndex)) {
      setSelectedIndex(list[0]?.newIndex ?? null);
    }
  }

  function selectOnMap(newIndex: number) {
    setSelectedIndex(newIndex);
    panelRef.current?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  async function handleResolve(matchIndex: number, resolution: ImportResolution) {
    if (!reviewData) return;
    setBusy('در حال ثبت تصمیم...');
    setError(null);
    try {
      const res = await api.post<ResolveReviewResponse>('/api/admin/geojson/import/review/resolve', {
        previewId: reviewData.previewId,
        newIndex: matchIndex,
        resolution
      });
      setResolutions(res.resolutions);
      // Advance to the next unresolved blocking feature in the nav list.
      const i = navList.findIndex((f) => f.newIndex === matchIndex);
      const nextUnresolved = navList
        .slice(Math.max(i, 0) + 1)
        .find((f) => isBlockingStatus(f.status) && !(f.newIndex in res.resolutions));
      setSelectedIndex(nextUnresolved ? nextUnresolved.newIndex : matchIndex);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ثبت تصمیم ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  function handleClear(matchIndex: number) {
    setResolutions((prev) => {
      const next = { ...prev };
      delete next[matchIndex];
      return next;
    });
  }

  async function handleApply() {
    if (!reviewData) return;
    setBusy('در حال اعمال تغییرات...');
    setDialogError(null);
    try {
      const res = await api.post<ApplyReviewResponse>('/api/admin/geojson/import/review/apply', {
        previewId: reviewData.previewId
      });
      setSuccessResult(res);
      setConfirmApply(false);
      setStage('success');
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setDialogError(apiError?.message ?? 'اعمال تغییرات ناموفق بود.');
      if (apiError?.code === 'stale_import_review') {
        // The dataset changed after review; a fresh upload is required. Keep
        // the friendly reason visible after the reset back to the upload step.
        const message = apiError.message;
        resetAll();
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <Header
      center={<span className="font-bold">بررسی و اعمال GeoJSON</span>}
      right={
        <Link to="/admin" className="btn-ghost px-2.5 py-1.5 text-xs">
          بازگشت به پنل
        </Link>
      }
    />
  );

  if (stage === 'success' && successResult) {
    return (
      <div className="min-h-screen bg-[#f4f1ec]">
        {header}
        <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <div className="mb-1 font-bold">اعمال با موفقیت انجام شد.</div>
            <div className="text-xs leading-relaxed">
              {formatNumber(successResult.applied.newShops)} مغازهٔ جدید ثبت شد،{' '}
              {formatNumber(successResult.applied.updates)} مغازهٔ موجود به‌روزرسانی شد و{' '}
              {formatNumber(successResult.applied.excluded)} مورد کنار گذاشته شد.
            </div>
          </div>
          <ImportSummary summary={successResult.summary} />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={resetAll}>
              ورود فایل جدید
            </button>
            <Link to="/admin" className="btn-ghost flex-1 text-center">
              بازگشت به پنل
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f1ec]">
      {header}
      {stage === 'review' && reviewData && result && currentMatch && ctx ? (
        <ReviewLayout
          filename={reviewData.filename}
          result={result}
          currentMatch={currentMatch}
          ctx={ctx}
          navList={navList}
          navPos={navPos}
          pending={pending}
          resolutions={resolutions}
          filter={filter}
          filterCounts={filterCounts}
          selectedIndex={selectedIndex}
          busy={busy}
          error={error}
          dialogError={dialogError}
          confirmApply={confirmApply}
          expected={{ newShops: expectedNew, updates: expectedUpdates, excluded: expectedExcluded }}
          onSwitchFilter={switchFilter}
          onSelect={selectOnMap}
          onResolve={handleResolve}
          onClear={handleClear}
          onApply={handleApply}
          onCloseApply={() => setConfirmApply(false)}
          onOpenApply={() => {
            setDialogError(null);
            setConfirmApply(true);
          }}
          onReset={resetAll}
          panelRef={panelRef}
        />
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4">
          <section className="card">
            <h2 className="mb-2 text-sm font-bold">ورود GeoJSON</h2>
            <p className="mb-4 text-xs leading-relaxed text-slate-500">
              فایل GeoJSON را انتخاب کنید. پیش‌نمایش روی نقشه با رنگ‌بندی تطبیق هندسی نمایش داده
              می‌شود؛ مواردی که نیاز به بررسی دارند را تعیین تکلیف کنید و سپس با تأیید نهایی، داده‌ها در
              یک تراکنش امن اعمال می‌شوند. هیچ مغازه یا اطلاعات برداشتی از بین نمی‌رود.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#a84f35] file:px-4 file:py-2.5 file:text-sm file:text-white hover:file:bg-[#8f402b]"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <div className="mt-3">
              <span className="text-xs text-slate-400">فایل: {reviewData?.filename ?? 'انتخاب نشده'}</span>
            </div>
          </section>
          <ImportLegend />
          {busy && <div className="card text-center text-sm text-slate-500">{busy}</div>}
          {error && <ErrorMessage message={error} />}
        </main>
      )}
    </div>
  );
}

interface ReviewLayoutProps {
  filename: string;
  result: ImportReviewResult;
  currentMatch: ImportFeatureMatch;
  ctx: ImportPanelContext;
  navList: ImportFeatureMatch[];
  navPos: number;
  pending: number;
  resolutions: Record<number, ImportResolution>;
  filter: ImportFilter;
  filterCounts: Record<ImportFilter, number>;
  selectedIndex: number | null;
  busy: string | null;
  error: string | null;
  dialogError: string | null;
  confirmApply: boolean;
  expected: { newShops: number; updates: number; excluded: number };
  onSwitchFilter: (next: ImportFilter) => void;
  onSelect: (newIndex: number) => void;
  onResolve: (matchIndex: number, resolution: ImportResolution) => void;
  onClear: (matchIndex: number) => void;
  onApply: () => void;
  onCloseApply: () => void;
  onOpenApply: () => void;
  onReset: () => void;
  panelRef: React.RefObject<HTMLElement>;
}

function ReviewLayout({
  filename,
  result,
  currentMatch,
  ctx,
  navList,
  navPos,
  pending,
  resolutions,
  filter,
  filterCounts,
  selectedIndex,
  busy,
  error,
  dialogError,
  confirmApply,
  expected,
  onSwitchFilter,
  onSelect,
  onResolve,
  onClear,
  onApply,
  onCloseApply,
  onOpenApply,
  onReset,
  panelRef
}: ReviewLayoutProps) {
  const prevIndex = neighborIndex(navList, selectedIndex ?? NaN, -1);
  const nextIndex = neighborIndex(navList, selectedIndex ?? NaN, 1);
  const canApply = pending === 0 && busy === null;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
      <div className="sticky top-0 z-[400] h-[45dvh] w-full shrink-0 lg:static lg:h-auto lg:w-[65%]">
        <ImportReviewMap result={result} selectedNewIndex={selectedIndex} onSelect={onSelect} />
        <div className="absolute right-3 top-3 z-[500] rounded-xl border border-[#e4ddd3] bg-[#fffdfa]/95 px-3 py-2 shadow-lg">
          <ImportLegend />
        </div>
      </div>

      <aside
        ref={panelRef}
        className="min-h-0 flex-1 overflow-y-auto border-t border-[#e4ddd3] bg-[#f4f1ec] p-4 lg:w-[35%] lg:border-r lg:border-t-0 lg:p-5"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">
              مورد {formatNumber(navPos)} از {formatNumber(Math.max(navList.length, 1))}
            </h2>
            <span className={`text-[11px] font-semibold ${pending === 0 ? 'text-green-600' : 'text-[#a84f35]'}`}>
              {pending === 0 ? 'همهٔ موارد بررسی شدند' : `${formatNumber(pending)} مورد باقی‌مانده`}
            </span>
          </div>

          {ctx.totalBlocking > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-[#e4ddd3]">
              <div
                className="h-full rounded-full bg-[#a84f35] transition-all duration-300"
                style={{ width: `${Math.round((ctx.resolvedCount / ctx.totalBlocking) * 100)}%` }}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {IMPORT_FILTERS.map((f) => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    active
                      ? 'border-[#a84f35] bg-[#a84f35] text-white'
                      : 'border-[#ded8ce] bg-white text-slate-600 hover:border-[#bcae9e]'
                  }`}
                  onClick={() => onSwitchFilter(f)}
                >
                  {IMPORT_FILTER_LABELS[f]} {formatNumber(filterCounts[f])}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-[11px] text-slate-400" dir="ltr">
              {filename}
            </span>
            <span className="whitespace-nowrap text-slate-400">
              {formatNumber(result.summary.totalFeatures)} ویژگی
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-ghost flex-1 px-2 text-xs"
              disabled={navPos <= 1}
              onClick={() => prevIndex !== null && onSelect(prevIndex)}
            >
              → قبلی
            </button>
            <button
              className="btn-ghost flex-1 px-2 text-xs"
              disabled={navPos >= navList.length}
              onClick={() => nextIndex !== null && onSelect(nextIndex)}
            >
              بعدی ←
            </button>
          </div>

          <ImportReviewPanel
            match={currentMatch}
            resolution={resolutions[currentMatch.newIndex]}
            pinnedOldIndex={currentMatch.candidates[0]?.oldIndex}
            onPick={(oldIndex) => void onResolve(currentMatch.newIndex, { action: 'same_existing_shop', oldShopId: String(oldIndex) })}
            onResolve={(match, resolution) => void onResolve(match.newIndex, resolution)}
            onClearResolution={(match) => onClear(match.newIndex)}
            busy={busy !== null}
          />

          {error && <ErrorMessage message={error} />}

          <div className="card space-y-2.5 bg-white">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Pill label="مغازهٔ جدید" value={expected.newShops} accent={IMPORT_COLORS.new.color} />
              <Pill label="به‌روزرسانی" value={expected.updates} accent={IMPORT_COLORS.geometryChanged.color} />
              <Pill label="حذف از فایل" value={expected.excluded} accent={IMPORT_COLORS.invalid.color} />
            </div>
            <button className="btn-primary w-full text-xs" disabled={!canApply} onClick={onOpenApply}>
              {pending > 0 ? `هنوز ${formatNumber(pending)} مورد بررسی نشده` : 'اعمال فایل بررسی‌شده'}
            </button>
            <button className="btn-ghost w-full text-xs" disabled={busy !== null} onClick={onReset}>
              بارگذاری مجدد فایل
            </button>
          </div>
        </div>
      </aside>

      {confirmApply && (
        <ConfirmDialog
          filename={filename}
          expected={expected}
          busy={busy !== null}
          error={dialogError}
          onCancel={onCloseApply}
          onApply={onApply}
        />
      )}
    </div>
  );
}

function Pill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-[#e4ddd3] bg-[#faf8f4] px-2 py-2">
      <div className="text-base font-bold" style={{ color: accent }}>
        {formatNumber(value)}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function ConfirmDialog({
  filename,
  expected,
  busy,
  error,
  onCancel,
  onApply
}: {
  filename: string;
  expected: { newShops: number; updates: number; excluded: number };
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/45 p-4" onClick={onCancel}>
      <div
        className="card w-full max-w-md space-y-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3 className="text-sm font-bold">تأیید اعمال نهایی</h3>
        <p className="text-xs leading-relaxed text-slate-600">
          این فایل به‌صورت دائمی با دیتابیس ادغام می‌شود:{' '}
          <span className="font-semibold" dir="ltr">
            {filename}
          </span>
          . مغازه‌های موجود و اطلاعات برداشتی حذف نخواهند شد.
        </p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <div className="font-bold">{formatNumber(expected.newShops)}</div>
            <div className="text-[10px]">مغازهٔ جدید</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-2 text-amber-700">
            <div className="font-bold">{formatNumber(expected.updates)}</div>
            <div className="text-[10px]">به‌روزرسانی</div>
          </div>
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
            <div className="font-bold">{formatNumber(expected.excluded)}</div>
            <div className="text-[10px]">حذف از فایل</div>
          </div>
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 text-xs" onClick={onCancel} disabled={busy}>
            انصراف
          </button>
          <button className="btn-primary flex-1 text-xs" onClick={onApply} disabled={busy}>
            {busy ? 'در حال اعمال...' : 'اعمال نهایی'}
          </button>
        </div>
      </div>
    </div>
  );
}