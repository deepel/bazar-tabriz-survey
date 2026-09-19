import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api, isUnauthorized } from '../api/client';
import Header from '../components/Header';
import AssignmentLegend from '../components/AssignmentLegend';
import AssignmentPlanner from '../components/AssignmentPlanner';
import LayerControl from '../components/LayerControl';
import LoadingState from '../components/LoadingState';
import MapView from '../components/MapView';
import PointShopForm from '../components/PointShopForm';
import ServicePointForm from '../components/ServicePointForm';
import DoorPointForm from '../components/DoorPointForm';
import SurveyForm from '../components/SurveyForm';
import {
  FALLBACK_ACTIVITIES,
  FALLBACK_BUILDING_CONDITIONS
} from '../config/constants';
import { useAuth } from '../hooks/useAuth';
import { useGeolocation } from '../hooks/useGeolocation';
import { useGisLayers } from '../hooks/useGisLayers';
import type {
  Assignment,
  AssignmentPreview,
  GeoJsonFeature,
  GisLayer,
  MessagesResponse,
  OptionsResponse,
  PointShopFeature,
  PointShopsResponse,
  ServicePointFeature,
  ServicePointsResponse,
  DoorPointFeature,
  DoorPointsResponse,
  ShopsResponse,
  Stats
} from '../types';
import { formatNumber } from '../utils/format';
import { assignmentLegendMembers } from '../utils/assignments';
import { isMeaningfulViewportChange } from '../utils/mapPointVisibility';

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
  const [pointShops, setPointShops] = useState<PointShopsResponse | null>(null);
  const [servicePoints, setServicePoints] = useState<ServicePointsResponse | null>(null);
  const [doorPoints, setDoorPoints] = useState<DoorPointsResponse | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<PointShopFeature | null>(null);
  const [selectedServicePoint, setSelectedServicePoint] = useState<ServicePointFeature | null>(null);
  const [selectedDoorPoint, setSelectedDoorPoint] = useState<DoorPointFeature | null>(null);
  const [pointCoordinates, setPointCoordinates] = useState<[number, number] | null>(null);
  const [serviceCoordinates, setServiceCoordinates] = useState<[number, number] | null>(null);
  const [doorCoordinates, setDoorCoordinates] = useState<[number, number] | null>(null);
  const [pointMode, setPointMode] = useState(false);
  const [pointCategory, setPointCategory] = useState<'shop' | 'service' | 'door' | null>(null);
  const [pointMenuOpen, setPointMenuOpen] = useState(false);
  const [pointVisible, setPointVisible] = useState(true);
  const [serviceVisible, setServiceVisible] = useState(true);
  const [doorVisible, setDoorVisible] = useState(true);
  const [selected, setSelected] = useState<GeoJsonFeature | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionsResponse>({
    activities: FALLBACK_ACTIVITIES,
    buildingConditions: FALLBACK_BUILDING_CONDITIONS
  });
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const pointBoundsRef = useRef<Viewport | null>(null);
  const pointLoadTimer = useRef<number | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview | null>(null);
  const [baseMap, setBaseMap] = useState<'osm' | 'satellite' | 'none'>(() => {
    if (typeof window === 'undefined') return 'osm';
    const saved = window.localStorage.getItem('survey-base-map-mode');
    return saved === 'satellite' || saved === 'none' ? saved : 'osm';
  });

  const { layers: gisLayerConfig } = useGisLayers();
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});

  useEffect(() => {
    window.localStorage.setItem('survey-base-map-mode', baseMap);
  }, [baseMap]);

  useEffect(() => {
    if (!gisLayerConfig || gisLayerConfig.length === 0) return;
    setLayerVisibility((prev) => {
      const next = { ...prev };
      for (const layer of gisLayerConfig) {
        if (next[layer.layer_key] === undefined) next[layer.layer_key] = true;
      }
      return next;
    });
  }, [gisLayerConfig]);

  useEffect(() => {
    api
      .get<MessagesResponse>('/api/messages')
      .then((res) => setUnread(res.unread))
      .catch(() => undefined);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const result = await api.get<Stats>('/api/stats');
      setStats(result);
      return result;
    } catch {
      return null;
    }
  }, []);

  const fetchActiveAssignments = useCallback(async () => {
    try {
      const result = await api.get<{ assignments: Assignment[] }>('/api/assignments/active');
      setActiveAssignments(result.assignments);
    } catch {
      // The map remains usable even if assignment metadata is temporarily unavailable.
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

  const fetchPointLayers = useCallback(async (bounds: Viewport) => {
    const bbox = `?bbox=${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`;
    const [shopsResult, servicesResult, doorsResult] = await Promise.all([
      pointVisible
        ? api.get<PointShopsResponse>(`/api/point-shops${bbox}`).catch(() => null)
        : Promise.resolve(null),
      serviceVisible
        ? api.get<ServicePointsResponse>(`/api/service-points${bbox}`).catch(() => null)
        : Promise.resolve(null),
      doorVisible
        ? api.get<DoorPointsResponse>(`/api/door-points${bbox}`).catch(() => null)
        : Promise.resolve(null)
    ]);
    if (shopsResult) setPointShops(shopsResult);
    if (servicesResult) setServicePoints(servicesResult);
    if (doorsResult) setDoorPoints(doorsResult);
  }, [doorVisible, pointVisible, serviceVisible]);

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
      await fetchActiveAssignments();
      setLoading(false);
    })();
  }, [fetchActiveAssignments, fetchShops]);

  // Load only the shops inside the current viewport on pan; fall back to a
  // full request (capped) if the viewport was never reported yet.
  useEffect(() => {
    if (viewport) void fetchShops(viewport);
  }, [viewport, fetchShops]);

  const onViewportChange = useCallback((bounds: Viewport) => {
    setViewport(bounds);
  }, []);

  const onPointViewportChange = useCallback((bounds: Viewport | null) => {
    if (!bounds || (!pointVisible && !serviceVisible && !doorVisible)) {
      pointBoundsRef.current = null;
      setPointShops(null);
      setServicePoints(null);
      setDoorPoints(null);
      return;
    }
    if (!isMeaningfulViewportChange(pointBoundsRef.current, bounds)) return;
    pointBoundsRef.current = bounds;
    if (pointLoadTimer.current !== undefined) window.clearTimeout(pointLoadTimer.current);
    pointLoadTimer.current = window.setTimeout(() => {
      void fetchPointLayers(bounds);
    }, 220);
  }, [doorVisible, fetchPointLayers, pointVisible, serviceVisible]);

  useEffect(() => () => {
    if (pointLoadTimer.current !== undefined) window.clearTimeout(pointLoadTimer.current);
  }, []);

  const handleSaved = useCallback(() => {
    setSelected(null);
    void fetchStats();
    void fetchShops(viewport ?? undefined);
    void fetchActiveAssignments();
  }, [fetchActiveAssignments, fetchStats, fetchShops, viewport]);

  const handlePointSaved = useCallback(() => {
    setSelectedPoint(null);
    setPointCoordinates(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
    void fetchStats();
  }, [fetchPointLayers, fetchStats]);

  const handlePointDeleted = useCallback(() => {
    setSelectedPoint(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
    void fetchStats();
  }, [fetchPointLayers, fetchStats]);

  const handleServiceSaved = useCallback(() => {
    setSelectedServicePoint(null);
    setServiceCoordinates(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
  }, [fetchPointLayers]);

  const handleServiceDeleted = useCallback(() => {
    setSelectedServicePoint(null);
    setServiceCoordinates(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
  }, [fetchPointLayers]);

  const handleDoorSaved = useCallback(() => {
    setSelectedDoorPoint(null);
    setDoorCoordinates(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
  }, [fetchPointLayers]);

  const handleDoorDeleted = useCallback(() => {
    setSelectedDoorPoint(null);
    setDoorCoordinates(null);
    setPointCategory(null);
    if (pointBoundsRef.current) void fetchPointLayers(pointBoundsRef.current);
  }, [fetchPointLayers]);

  const progress = useMemo(() => {
    if (!stats) return null;
    return `${formatNumber(stats.surveyed)} از ${formatNumber(stats.total)}`;
  }, [stats]);

  const mapLayers = useMemo((): GisLayer[] => {
    return (gisLayerConfig ?? [])
      .filter((layer) => layer.enabled && layerVisibility[layer.layer_key] !== false)
      .sort((a, b) => a.order_index - b.order_index);
  }, [gisLayerConfig, layerVisibility]);

  const controlLayers = useMemo(
    () => (gisLayerConfig ?? []).filter((layer) => layer.enabled),
    [gisLayerConfig]
  );

  const legendMembers = useMemo(() => {
    return assignmentLegendMembers(activeAssignments, assignmentPreview?.members ?? []);
  }, [activeAssignments, assignmentPreview]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header center={<span>در حال بارگذاری نقشه...</span>} right={null} />
        <LoadingState message="در حال بارگذاری نقشه..." />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col supports-[height:100dvh]:h-dvh">
      <Header
        center={
          <div className="flex items-center gap-4">
            <span>بررسی شده: {progress ?? '—'}</span>
            <nav className="flex items-center gap-1">
              <Link
                to="/messages"
                className="btn-ghost relative px-2.5 py-1.5 text-xs"
                aria-label={`پیام‌ها${unread > 0 ? `، ${unread} پیام خوانده‌نشده` : ''}`}
              >
                پیام‌ها
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {formatNumber(unread)}
                  </span>
                )}
              </Link>
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
          layers={mapLayers}
          baseMap={baseMap}
          assignmentPreview={assignmentPreview?.shops ?? null}
          assignmentPreviewColor={assignmentPreview?.members[0]?.color}
          pointShops={pointShops}
          servicePoints={servicePoints}
          doorPoints={doorPoints}
          pointShopVisible={pointVisible}
          serviceVisible={serviceVisible}
          doorVisible={doorVisible}
          pointMode={pointMode}
          onPointSelected={(feature) => {
            setSelectedPoint(feature); setSelectedServicePoint(null); setSelectedDoorPoint(null); setPointCoordinates(null); setServiceCoordinates(null); setDoorCoordinates(null);
            setPointCategory('shop'); setPointMode(false);
          }}
          onServicePointSelected={(feature) => {
            setSelectedServicePoint(feature); setSelectedDoorPoint(null); setSelectedPoint(null); setPointCoordinates(null); setServiceCoordinates(null); setDoorCoordinates(null);
            setPointCategory('service'); setPointMode(false);
          }}
          onDoorPointSelected={(feature) => {
            setSelectedDoorPoint(feature); setSelectedServicePoint(null); setSelectedPoint(null); setPointCoordinates(null); setServiceCoordinates(null); setDoorCoordinates(null);
            setPointCategory('door'); setPointMode(false);
          }}
          onPlacementConfirmed={(coordinates) => {
            if (pointCategory === 'service') setServiceCoordinates(coordinates);
            else if (pointCategory === 'door') setDoorCoordinates(coordinates);
            else setPointCoordinates(coordinates);
            setSelectedPoint(null); setSelectedServicePoint(null); setSelectedDoorPoint(null); setPointMode(false); setPointMenuOpen(false);
          }}
          onPlacementCancel={() => { setPointMode(false); setPointCategory(null); setPointCoordinates(null); setServiceCoordinates(null); setDoorCoordinates(null); }}
          onPointViewportChange={onPointViewportChange}
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
          {pointCategory === 'shop' && (pointCoordinates || selectedPoint) && (
            <div className="absolute inset-x-0 bottom-0 z-[1000] p-3">
              <div className="mx-auto w-full max-w-lg">
                <PointShopForm
                  coordinates={pointCoordinates ?? (selectedPoint ? [selectedPoint.geometry.coordinates[0], selectedPoint.geometry.coordinates[1]] : [0, 0])}
                  pointShop={selectedPoint}
                  options={options}
                  onDismiss={() => { setSelectedPoint(null); setPointCoordinates(null); setPointCategory(null); }}
                  onSaved={handlePointSaved}
                  onDeleted={handlePointDeleted}
                />
              </div>
            </div>
          )}
          {pointCategory === 'service' && (serviceCoordinates || selectedServicePoint) && (
            <div className="absolute inset-x-0 bottom-0 z-[1000] p-3">
              <div className="mx-auto w-full max-w-lg">
                <ServicePointForm
                  coordinates={serviceCoordinates ?? (selectedServicePoint ? [selectedServicePoint.geometry.coordinates[0], selectedServicePoint.geometry.coordinates[1]] : [0, 0])}
                  servicePoint={selectedServicePoint}
                  onDismiss={() => { setSelectedServicePoint(null); setServiceCoordinates(null); setPointCategory(null); }}
                  onSaved={handleServiceSaved}
                  onDeleted={handleServiceDeleted}
                />
              </div>
            </div>
          )}
          {pointCategory === 'door' && (doorCoordinates || selectedDoorPoint) && (
            <div className="absolute inset-x-0 bottom-0 z-[1000] p-3">
              <div className="mx-auto w-full max-w-lg">
                <DoorPointForm
                  coordinates={doorCoordinates ?? (selectedDoorPoint ? [selectedDoorPoint.geometry.coordinates[0], selectedDoorPoint.geometry.coordinates[1]] : [0, 0])}
                  doorPoint={selectedDoorPoint}
                  onDismiss={() => { setSelectedDoorPoint(null); setDoorCoordinates(null); setPointCategory(null); }}
                  onSaved={handleDoorSaved}
                  onDeleted={handleDoorDeleted}
                />
              </div>
            </div>
          )}
        </MapView>
        <div className="absolute bottom-3 left-3 z-[1000]">
          <button
            type="button"
            className={`rounded-full border px-3 py-2 text-xs shadow-md ${pointMode ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-700'}`}
            onClick={() => {
              if (pointMode) { setPointMode(false); setPointCategory(null); setPointMenuOpen(false); return; }
              setPointMenuOpen((value) => !value);
            }}
            aria-pressed={pointMode}
            aria-label={pointMode ? 'لغو ثبت نقطه' : 'ثبت نقطه جدید'}
          >
            {pointMode ? 'لغو انتخاب نقطه' : '+ ثبت نقطه'}
          </button>
          {pointMenuOpen && !pointMode && (
            <div className="absolute bottom-12 left-0 w-44 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <button type="button" className="flex w-full rounded-xl px-3 py-2 text-right text-xs hover:bg-slate-50" onClick={() => { setPointCategory('shop'); setPointMode(true); setPointMenuOpen(false); }}>مکان تکمیلی</button>
              <button type="button" className="flex w-full rounded-xl px-3 py-2 text-right text-xs hover:bg-slate-50" onClick={() => { setPointCategory('service'); setPointMode(true); setPointMenuOpen(false); }}>خدمات</button>
              <button type="button" className="flex w-full rounded-xl px-3 py-2 text-right text-xs hover:bg-slate-50" onClick={() => { setPointCategory('door'); setPointMode(true); setPointMenuOpen(false); }}>درها</button>
            </div>
          )}
          {pointMode && <div className="absolute bottom-12 left-0 whitespace-nowrap rounded-xl bg-slate-800 px-3 py-2 text-[11px] text-white shadow-lg">روی نقشه لمس کنید</div>}
        </div>
        <AssignmentLegend members={legendMembers} />
        <AssignmentPlanner
          currentUser={auth.user}
          onPreviewChange={setAssignmentPreview}
          onConfirmed={() => {
            void fetchActiveAssignments();
            void fetchShops(viewport ?? undefined);
            void fetchStats();
          }}
        />
        <LayerControl
          layers={controlLayers}
          visibility={layerVisibility}
          baseMap={baseMap}
          onBaseMapChange={setBaseMap}
          onToggle={(layerKey, visible) =>
            setLayerVisibility((prev) => ({ ...prev, [layerKey]: visible }))
          }
          pointVisible={pointVisible}
          onPointToggle={setPointVisible}
          serviceVisible={serviceVisible}
          onServiceToggle={setServiceVisible}
          doorVisible={doorVisible}
          onDoorToggle={setDoorVisible}
        />
      </div>
    </div>
  );
}
