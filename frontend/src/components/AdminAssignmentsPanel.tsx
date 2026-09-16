import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Assignment, AssignmentStatus } from '../types';
import { formatDate, formatNumber, formatPercent } from '../utils/format';

const statusLabels: Record<AssignmentStatus, string> = {
  active: 'فعال',
  completed: 'تکمیل‌شده',
  cancelled: 'لغوشده',
  archived: 'بایگانی‌شده'
};

export default function AdminAssignmentsPanel() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ assignments: Assignment[] }>('/api/admin/assignments');
      setAssignments(result.assignments);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'دریافت تاریخچه assignment ناموفق بود.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function changeStatus(id: string, status: 'archived' | 'cancelled') {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/api/admin/assignments/${encodeURIComponent(id)}/status`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تغییر وضعیت assignment ناموفق بود.');
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'all' ? assignments : assignments.filter((item) => item.status === filter);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">assignmentهای برداشت</h2>
          <p className="text-xs text-slate-400">تاریخچه دائمی محدوده‌ها و رنگ snapshot آن‌ها</p>
        </div>
        <select className="input w-auto py-1 text-xs" value={filter} onChange={(event) => setFilter(event.target.value as 'all' | AssignmentStatus)}>
          <option value="all">همه</option>
          <option value="active">فعال</option>
          <option value="completed">تکمیل‌شده</option>
          <option value="archived">بایگانی‌شده</option>
          <option value="cancelled">لغوشده</option>
        </select>
      </div>
      {error && <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <div className="space-y-2">
        {visible.map((assignment) => {
          const progress = assignment.actual_count > 0 ? (assignment.surveyed_count / assignment.actual_count) * 100 : 0;
          return (
            <article key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] text-slate-400">{assignment.id}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-semibold text-slate-700">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{statusLabels[assignment.status]}</span>
                    <span>{formatNumber(assignment.surveyed_count)} / {formatNumber(assignment.actual_count)} برداشت</span>
                    <span className="text-slate-400">درخواست: {formatNumber(assignment.requested_count)}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {assignment.status === 'active' && <Link to={`/survey?assignment=${encodeURIComponent(assignment.id)}`} className="btn-ghost px-2 py-1 text-[11px]">نمایش نقشه</Link>}
                  {(assignment.status === 'active' || assignment.status === 'completed') && <button className="btn-ghost px-2 py-1 text-[11px]" disabled={busyId === assignment.id} onClick={() => changeStatus(assignment.id, 'archived')}>بایگانی</button>}
                  {assignment.status === 'active' && <button className="btn-ghost px-2 py-1 text-[11px] text-red-700" disabled={busyId === assignment.id} onClick={() => changeStatus(assignment.id, 'cancelled')}>لغو</button>}
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(progress, 100)}%` }} /></div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                <span>پیشرفت: {formatPercent(progress)}</span>
                <span>ایجاد: {formatDate(assignment.created_at)}</span>
                {assignment.completed_at && <span>تکمیل: {formatDate(assignment.completed_at)}</span>}
                {assignment.archived_at && <span>بایگانی: {formatDate(assignment.archived_at)}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {assignment.members.map((member) => (
                  <span key={member.user_id} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color }} />
                    <strong style={{ color: member.color }}>{member.initials}</strong> {member.username}
                  </span>
                ))}
              </div>
            </article>
          );
        })}
        {visible.length === 0 && <div className="py-4 text-center text-xs text-slate-400">assignmentی برای این فیلتر وجود ندارد.</div>}
      </div>
    </section>
  );
}
