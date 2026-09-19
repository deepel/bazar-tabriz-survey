import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import type {
  AdminShopRow,
  AdminShopsFilters,
  AdminShopsResponse,
  AdminShopsSortDirection,
  AdminShopsSortKey,
  OptionsResponse,
  User
} from '../types';
import { formatDate, formatNumber } from '../utils/format';
import { FLOORS, INSTAGRAM_STATUSES, SERVICE_TYPES } from '../config/constants';

const EMPTY_FILTERS: AdminShopsFilters = {
  record_type: '',
  shop_name: '',
  activity: '',
  activity_other: '',
  building_condition: '',
  surveyed: '',
  surveyor: '',
  date_from: '',
  date_to: '',
  floor: '',
  instagram_status: '',
  service_type: '',
  opening_time: '',
  closing_time: ''
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface ColumnDef {
  key: AdminShopsSortKey;
  label: string;
  sortable: boolean;
  render: (row: AdminShopRow) => React.ReactNode;
}

/**
 * Extensibility point: a future survey field becomes a new column by adding
 * one entry here (plus an entry in FILTER_FIELDS and one in the backend
 * service), without touching the rest of the page.
 */
const COLUMNS: ColumnDef[] = [
  {
    key: 'record_type',
    label: 'نوع رکورد',
    sortable: false,
    render: (r) => r.record_type === 'shops' ? 'مغازه اصلی' : r.record_type === 'shops-point' ? 'مکان تکمیلی (Point)' : r.record_type === 'services' ? 'خدمات' : 'در'
  },
  {
    key: 'shop_name',
    label: 'نام مغازه',
    sortable: true,
    render: (r) => r.shop_name || '—'
  },
  {
    key: 'activity',
    label: 'کاربری / فعالیت',
    sortable: true,
    render: (r) => r.activity || '—'
  },
  {
    key: 'building_condition',
    label: 'وضعیت بنا',
    sortable: true,
    render: (r) => r.building_condition || '—'
  },
  {
    key: 'surveyed',
    label: 'وضعیت برداشت',
    sortable: true,
    render: (r) =>
      r.surveyed === null ? '—' : r.surveyed ? (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
          برداشت شده
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
          برداشت نشده
        </span>
      )
  },
  {
    key: 'floor',
    label: 'موقعیت عمودی',
    sortable: true,
    render: (r) => FLOORS.find((x) => x.value === r.floor)?.label ?? '—'
  },
  {
    key: 'instagram_status',
    label: 'Instagram',
    sortable: true,
    render: (r) => INSTAGRAM_STATUSES.find((x) => x.value === r.instagram_status)?.label ?? '—'
  },
  {
    key: 'phone',
    label: 'تلفن',
    sortable: true,
    render: (r) => r.phone || '—'
  },
  {
    key: 'service_type',
    label: 'نوع خدمات',
    sortable: true,
    render: (r) => SERVICE_TYPES.find((x) => x.value === r.service_type)?.label ?? '—'
  },
  {
    key: 'opening_time',
    label: 'باز شدن',
    sortable: true,
    render: (r) => r.opening_time || '—'
  },
  {
    key: 'closing_time',
    label: 'بسته شدن',
    sortable: true,
    render: (r) => r.closing_time || '—'
  },
  {
    key: 'surveyor',
    label: 'برداشت‌کننده',
    sortable: true,
    render: (r) => r.surveyor_username || '—'
  },
  {
    key: 'surveyed_at',
    label: 'تاریخ و ساعت برداشت',
    sortable: true,
    render: (r) => (r.surveyed_at ? formatDate(r.surveyed_at) : '—')
  },
  {
    key: 'shop_id',
    label: 'Shop ID',
    sortable: false,
    render: (r) => (
      <code className="text-xs text-slate-500" dir="ltr">
        {r.shop_id}
      </code>
    )
  }
];

interface FilterField {
  key: keyof AdminShopsFilters;
  label: string;
  type: 'text' | 'date' | 'select';
  options?: Array<{ value: string; label: string }>;
}

function filterFields(options: OptionsResponse | null, surveyors: User[], recordType: AdminShopsFilters['record_type']): FilterField[] {
  const recordField: FilterField = { key: 'record_type', label: 'نوع رکورد', type: 'select', options: [{ value: 'shops', label: 'مغازه اصلی' }, { value: 'shops-point', label: 'مکان تکمیلی (Point)' }, { value: 'services', label: 'خدمات' }, { value: 'doors', label: 'در' }] };
  const serviceField: FilterField = { key: 'service_type', label: 'نوع خدمات', type: 'select', options: SERVICE_TYPES.map((x) => ({ value: x.value, label: x.label })) };
  const openingField: FilterField = { key: 'opening_time', label: 'ساعت باز شدن', type: 'text' };
  const closingField: FilterField = { key: 'closing_time', label: 'ساعت بسته شدن', type: 'text' };
  if (recordType === 'services') {
    return [recordField, { key: 'shop_name', label: 'نام', type: 'text' }, serviceField];
  }
  if (recordType === 'doors') {
    return [recordField, { key: 'shop_name', label: 'نام در', type: 'text' }, openingField, closingField];
  }
  return [
    recordField,
    { key: 'shop_name', label: 'نام مغازه', type: 'text' },
    {
      key: 'activity',
      label: 'کاربری / فعالیت',
      type: 'select',
      options: (options?.activities ?? []).map((a) => ({ value: a, label: a }))
    },
    {
      key: 'building_condition',
      label: 'وضعیت بنا',
      type: 'select',
      options: (options?.buildingConditions ?? []).map((c) => ({ value: c, label: c }))
    },
    {
      key: 'surveyed',
      label: 'وضعیت برداشت',
      type: 'select',
      options: [
        { value: 'yes', label: 'برداشت شده' },
        { value: 'no', label: 'برداشت نشده' }
      ]
    },
    {
      key: 'surveyor',
      label: 'برداشت‌کننده',
      type: 'select',
      options: surveyors.map((u) => ({ value: u.username, label: u.username }))
    },
    { key: 'date_from', label: 'تاریخ برداشت از', type: 'date' },
    { key: 'date_to', label: 'تاریخ برداشت تا', type: 'date' },
    { key: 'activity_other', label: 'سایر کاربری', type: 'text' },
    { key: 'floor', label: 'موقعیت عمودی', type: 'select', options: FLOORS.map((x) => ({ value: x.value, label: x.label })) },
    { key: 'instagram_status', label: 'Instagram', type: 'select', options: INSTAGRAM_STATUSES.map((x) => ({ value: x.value, label: x.label })) }
  ];
}

function countActive(filters: AdminShopsFilters, search: string): number {
  let count = search.trim() ? 1 : 0;
  for (const value of Object.values(filters)) if (value) count += 1;
  return count;
}

export default function AdminShops() {
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [surveyors, setSurveyors] = useState<User[]>([]);
  const [data, setData] = useState<AdminShopsResponse | null>(null);
  const [draftFilters, setDraftFilters] = useState<AdminShopsFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AdminShopsFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AdminShopsSortKey>('shop_name');
  const [order, setOrder] = useState<AdminShopsSortDirection>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [panelOpen, setPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<OptionsResponse>('/api/options')
      .then((o) => !cancelled && setOptions(o))
      .catch(() => undefined);
    api
      .get<{ users: User[] }>('/api/admin/users')
      .then((u) => !cancelled && setSurveyors(u.users.filter((x) => x.role === 'surveyor')))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQueryParams = useCallback(
    (withPagination: boolean): URLSearchParams => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
      }
      params.set('sort', sort);
      params.set('order', order);
      if (withPagination) {
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
      }
      return params;
    },
    [search, filters, sort, order, page, pageSize]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<AdminShopsResponse>(
        `/api/admin/shops?${buildQueryParams(true)}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دریافت اطلاعات مغازه‌ها ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [buildQueryParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function applyFilters() {
    setFilters({ ...draftFilters });
    setPage(1);
  }

  function clearFilter(key: keyof AdminShopsFilters) {
    const next = { ...filters, [key]: '' };
    setFilters(next);
    setDraftFilters(next);
    setPage(1);
  }

  function clearAll() {
    setFilters({ ...EMPTY_FILTERS });
    setDraftFilters({ ...EMPTY_FILTERS });
    setSearch('');
    setSearchInput('');
    setPage(1);
  }

  function handleSort(key: AdminShopsSortKey) {
    if (key === sort) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
    setPage(1);
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shops/export?${buildQueryParams(false)}`, {
        credentials: 'include'
      });
      if (!res.ok) {
        let message = 'دانلود خروجی ناموفق بود.';
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // ignore: non-JSON failure body
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bazar_shops_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دانلود خروجی ناموفق بود.');
    } finally {
      setExporting(false);
    }
  }

  const fields = useMemo(() => filterFields(options, surveyors, filters.record_type), [options, surveyors, filters.record_type]);
  const activeCount = countActive(filters, search);
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        center={<span className="font-bold">اطلاعات مغازه‌ها</span>}
        right={
          <Link to="/admin" className="btn-ghost px-2.5 py-1.5 text-xs">
            پنل مدیریت
          </Link>
        }
      />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {error && <ErrorMessage message={error} onRetry={load} />}

        {data ? (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard label="کل مغازه‌ها" value={formatNumber(data.summary.total)} />
              <SummaryCard label="برداشت شده" value={formatNumber(data.summary.surveyed)} />
              <SummaryCard label="باقی‌مانده" value={formatNumber(data.summary.unsurveyed)} />
              <SummaryCard label="نتیجه فیلتر" value={formatNumber(total)} highlight />
            </section>

            <section className="card space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    className="input pr-3"
                    placeholder="جستجو در نام مغازه، کد مغازه یا فعالیت..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  {search && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setSearchInput('');
                        setSearch('');
                      }}
                      title="پاک کردن جستجو"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`${panelOpen ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPanelOpen((o) => !o)}
                  >
                    فیلترها
                    {activeCount > 0 && (
                      <span className="mr-1 rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {formatNumber(activeCount)}
                      </span>
                    )}
                  </button>
                  <button className="btn-success" onClick={handleExport} disabled={exporting}>
                    {exporting ? 'در حال ساخت...' : 'خروجی Excel'}
                  </button>
                </div>
              </div>

              {panelOpen && (
                <div className="space-y-3 rounded-lg bg-slate-50 p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {fields.map((field) => (
                      <div key={field.key}>
                        <label className="label">{field.label}</label>
                        {field.type === 'select' ? (
                          <select
                            className="input"
                            value={draftFilters[field.key] as string}
                            onChange={(e) =>
                              setDraftFilters((p) => ({ ...p, [field.key]: e.target.value }))
                            }
                          >
                            <option value="">همه</option>
                            {field.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="input"
                            type={field.type}
                            value={draftFilters[field.key] as string}
                            onChange={(e) =>
                              setDraftFilters((p) => ({ ...p, [field.key]: e.target.value }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-primary" onClick={applyFilters}>
                      اعمال فیلترها
                    </button>
                    {activeCount > 0 && (
                      <button className="btn-ghost" onClick={clearAll}>
                        پاک کردن همه فیلترها
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeCount > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {search && (
                    <ActiveChip label={`جستجو: ${search}`} onClear={() => { setSearch(''); setSearchInput(''); }} />
                  )}
                  {fields.map(
                    (field) =>
                      filters[field.key] && (
                        <ActiveChip
                          key={field.key}
                          label={field.label}
                          onClear={() => clearFilter(field.key)}
                        />
                      )
                  )}
                </div>
              )}
            </section>

            <section className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full whitespace-nowrap text-right text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      {COLUMNS.map((col) => (
                        <th key={col.key} className="px-3 py-2.5 font-medium">
                          {col.sortable ? (
                            <button
                              className={`inline-flex items-center gap-1 ${sort === col.key ? 'text-blue-600' : ''}`}
                              onClick={() => handleSort(col.key)}
                            >
                              {col.label}
                              <span className="text-[10px]">
                                {sort === col.key ? (order === 'asc' ? '▲' : '▼') : '⇅'}
                              </span>
                            </button>
                          ) : (
                            col.label
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.record_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        {COLUMNS.map((col) => (
                          <td key={col.key} className="px-3 py-2.5">
                            {col.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!loading && data.rows.length === 0 && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-sm text-slate-400">
                          مغازه‌ای با این شرایط یافت نشد.
                        </td>
                      </tr>
                    )}
                    {loading && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-sm text-slate-400">
                          در حال بارگذاری...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="text-xs text-slate-500">
                {total > 0 ? (
                  <>
                    نمایش {formatNumber(from)} تا {formatNumber(to)} از {formatNumber(total)}
                  </>
                ) : (
                  '۰ نتیجه'
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  className="input w-auto !py-1.5 text-xs"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {formatNumber(n)} در هر صفحه
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5">
                  <button
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    قبلی
                  </button>
                  <span className="min-w-16 text-center text-xs text-slate-600">
                    {formatNumber(page)} از {formatNumber(pageCount)}
                  </span>
                  <button
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    disabled={page >= pageCount || loading}
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  >
                    بعدی
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : loading ? (
          <div className="card">
            <LoadingState message="در حال دریافت اطلاعات مغازه‌ها..." />
          </div>
        ) : (
          <ErrorMessage message="اطلاعاتی برای نمایش وجود ندارد." onRetry={load} />
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`card ${highlight ? 'border-blue-300 bg-blue-50' : ''}`}>
      <div className="text-xl font-bold text-slate-800">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
      {label}
      <button
        className="rounded-full px-1 text-blue-400 hover:text-blue-700"
        onClick={onClear}
        title="حذف این فیلتر"
      >
        ✕
      </button>
    </span>
  );
}
