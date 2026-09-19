import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { SERVICE_TYPES } from '../config/constants';
import type { ServicePointFeature, ServicePointProperties } from '../types';

interface ServicePointFormProps {
  coordinates: [number, number];
  servicePoint?: ServicePointFeature | null;
  onDismiss: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function initialValue(point: ServicePointProperties | undefined, key: keyof ServicePointProperties, fallback = ''): string {
  const value = point?.[key];
  return typeof value === 'string' ? value : fallback;
}

export default function ServicePointForm({ coordinates, servicePoint, onDismiss, onSaved, onDeleted }: ServicePointFormProps) {
  const props = servicePoint?.properties;
  const [editing, setEditing] = useState(!servicePoint);
  const [serviceType, setServiceType] = useState(initialValue(props, 'service_type'));
  const [name, setName] = useState(initialValue(props, 'name'));
  const [notes, setNotes] = useState(initialValue(props, 'notes'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serviceLabel = SERVICE_TYPES.find((item) => item.value === props?.service_type)?.label ?? props?.service_type;

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const body = { longitude: coordinates[0], latitude: coordinates[1], service_type: serviceType, name: name.trim() || null, notes: notes.trim() || null };
      if (servicePoint) await api.patch(`/api/service-points/${encodeURIComponent(servicePoint.properties.service_point_id)}`, body);
      else await api.post('/api/service-points', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره نقطه خدماتی ناموفق بود.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!servicePoint || !window.confirm('این نقطه خدماتی حذف شود؟')) return;
    setBusy(true); setError(null);
    try {
      await api.delete(`/api/service-points/${encodeURIComponent(servicePoint.properties.service_point_id)}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حذف نقطه خدماتی ناموفق بود.');
    } finally { setBusy(false); }
  }

  if (servicePoint && !editing) {
    return <div className="card max-h-[70vh] overflow-y-auto shadow-lg">
      <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">نقطه خدماتی</h2><p className="text-[11px] text-slate-400">{servicePoint.properties.service_point_id}</p></div><button className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
      <div className="space-y-2 text-xs text-slate-600"><Detail label="نوع خدمات" value={serviceLabel ?? servicePoint.properties.service_type} /><Detail label="نام" value={props?.name} /><Detail label="توضیحات" value={props?.notes} /></div>
      {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2"><button className="btn-primary flex-1" onClick={() => setEditing(true)}>ویرایش</button><button className="btn-ghost flex-1 text-red-700" onClick={() => void remove()} disabled={busy}>حذف</button></div>
    </div>;
  }

  return <form onSubmit={save} className="card max-h-[70vh] overflow-y-auto shadow-lg">
    <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">{servicePoint ? 'ویرایش نقطه خدماتی' : 'ثبت خدمات'}</h2><p className="text-[11px] text-slate-400">مختصات از لمس نقشه ثبت شده است.</p></div><button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
    <div className="space-y-3">
      <label className="label">نوع خدمات<select className="input mt-1" value={serviceType} onChange={(event) => setServiceType(event.target.value)}><option value="">انتخاب کنید…</option>{SERVICE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <Field label="نام (اختیاری)" value={name} onChange={setName} />
      <div><label className="label">توضیحات (اختیاری)</label><textarea className="input min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
    </div>
    {error && <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
    <button type="submit" className="btn-primary mt-4 w-full py-3" disabled={busy || !serviceType}>{busy ? 'در حال ذخیره...' : 'ذخیره'}</button>
  </form>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><input className="input" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="font-medium">{value || '—'}</div></div>;
}
