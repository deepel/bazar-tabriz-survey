import { useState } from 'react';
import { api, ApiError } from '../api/client';
import { FLOORS, INSTAGRAM_STATUSES, OTHER } from '../config/constants';
import type { OptionsResponse, PointShopFeature, PointShopProperties } from '../types';

interface PointShopFormProps {
  coordinates: [number, number];
  pointShop?: PointShopFeature | null;
  options: OptionsResponse;
  onDismiss: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

function initialValue(point: PointShopProperties | undefined, key: keyof PointShopProperties, fallback = ''): string {
  const value = point?.[key];
  return typeof value === 'string' ? value : fallback;
}

export default function PointShopForm({ coordinates, pointShop, options, onDismiss, onSaved, onDeleted }: PointShopFormProps) {
  const props = pointShop?.properties;
  const [editing, setEditing] = useState(!pointShop);
  const [shopName, setShopName] = useState(initialValue(props, 'shop_name'));
  const [activity, setActivity] = useState(initialValue(props, 'activity'));
  const [activityOther, setActivityOther] = useState(initialValue(props, 'activity_other'));
  const [condition, setCondition] = useState(initialValue(props, 'building_condition'));
  const [floor, setFloor] = useState(initialValue(props, 'floor', 'ground_floor'));
  const [instagramStatus, setInstagramStatus] = useState(initialValue(props, 'instagram_status', 'not_checked'));
  const [phone, setPhone] = useState(initialValue(props, 'phone'));
  const [notes, setNotes] = useState(initialValue(props, 'notes'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showOther = activity === OTHER;
  const allowSave = !busy && activity && condition && floor && instagramStatus && (!showOther || activityOther.trim());

  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const body = {
      longitude: coordinates[0], latitude: coordinates[1], shop_name: shopName.trim() || null,
      activity, activity_other: showOther ? activityOther.trim() : null, building_condition: condition,
      floor, instagram_status: instagramStatus, phone: phone.trim() || null, notes: notes.trim() || null
    };
    try {
      if (pointShop) await api.patch(`/api/point-shops/${encodeURIComponent(pointShop.properties.point_shop_id)}`, body);
      else await api.post('/api/point-shops', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره مکان تکمیلی ناموفق بود.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!pointShop || !window.confirm('این مکان تکمیلی حذف شود؟')) return;
    setBusy(true); setError(null);
    try {
      await api.delete(`/api/point-shops/${encodeURIComponent(pointShop.properties.point_shop_id)}`);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حذف مکان تکمیلی ناموفق بود.');
    } finally { setBusy(false); }
  }

  if (pointShop && !editing) {
    const p = pointShop.properties;
    return <div className="card max-h-[70vh] overflow-y-auto shadow-lg">
      <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">مکان تکمیلی</h2><p className="text-[11px] text-slate-400">{p.point_shop_id}</p></div><button className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
        <Detail label="نام مکان" value={p.shop_name} /><Detail label="فعالیت" value={p.activity_other ? `${p.activity} — ${p.activity_other}` : p.activity} />
        <Detail label="وضعیت بنا" value={p.building_condition} /><Detail label="موقعیت" value={FLOORS.find((x) => x.value === p.floor)?.label ?? p.floor} />
        <Detail label="Instagram" value={INSTAGRAM_STATUSES.find((x) => x.value === p.instagram_status)?.label ?? p.instagram_status} /><Detail label="تلفن" value={p.phone} />
        <div className="col-span-2"><Detail label="توضیحات" value={p.notes} /></div>
      </div>
      {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      <div className="mt-4 flex gap-2"><button className="btn-primary flex-1" onClick={() => setEditing(true)}>ویرایش</button><button className="btn-ghost flex-1 text-red-700" onClick={() => void remove()} disabled={busy}>حذف</button></div>
    </div>;
  }

  return <form onSubmit={save} className="card max-h-[70vh] overflow-y-auto shadow-lg">
    <div className="mb-3 flex items-start justify-between"><div><h2 className="text-sm font-bold">{pointShop ? 'ویرایش مکان تکمیلی' : 'ثبت مکان جدید'}</h2><p className="text-[11px] text-slate-400">مختصات از لمس نقشه ثبت شده است.</p></div><button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onDismiss}>بستن</button></div>
    <div className="space-y-3">
      <Field label="نام مکان" value={shopName} onChange={setShopName} />
      <Select label="نوع فعالیت" value={activity} onChange={setActivity} options={options.activities.map((x) => ({ value: x, label: x }))} />
      {showOther && <Field label="نوع فعالیت (سایر)" value={activityOther} onChange={setActivityOther} />}
      <Select label="وضعیت بنا" value={condition} onChange={setCondition} options={options.buildingConditions.map((x) => ({ value: x, label: x }))} />
      <Select label="موقعیت عمودی" value={floor} onChange={setFloor} options={FLOORS.map((x) => ({ value: x.value, label: x.label }))} />
      <Select label="Instagram" value={instagramStatus} onChange={setInstagramStatus} options={INSTAGRAM_STATUSES.map((x) => ({ value: x.value, label: x.label }))} />
      <Field label="تلفن (اختیاری)" value={phone} onChange={setPhone} />
      <div><label className="label">توضیحات</label><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
    </div>
    {error && <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}
    <button type="submit" className="btn-primary mt-4 w-full py-3" disabled={!allowSave}>{busy ? 'در حال ذخیره...' : 'ذخیره'}</button>
  </form>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><input className="input" value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div><label className="label">{label}</label><select className="input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">انتخاب کنید…</option>{options.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select></div>;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return <div><div className="text-[10px] text-slate-400">{label}</div><div className="font-medium">{value || '—'}</div></div>;
}
