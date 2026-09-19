import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { DoorPointFeature, DoorPointProperties } from '../types';

interface DoorPointFormProps {
  coordinates: [number, number];
  doorPoint?: DoorPointFeature | null;
  onDismiss: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function initialValue(point: DoorPointProperties | undefined, key: keyof DoorPointProperties): string {
  const value = point?.[key];
  return typeof value === 'string' ? value : '';
}

export default function DoorPointForm({ coordinates, doorPoint, onDismiss, onSaved, onDeleted }: DoorPointFormProps) {
  const props = doorPoint?.properties;
  const [editing, setEditing] = useState(!doorPoint);
  const [name, setName] = useState(initialValue(props, 'name'));
  const [openingTime, setOpeningTime] = useState(initialValue(props, 'opening_time'));
  const [closingTime, setClosingTime] = useState(initialValue(props, 'closing_time'));
  const [notes, setNotes] = useState(initialValue(props, 'notes'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const body = { longitude: coordinates[0], latitude: coordinates[1], name: name.trim(), opening_time: openingTime, closing_time: closingTime, notes: notes.trim() || null };
      if (doorPoint) await api.patch(`/api/door-points/${encodeURIComponent(doorPoint.properties.door_point_id)}`, body);
      else await api.post('/api/door-points', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره در بازار ناموفق بود.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!doorPoint || !window.confirm('این در بازار حذف شود؟')) return;
    setBusy(true); setError(null);
    try {
      await api.delete(`/api/door-points/${encodeURIComponent(doorPoint.properties.door_point_id)}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حذف در بازار ناموفق بود.');
    } finally { setBusy(false); }
  }

  if (doorPoint && !editing) {
    return <div className="card max-h-[70vh] overflow-y-auto shadow-lg">
      <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">در بازار</h2><p className="text-[11px] text-slate-400">{props?.door_point_id}</p></div><button className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
      <div className="space-y-2 text-xs text-slate-600"><Detail label="نام در" value={props?.name} /><Detail label="ساعت فعالیت" value={`${props?.opening_time ?? '—'} تا ${props?.closing_time ?? '—'}`} /><Detail label="توضیحات" value={props?.notes} /></div>
      {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2"><button className="btn-primary flex-1" onClick={() => setEditing(true)}>ویرایش</button><button className="btn-ghost flex-1 text-red-700" onClick={() => void remove()} disabled={busy}>حذف</button></div>
    </div>;
  }

  return <form onSubmit={save} className="card max-h-[70vh] overflow-y-auto shadow-lg">
    <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">{doorPoint ? 'ویرایش در بازار' : 'ثبت در بازار'}</h2><p className="text-[11px] text-slate-400">مختصات از مرکز نقشه تأیید شده است.</p></div><button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
    <div className="space-y-3">
      <Field label="نام در" value={name} onChange={setName} required />
      <TimeField label="ساعت باز شدن" value={openingTime} onChange={setOpeningTime} />
      <TimeField label="ساعت بسته شدن" value={closingTime} onChange={setClosingTime} />
      <div><label className="label">توضیحات (اختیاری)</label><textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    </div>
    {error && <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
    <button type="submit" className="btn-primary mt-4 w-full py-3" disabled={busy || !name.trim() || !openingTime || !closingTime}>{busy ? 'در حال ذخیره...' : 'ثبت در'}</button>
  </form>;
}

function Field({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div><label className="label">{label}{required ? ' *' : ''}</label><input className="input" value={value} onChange={(event) => onChange(event.target.value)} required={required} /></div>;
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [parts, setParts] = useState(() => parseTime(value));

  useEffect(() => {
    setParts(parseTime(value));
  }, [value]);

  function update(next: Partial<TimeParts>) {
    const nextParts = { ...parts, ...next };
    setParts(nextParts);
    onChange(formatTime(nextParts));
  }

  return <div>
    <label className="label">{label}</label>
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
      <select className="input" aria-label={`${label}، ساعت`} value={parts.hour} onChange={(event) => update({ hour: event.target.value })} required>
        <option value="">ساعت</option>
        {Array.from({ length: 12 }, (_, index) => {
          const hour = String(index + 1);
          return <option key={hour} value={hour}>{hour}</option>;
        })}
      </select>
      <select className="input" aria-label={`${label}، دقیقه`} value={parts.minute} onChange={(event) => update({ minute: event.target.value })} required>
        <option value="">دقیقه</option>
        {Array.from({ length: 60 }, (_, index) => {
          const minute = String(index).padStart(2, '0');
          return <option key={minute} value={minute}>{minute}</option>;
        })}
      </select>
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-1.5 py-1" role="radiogroup" aria-label={`${label}، نوبت`}>
        <label className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs">
          <input type="radio" name={`${label}-period`} value="AM" checked={parts.period === 'AM'} onChange={() => update({ period: 'AM' })} />
          <span>AM</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-1 text-xs">
          <input type="radio" name={`${label}-period`} value="PM" checked={parts.period === 'PM'} onChange={() => update({ period: 'PM' })} />
          <span>PM</span>
        </label>
      </div>
    </div>
    <p className="mt-1 text-[10px] text-slate-400">ساعت، دقیقه و AM/PM را انتخاب کنید.</p>
  </div>;
}

interface TimeParts {
  hour: string;
  minute: string;
  period: 'AM' | 'PM' | '';
}

function parseTime(value: string): TimeParts {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return { hour: '', minute: '', period: '' };
  const hour24 = Number(match[1]);
  const minute = match[2];
  if (hour24 < 0 || hour24 > 23 || Number(minute) > 59) return { hour: '', minute: '', period: '' };
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return { hour: String(hour12), minute, period };
}

function formatTime(parts: TimeParts): string {
  if (!parts.hour || !parts.minute || !parts.period) return '';
  const hour12 = Number(parts.hour);
  if (hour12 < 1 || hour12 > 12 || !/^\d{2}$/.test(parts.minute)) return '';
  let hour24 = hour12 % 12;
  if (parts.period === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${parts.minute}`;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="font-medium">{value || '—'}</div></div>;
}
