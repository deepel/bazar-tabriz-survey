import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AssignmentPreview, AssignmentSurveyor, User } from '../types';

interface AssignmentPlannerProps {
  currentUser: User | null;
  /**
   * The single authoritative temporary preview, owned by the map page
   * (SurveyMap). The planner never keeps its own copy, so the map and the
   * panel can never disagree about which preview exists.
   */
  preview: AssignmentPreview | null;
  onPreviewChange: (preview: AssignmentPreview | null) => void;
  onConfirmed: () => void;
}

export default function AssignmentPlanner({ currentUser, preview, onPreviewChange, onConfirmed }: AssignmentPlannerProps) {
  const [open, setOpen] = useState(false);
  const [surveyors, setSurveyors] = useState<AssignmentSurveyor[]>([]);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [requestedCount, setRequestedCount] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ surveyors: AssignmentSurveyor[] }>('/api/assignment-surveyors')
      .then((result) => {
        setSurveyors(result.surveyors);
        if (currentUser?.role === 'surveyor') {
          const exists = result.surveyors.some((item) => item.id === currentUser.id);
          if (exists) setMemberIds((current) => current.length ? current : [currentUser.id]);
        }
      })
      .catch(() => setError('دریافت فهرست ممیزان ناموفق بود.'));
  }, [currentUser?.id, currentUser?.role]);

  function toggleMember(id: number) {
    setMemberIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function closePlanner() {
    // Closing the panel also discards the temporary unconfirmed preview, so a
    // reopened planner is always clean. Confirmed assignments are unaffected.
    if (preview) onPreviewChange(null);
    setOpen(false);
  }

  async function roll() {
    const previousPreviewId = preview?.previewId;
    setBusy(true);
    setError(null);
    // Roll Again: drop the old temporary preview from the map BEFORE sending
    // the new request, so at most one preview can ever be rendered at a time.
    // The server also invalidates that preview via replace_preview_id.
    if (previousPreviewId) onPreviewChange(null);
    try {
      const result = await api.post<AssignmentPreview>('/api/assignments/preview', {
        requested_count: Number(requestedCount),
        member_ids: memberIds,
        replace_preview_id: previousPreviewId
      });
      onPreviewChange(result);
    } catch (err) {
      // The old preview stays removed; stale geometry is never restored.
      setError(err instanceof ApiError ? err.message : 'ساخت پیش‌نمایش assignment ناموفق بود.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/assignments/confirm', { preview_id: preview.previewId });
      // Only the temporary preview is removed here; the confirmed assignment
      // lives in the database and stays visible through active rendering.
      onPreviewChange(null);
      onConfirmed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تأیید assignment ناموفق بود. دوباره Roll کنید.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="absolute bottom-20 right-3 z-[1100]">
        <button
          type="button"
          onClick={() => {
            if (open) {
              closePlanner();
            } else {
              setOpen(true);
            }
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[#ded8ce] bg-[#fffdfa]/95 text-lg text-[#40515d] shadow-[0_8px_24px_rgba(37,49,59,.18)] backdrop-blur"
          aria-label={open ? 'بستن ساخت assignment' : 'باز کردن ساخت assignment'}
          title="ساخت محدوده برداشت"
        >
          <span aria-hidden="true">{open ? '×' : '+'}</span>
        </button>
      </div>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-[1100] max-h-[72vh] overflow-y-auto border-t border-[#ded8ce] bg-[#fffdfa]/98 p-3 shadow-[0_-14px_36px_rgba(37,49,59,.18)] backdrop-blur">
          <div className="sticky top-0 z-10 -mx-3 -mt-3 mb-2 flex items-center justify-between gap-2 border-b border-[#efe9df] bg-[#fffdfa] px-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#40515d]">محدوده برداشت</div>
              <div className="text-[10px] text-slate-400">انتخاب خوشه‌ای و پیوسته از مغازه‌های باقی‌مانده</div>
            </div>
            <button
              type="button"
              onClick={closePlanner}
              className="shrink-0 rounded-xl border border-[#ded8ce] bg-white px-3 py-2 text-xs font-semibold text-[#40515d] shadow-sm hover:bg-slate-50"
              aria-label="بستن پنل محدوده برداشت"
            >
              بستن
            </button>
          </div>
          <div className="mx-auto w-full max-w-xl">

            <label className="mb-2 block text-xs text-slate-600">
              تعداد درخواستی
              <input
                className="input mt-1 w-full"
                type="number"
                min="1"
                step="1"
                value={requestedCount}
                onChange={(event) => setRequestedCount(event.target.value)}
              />
            </label>

            <div className="mb-2 text-xs font-semibold text-slate-600">اعضای تیم</div>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-1">
              {surveyors.map((surveyor) => (
                <label key={surveyor.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white">
                  <input
                    type="checkbox"
                    checked={memberIds.includes(surveyor.id)}
                    onChange={() => toggleMember(surveyor.id)}
                  />
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: surveyor.color }} aria-hidden="true" />
                  <span className="w-6 text-center text-[10px] font-bold" style={{ color: surveyor.color }}>{surveyor.initials}</span>
                  <span className="truncate">{surveyor.username}</span>
                </label>
              ))}
              {surveyors.length === 0 && <div className="p-2 text-xs text-slate-400">ممیز فعالی پیدا نشد.</div>}
            </div>

            {preview && (
              <div className={`mt-2 rounded-xl border p-2 text-xs ${preview.sufficient ? 'border-blue-100 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                <div className="font-semibold">پیش‌نمایش: {preview.actualCount} از {preview.requestedCount} مغازه</div>
                <div className="mt-1">
                  محدوده با رنگ‌های {preview.members.map((member) => member.username).join('، ') || 'تیم'} روی نقشه مشخص شده است.
                </div>
                {!preview.sufficient && <div className="mt-1 font-semibold">تعداد پیوسته کافی نیست؛ همین تعداد قابل اختصاص است.</div>}
              </div>
            )}

            {error && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}

            <div className="mt-3 flex gap-2">
              <button type="button" className="btn-primary flex-1" onClick={roll} disabled={busy || memberIds.length === 0 || Number(requestedCount) < 1}>
                {preview ? 'Roll Again' : 'Roll'}
              </button>
              {preview && (
                <button type="button" className="btn-success flex-1" onClick={confirm} disabled={busy || preview.actualCount === 0}>
                  تأیید
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
