import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, downloadJson } from '../api/client';
import type { SystemLog, SystemLogLevel } from '../types';
import { formatDate, formatNumber } from '../utils/format';

const levelLabels: Record<SystemLogLevel, string> = {
  debug: 'جزئیات',
  info: 'اطلاعات',
  warn: 'هشدار',
  error: 'خطا'
};

const levelStyles: Record<SystemLogLevel, string> = {
  debug: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-50 text-blue-700',
  warn: 'bg-amber-50 text-amber-700',
  error: 'bg-red-50 text-red-700'
};

interface LogsResponse {
  logs: SystemLog[];
  total: number;
  limit: number;
  offset: number;
}

export default function SystemLogPanel() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState<SystemLogLevel | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: '100' });
      if (level) query.set('level', level);
      if (search.trim()) query.set('q', search.trim());
      const result = await api.get<LogsResponse>(`/api/admin/system-logs?${query.toString()}`);
      setLogs(result.logs);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دریافت لاگ‌های سیستم ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [level, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    setExporting(true);
    try {
      const result = await api.get<{ exportedAt: string; logs: SystemLog[] }>(
        '/api/admin/system-logs?limit=5000'
      );
      downloadJson(
        { exportedAt: result.exportedAt ?? new Date().toISOString(), logs: result.logs },
        `bazar-system-logs-${new Date().toISOString().slice(0, 10)}.json`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خروجی لاگ‌ها ناموفق بود.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">لاگ سیستم</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            رخدادهای ورود، خطاها، برداشت و عملیات مدیریتی
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost px-3 py-2 text-xs" onClick={() => void load()} disabled={loading}>
            تازه‌سازی
          </button>
          <button className="btn-primary px-3 py-2 text-xs" onClick={() => void handleExport()} disabled={exporting}>
            {exporting ? 'در حال آماده‌سازی...' : 'خروجی JSON'}
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
        <input
          className="input"
          placeholder="جست‌وجو در رویداد یا جزئیات..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="input" value={level} onChange={(event) => setLevel(event.target.value as SystemLogLevel | '')}>
          <option value="">همه سطوح</option>
          <option value="error">خطا</option>
          <option value="warn">هشدار</option>
          <option value="info">اطلاعات</option>
          <option value="debug">جزئیات</option>
        </select>
        <div className="flex items-center px-2 text-xs text-slate-400">{formatNumber(total)} رخداد</div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
      {loading ? (
        <div className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">در حال دریافت لاگ‌ها...</div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">لاگی برای نمایش وجود ندارد.</div>
      ) : (
        <div className="max-h-[30rem] space-y-2 overflow-y-auto rounded-xl bg-[#f8f6f2] p-2">
          {logs.map((log) => (
            <article key={log.id} className="rounded-xl border border-[#e8e1d8] bg-[#fffdfa] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${levelStyles[log.level]}`}>
                  {levelLabels[log.level]}
                </span>
                <code className="text-xs font-bold text-[#40515d]">{log.event}</code>
                <time className="mr-auto text-[10px] text-slate-400">{formatDate(log.created_at)}</time>
              </div>
              <pre dir="ltr" className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600">
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
