import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, downloadGeojson } from '../api/client';
import CategoryStats from '../components/CategoryStats';
import ErrorMessage from '../components/ErrorMessage';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import MessagesPanel from '../components/MessagesPanel';
import StatsCards from '../components/StatsCards';
import SurveyorLeaderboard from '../components/SurveyorLeaderboard';
import { useAuth } from '../hooks/useAuth';
import type {
  CategoryStatsResponse,
  GithubStatus,
  ShopsResponse,
  Stats,
  SurveyorStatsResponse,
  User
} from '../types';
import { formatDate, formatNumber } from '../utils/format';

export default function AdminDashboard() {
  const auth = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStatsResponse | null>(null);
  const [surveyorStats, setSurveyorStats] = useState<SurveyorStatsResponse | null>(null);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'surveyor' });

  const load = useCallback(async () => {
    try {
      const [
        statsResult,
        usersResult,
        githubResult,
        categoryResult,
        surveyorResult
      ] = await Promise.all([
        api.get<Stats>('/api/stats'),
        api.get<{ users: User[] }>('/api/admin/users'),
        api.get<GithubStatus>('/api/admin/github/status'),
        api.get<CategoryStatsResponse>('/api/admin/stats/categories'),
        api.get<SurveyorStatsResponse>('/api/admin/stats/surveyors')
      ]);
      setStats(statsResult);
      setUsers(usersResult.users);
      setGithubStatus(githubResult);
      setCategoryStats(categoryResult);
      setSurveyorStats(surveyorResult);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دریافت اطلاعات پنل ناموفق بود.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleExport() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await api.get<ShopsResponse>('/api/admin/geojson/export');
      const date = new Date().toISOString().slice(0, 10);
      downloadGeojson(data, `bazar_tabriz_survey_${date}.geojson`);
      setMessage('خروجی GeoJSON دانلود شد.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دانلود خروجی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  async function handleGitHubSync() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{ ok: boolean; message: string }>('/api/admin/github/sync');
      setMessage(result.message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'همگام‌سازی ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/admin/users', newUser);
      setNewUser({ username: '', password: '', role: 'surveyor' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ایجاد کاربر ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleUser(user: User) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/admin/users/${user.id}`, { is_active: !user.is_active });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'به‌روزرسانی کاربر ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  if (!stats) {
    return (
      <div className="min-h-screen">
        <Header center={<span>در حال دریافت اطلاعات...</span>} right={null} />
        {error ? <ErrorMessage message={error} onRetry={load} /> : <LoadingState message="در حال دریافت اطلاعات..." />}
      </div>
    );
  }

  const lastSync = githubStatus?.lastState;

  return (
    <div className="min-h-screen bg-slate-100">
      <Header
        center={<span className="font-bold">پنل مدیریت</span>}
        right={
          <Link to="/survey" className="btn-ghost px-2.5 py-1.5 text-xs">
            نقشه برداشت
          </Link>
        }
      />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        {error && <ErrorMessage message={error} onRetry={load} />}
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {message}
          </div>
        )}

        <StatsCards stats={stats} />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="text-sm font-bold">آمار بر اساس نوع فعالیت</h2>
            <CategoryStats stats={categoryStats} />
          </section>

          <section className="card space-y-3">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold">عملکرد ممیزان</h2>
              {surveyorStats && (
                <span className="text-xs text-slate-400">
                  مجموع: {formatNumber(surveyorStats.totalSurveyed)}
                </span>
              )}
            </div>
            <SurveyorLeaderboard stats={surveyorStats} />
          </section>
        </div>

        <section className="card">
          <h2 className="mb-3 text-sm font-bold">ارسال پیام</h2>
          <MessagesPanel users={users} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="text-sm font-bold">ابزارها</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Link to="/admin/shops" className="btn-primary text-center">
                اطلاعات مغازه‌ها
              </Link>
              <Link to="/admin/layers" className="btn-ghost text-center">
                لایه‌های نقشه
              </Link>
              <Link to="/admin/import" className="btn-ghost text-center">
                ورود GeoJSON
              </Link>
              <button className="btn-ghost" onClick={handleExport} disabled={busy}>
                خروجی GeoJSON
              </button>
              <button className="btn-ghost" onClick={handleGitHubSync} disabled={busy}>
                همگام‌سازی با GitHub
              </button>
            </div>
            <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <div>
                وضعیت GitHub:{' '}
                {githubStatus?.configured ? 'فعال' : 'پیکربندی نشده'}
              </div>
              {githubStatus?.configured && (
                <div className="mt-1">
                  <div>
                    زمان آخرین همگام: {formatDate(lastSync?.lastSyncedAt ?? null)}
                  </div>
                  <div>
                    آخرین وضعیت: {lastSync?.ok ? 'موفق' : 'ناموفق'}
                    {lastSync?.error ? ` (${lastSync.error})` : ''}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-sm font-bold">کاربران</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-400">
                    <th className="pb-2 font-medium">نام کاربری</th>
                    <th className="pb-2 font-medium">نقش</th>
                    <th className="pb-2 font-medium">وضعیت</th>
                    <th className="pb-2 font-medium">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2">{user.username}</td>
                      <td className="py-2">{user.role === 'admin' ? 'مدیر' : 'ممیز'}</td>
                      <td className="py-2">{user.is_active ? 'فعال' : 'غیرفعال'}</td>
                      <td className="py-2">
                        <button
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => toggleUser(user)}
                          disabled={busy || user.id === auth.user?.id}
                        >
                          {user.is_active ? 'غیرفعال کردن' : 'فعال کردن'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-xs text-slate-400">
                        کاربری وجود ندارد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-2 border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-500">افزودن کاربر جدید</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <input
                  className="input"
                  placeholder="نام کاربری"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="رمز عبور"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
                <select
                  className="input"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="surveyor">ممیز</option>
                  <option value="admin">مدیر</option>
                </select>
                <button
                  type="submit"
                  className="btn-success"
                  disabled={busy || !newUser.username || !newUser.password}
                >
                  ایجاد
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">آمار برداشت</h2>
            <span className="text-xs text-slate-400">
              پیشرفت: {formatNumber(stats.progress)}٪
            </span>
          </div>
          <StatTable stats={stats} />
        </section>
      </main>
    </div>
  );
}

function StatTable({ stats }: { stats: Stats }) {
  const rows = [
    { label: 'کل مغازه‌ها', value: formatNumber(stats.total) },
    { label: 'بررسی شده', value: formatNumber(stats.surveyed) },
    { label: 'باقی‌مانده', value: formatNumber(stats.unsurveyed) },
    { label: 'پیشرفت', value: `${formatNumber(stats.progress)}٪` }
  ];
  return (
    <div className="flex flex-wrap gap-6 text-sm">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="text-lg font-bold text-slate-800">{r.value}</div>
          <div className="text-xs text-slate-400">{r.label}</div>
        </div>
      ))}
    </div>
  );
}