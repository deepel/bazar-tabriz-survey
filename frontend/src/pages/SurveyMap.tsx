import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, isUnauthorized } from '../api/client';
import Header from '../components/Header';
import LoadingState from '../components/LoadingState';
import MapView from '../components/MapView';
import SurveyForm from '../components/SurveyForm';
import {
  FALLBACK_ACTIVITIES,
  FALLBACK_BUILDING_CONDITIONS
} from '../config/constants';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import type { GeoJsonFeature, OptionsResponse, ShopsResponse, Stats } from '../types';
import { formatNumber } from '../utils/format';

interface Viewport {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export default function SurveyMap() {
  const auth = useAuth();
  const navigate = useNavigate();
  const gps = useGeolocation(true);

  const [stats, setStats] = useState<Stats | null>(null);
  const [shops, setShops] = useState<ShopsResponse | null>(null);
  const [selected, setSelected] = useState<GeoJsonFeature | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsResponse>({
    activities: FALLBACK_ACTIVITIES,
    buildingConditions: FALLBACK_BUILDING_CONDITIONS
  });
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const result = await api.get<Stats>('/api/stats');
      setStats(result);
      return result;
    } catch {
      return null;
    }
  }, []);

  const fetchShops = useCallback(
    async (bounds?: Viewport) => {
      const bbox = bounds
        ? `?bbox=${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`
        : '';
      try {
        const result = await api.get<ShopsResponse>(`/api/shops${bbox}`);
        setShops(result);
        setLoadError(null);
        return result;
      } catch (err) {
        if (isUnauthorized(err)) {
          navigate('/login', { replace: true });
          return null;
        }
        setLoadError('دریافت اطلاعات مغازه‌ها ناموفق بود. اینترنت را بررسی کنید.');
        return null;
      }
    },
    [navigate]
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [statsData, optionsData] = await Promise.all([
        api.get<Stats>('/api/stats').catch(() => null),
        api.get<OptionsResponse>('/api/options').catch(() => null)
      ]);
      if (statsData) setStats(statsData);
      if (optionsData) setOptions(optionsData);
      await fetchShops();
      setLoading(false);
    })();
  }, [fetchShops]);

  // Load only the shops inside the current viewport on pan; fall back to a
  // full request (capped) if the viewport was never reported yet.
  useEffect(() => {
    if (viewport) void fetchShops(viewport);
  }, [viewport, fetchShops]);

  const onViewportChange = useCallback((bounds: Viewport) => {
    setViewport(bounds);
  }, []);

  const handleSaved = useCallback(() => {
    setSelected(null);
    void fetchStats();
    void fetchShops(viewport ?? undefined);
  }, [fetchStats, fetchShops, viewport]);

  const progress = useMemo(() => {
    if (!stats) return null;
    return `${formatNumber(stats.surveyed)} از ${formatNumber(stats.total)}`;
  }, [stats]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header center={<span>در حال بارگذاری نقشه...</span>} right={null} />
        <LoadingState message="در حال بارگذاری نقشه..." />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        center={
          <div className="flex items-center gap-4">
            <span>بررسی شده: {progress ?? '—'}</span>
            <nav className="flex items-center gap-1">
              {auth.user?.role === 'admin' && (
                <Link to="/admin" className="btn-ghost px-2.5 py-1.5 text-xs">
                  پنل مدیر
                </Link>
              )}
            </nav>
          </div>
        }
        right={null}
      />
      <div className="relative flex-1">
        {loadError && !shops && (
          <div className="absolute left-1/2 top-16 z-50 w-[90%] max-w-md -translate-x-1/2">
            <div className="card border-red-200 bg-red-50 text-center text-sm text-red-700">
              {loadError}
              <button className="btn-ghost mt-2 text-xs" onClick={() => fetchShops(viewport ?? undefined)}>
                تلاش مجدد
              </button>
            </div>
          </div>
        )}
        <MapView
          shops={shops}
          gps={gps}
          selectedShopId={selected?.properties.shop_id ?? null}
          onShopSelected={setSelected}
          onViewportChange={onViewportChange}
        >
          {selected && (
            <div className="absolute inset-x-0 bottom-0 z-[1000] p-3">
              <div className="mx-auto w-full max-w-lg">
                <SurveyForm
                  feature={selected}
                  gps={gps}
                  activities={options.activities}
                  buildingConditions={options.buildingConditions}
                  onDismiss={() => setSelected(null)}
                  onSaved={handleSaved}
                />
              </div>
            </div>
          )}
        </MapView>
      </div>
    </div>
  );
}