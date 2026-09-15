import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import type { GisLayer, GisLayersResponse } from '../types';
import { formatDate } from '../utils/format';

interface Draft {
  display_name: string;
  source_url: string;
}

async function fetchLayers(): Promise<GisLayer[]> {
  const res = await api.get<GisLayersResponse>('/api/gis-layers');
  return res.layers;
}

export default function AdminLayers() {
  const [layers, setLayers] = useState<GisLayer[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchLayers();
      setLayers(data);
      setDrafts(
        Object.fromEntries(
          data.map((layer) => [
            layer.layer_key,
            { display_name: layer.display_name, source_url: layer.source_url }
          ])
        )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دریافت لایه‌های مرجع ناموفق بود.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(layerKey: string, field: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [layerKey]: { ...prev[layerKey], [field]: value }
    }));
  }

  async function saveLayer(layer: GisLayer) {
    const draft = drafts[layer.layer_key];
    if (!draft) return;
    setBusyKey(layer.layer_key);
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/api/admin/gis-layers/${encodeURIComponent(layer.layer_key)}`, {
        display_name: draft.display_name,
        source_url: draft.source_url
      });
      setMessage(`«${draft.display_name}» ذخیره شد.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره لایه ناموفق بود.');
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleEnabled(layer: GisLayer) {
    setBusyKey(layer.layer_key);
    setError(null);
    setMessage(null);
    try {
      await api.patch(`/api/admin/gis-layers/${encodeURIComponent(layer.layer_key)}`, {
        enabled: !layer.enabled
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'به‌روزرسانی وضعیت لایه ناموفق بود.');
    } finally {
      setBusyKey(null);
    }
  }

  async function forceRefresh(layer: GisLayer) {
    setBusyKey(layer.layer_key);
    setError(null);
    setMessage(null);
    try {
      await api.post(`/api/admin/gis-layers/${encodeURIComponent(layer.layer_key)}/refresh`);
      setMessage('دانلود مجدد این لایه در نقشه‌ها درخواست شد.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'بازنشانی لایه ناموفق بود.');
    } finally {
      setBusyKey(null);
    }
  }

  if (!layers) {
    return (
      <div className="min-h-screen bg-slate-100">
        <Header center={<span className="font-bold">مدیریت لایه‌های نقشه</span>} right={null} />
        {error ? (
          <ErrorMessage message={error} onRetry={load} />
        ) : (
          <LoadingState message="در حال دریافت لایه‌ها..." />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        center={<span className="font-bold">مدیریت لایه‌های نقشه</span>}
        right={
          <Link to="/admin" className="btn-ghost px-2.5 py-1.5 text-xs">
            پنل مدیر
          </Link>
        }
      />
      <main className="mx-auto max-w-4xl space-y-4 p-4">
        {error && <ErrorMessage message={error} onRetry={load} />}
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {message}
          </div>
        )}

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">لایه‌های مرجع تاریخی</h2>
            <span className="text-xs text-slate-400">
              فقط مدیر می‌تواند آدرس منبع و وضعیت لایه‌ها را تغییر دهد.
            </span>
          </div>

          {layers.map((layer) => {
            const draft = drafts[layer.layer_key];
            if (!draft) return null;
            const busy = busyKey === layer.layer_key;
            return (
              <article key={layer.layer_key} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">
                    {layer.layer_key}
                  </span>
                  <input
                    className="input w-36"
                    value={draft.display_name}
                    onChange={(e) => setField(layer.layer_key, 'display_name', e.target.value)}
                    aria-label="نام نمایشی"
                  />
                  <button
                    className={`btn-ghost text-xs ${layer.enabled ? '' : 'opacity-60'}`}
                    onClick={() => toggleEnabled(layer)}
                    disabled={busy}
                  >
                    {layer.enabled ? 'فعال ✓' : 'غیرفعال'}
                  </button>
                  <div className="grow" />
                  <button className="btn-success text-xs" onClick={() => saveLayer(layer)} disabled={busy}>
                    {busy ? '...' : 'ذخیره'}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => forceRefresh(layer)} disabled={busy}>
                    دانلود مجدد
                  </button>
                </div>
                <input
                  className="input mt-2 w-full text-xs"
                  dir="ltr"
                  value={draft.source_url}
                  onChange={(e) => setField(layer.layer_key, 'source_url', e.target.value)}
                  aria-label="آدرس منبع"
                />
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-slate-400">
                  <span>نسخه کش: {layer.cache_version}</span>
                  <span>آخرین تغییر: {formatDate(layer.updated_at)}</span>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}