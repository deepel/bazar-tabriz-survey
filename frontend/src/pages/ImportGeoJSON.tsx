import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import type { ImportPreview } from '../types';
import { formatNumber } from '../utils/format';

export default function ImportGeoJSON() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleFile(file: File) {
    setPreview(null);
    setError(null);
    setDone(null);
    setFilename(file.name);
    const content = await file.text();
    setBusy('در حال بررسی فایل...');
    try {
      const result = await api.post<ImportPreview>('/api/admin/geojson/import/preview', {
        filename: file.name,
        content
      });
      setPreview(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'بررسی فایل ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setBusy('در حال اعمال تغییرات...');
    setError(null);
    setDone(null);
    try {
      const result = await api.post<{ ok: boolean; filename: string; stats: ImportPreview['stats'] }>(
        '/api/admin/geojson/import/apply',
        { previewId: preview.previewId }
      );
      setDone(
        `اعمال شد: ${formatNumber(result.stats.totalFeatures)} ویژگی، ${formatNumber(result.stats.newShops)} مغازه جدید.`
      );
      setPreview(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'اعمال تغییرات ناموفق بود.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        center={<span className="font-bold">مدیریت داده GIS</span>}
        right={
          <Link to="/admin" className="btn-ghost px-2.5 py-1.5 text-xs">
            بازگشت به پنل
          </Link>
        }
      />
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <section className="card">
          <h2 className="mb-2 text-sm font-bold">ورود GeoJSON</h2>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            فایل GeoJSON را انتخاب کنید. ابتدا پیش‌نمایش تغییرات نمایش داده می‌شود و پس از
            تأیید شما، داده‌ها به‌صورت غیرمخرب با دیتابیس ادغام می‌شوند. هیچ مغازه یا
            اطلاعات برداشتی از بین نمی‌رود.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".geojson,.json,application/geo+json,application/json"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2.5 file:text-sm file:text-white hover:file:bg-blue-700"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="mt-2 text-xs text-slate-400">
            فایل: {filename ?? 'انتخاب نشده'}
          </div>
        </section>

        {busy && <div className="card text-center text-sm text-slate-500">{busy}</div>}

        {error && <ErrorMessage message={error} />}

        {done && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {done}
          </div>
        )}

        {preview && (
          <section className="card">
            <h2 className="mb-3 text-sm font-bold">پیش‌نمایش</h2>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <StatItem label="تعداد Feature" value={formatNumber(preview.stats.totalFeatures)} />
              <StatItem label="موجود" value={formatNumber(preview.stats.existingShops)} />
              <StatItem label="جدید" value={formatNumber(preview.stats.newShops)} />
              <StatItem label="هندسه تغییر کرده" value={formatNumber(preview.stats.geometryChanges)} />
              <StatItem label="شناسه تکراری" value={formatNumber(preview.stats.duplicateIds)} />
              <StatItem label="شناسه نامعتبر" value={formatNumber(preview.stats.missingIds)} />
              <StatItem label="هندسه نامعتبر" value={formatNumber(preview.stats.invalidGeometries)} />
              <StatItem label="Feature نامعتبر" value={formatNumber(preview.stats.invalidFeatures)} />
            </div>

            {preview.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-red-700">
                <div className="mb-1 font-semibold">خطاها:</div>
                {preview.errors.slice(0, 50).map((err) => (
                  <div key={err.index}>
                    #{err.index}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                className="btn-ghost"
                onClick={() => setPreview(null)}
                disabled={busy !== null}
              >
                انصراف
              </button>
              <button
                className="btn-primary"
                onClick={handleApply}
                disabled={busy !== null || preview.stats.invalidFeatures > 0}
              >
                اعمال تغییرات
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-center">
      <div className="text-base font-bold text-slate-800">{value}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}