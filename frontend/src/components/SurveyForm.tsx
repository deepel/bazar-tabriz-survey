import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { OTHER } from '../config/constants';
import { distanceToShop, formatDistance } from '../utils/distance';
import type { GeoJsonFeature, GpsState } from '../types';

interface SurveyFormProps {
  feature: GeoJsonFeature;
  gps: GpsState;
  activities: string[];
  buildingConditions: string[];
  gpsWarningDistanceMeters: number;
  onDismiss: () => void;
  onSaved: () => void;
}

export default function SurveyForm({
  feature,
  gps,
  activities,
  buildingConditions,
  gpsWarningDistanceMeters,
  onDismiss,
  onSaved
}: SurveyFormProps) {
  const props = feature.properties;

  const [shopName, setShopName] = useState('');
  const [activity, setActivity] = useState('');
  const [activityOther, setActivityOther] = useState('');
  const [condition, setCondition] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const detail = await api.get<{ survey: { shop_name: string | null; activity: string | null; activity_other: string | null; building_condition: string | null } | null }>(
          `/api/shops/${encodeURIComponent(props.shop_id)}`
        );
        const survey = detail.survey;
        setShopName(survey?.shop_name || '');
        setActivity(survey?.activity || '');
        setActivityOther(survey?.activity_other || '');
        setCondition(survey?.building_condition || '');
      } catch {
        // Prefill is a convenience; the form stays usable offline of it.
      }
    })();
  }, [props.shop_id]);

  const distance = useMemo(() => {
    if (!gps.position) return null;
    return distanceToShop({ lat: gps.position.lat, lon: gps.position.lon }, feature);
  }, [gps.position, feature]);

  const showWarning =
    distance !== null && gpsWarningDistanceMeters > 0 && distance > gpsWarningDistanceMeters;
  const showOther = activity === OTHER;
  const allowSave = !saving && activity.length > 0 && condition.length > 0 && (!showOther || activityOther.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/api/surveys', {
        shop_id: props.shop_id,
        shop_name: shopName.trim(),
        activity,
        activity_other: showOther ? activityOther.trim() : undefined,
        building_condition: condition,
        survey_lat: gps.position?.lat ?? null,
        survey_lon: gps.position?.lon ?? null
      });
      setSaved(true);
      setTimeout(onSaved, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ذخیره‌سازی ناموفق بود. دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="card border-green-300 bg-green-50 p-4 text-center">
        <div className="text-green-700">اطلاعات مغازه با موفقیت ذخیره شد.</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card max-h-[70vh] overflow-y-auto shadow-lg">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold">ثبت اطلاعات مغازه</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">شناسه: {props.shop_id.slice(0, 16)}…</p>
        </div>
        <button type="button" onClick={onDismiss} className="btn-ghost px-2.5 py-1 text-xs">
          بستن
        </button>
      </div>

      {gps.error && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          {gps.error}
        </div>
      )}
      {!gps.error && distance === null && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          موقعیت GPS شما در دسترس نیست؛ در صورت امکان مختصات ذخیره نمی‌شود.
        </div>
      )}
      {distance !== null && (
        <div
          className={`mb-3 rounded-lg border p-2.5 text-xs ${
            showWarning
              ? 'border-orange-400 bg-orange-50 text-orange-800'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {showWarning
            ? `هشدار: فاصله شما از این مغازه ${Math.round(distance)} متر است.`
            : `فاصله شما از این مغازه: ${formatDistance(distance)}`}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="shop-name">
            نام مغازه
          </label>
          <input
            id="shop-name"
            className="input"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="مثلاً حاج رحیم"
          />
        </div>
        <div>
          <label className="label" htmlFor="activity">
            نوع فعالیت
          </label>
          <select
            id="activity"
            className="input"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            <option value="">انتخاب کنید…</option>
            {activities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        {showOther && (
          <div>
            <label className="label" htmlFor="activity-other">
              نوع فعالیت (سایر)
            </label>
            <input
              id="activity-other"
              className="input"
              value={activityOther}
              onChange={(e) => setActivityOther(e.target.value)}
              placeholder="مشخص کنید…"
            />
          </div>
        )}
        <div>
          <label className="label" htmlFor="condition">
            وضعیت ساختمان
          </label>
          <select
            id="condition"
            className="input"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            <option value="">انتخاب کنید…</option>
            {buildingConditions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</div>}

      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn-primary flex-1 py-3" disabled={!allowSave}>
          {saving ? 'در حال ذخیره اطلاعات...' : 'ذخیره'}
        </button>
      </div>
    </form>
  );
}