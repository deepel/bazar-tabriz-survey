import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, type ReactNode } from 'react';
import type { DoorPointFeature, DoorPointsResponse, GeoJsonFeature, GisLayer, GpsState, PointShopFeature, PointShopsResponse, ServicePointFeature, ServicePointsResponse, ShopsResponse } from '../types';
import {
  MAP,
  MAP_BOUNDS,
  SATELLITE_TILE_URL,
  TABRIZ_CENTER,
  TILE_MAX_NATIVE_ZOOM,
  TILE_URL
} from '../config/constants';
import GisReferenceLayers from './GisReferenceLayers';
import AssignmentPreviewLayer from './AssignmentPreviewLayer';
import ShopLayer from './ShopLayer';
import UserLocation from './UserLocation';
import PointShopLayer from './PointShopLayer';
import ServicePointLayer from './ServicePointLayer';
import DoorPointLayer from './DoorPointLayer';
import MapPointPlacement from './MapPointPlacement';
import { areMapPointsVisible } from '../utils/mapPointVisibility';

interface MapViewProps {
  shops: ShopsResponse | null;
  gps: GpsState & { locate: () => void };
  selectedShopId: string | null;
  onShopSelected: (feature: GeoJsonFeature) => void;
  onViewportChange: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
  layers: GisLayer[];
  baseMap: 'osm' | 'satellite' | 'none';
  assignmentPreview?: GeoJSON.FeatureCollection | null;
  assignmentPreviewColor?: string;
  pointShops?: PointShopsResponse | null;
  servicePoints?: ServicePointsResponse | null;
  doorPoints?: DoorPointsResponse | null;
  pointShopVisible?: boolean;
  serviceVisible?: boolean;
  doorVisible?: boolean;
  pointMode?: boolean;
  onPointSelected?: (feature: PointShopFeature) => void;
  onServicePointSelected?: (feature: ServicePointFeature) => void;
  onDoorPointSelected?: (feature: DoorPointFeature) => void;
  onPlacementConfirmed?: (coordinates: [number, number]) => void;
  onPlacementCancel?: () => void;
  onPointViewportChange?: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null) => void;
  children?: ReactNode;
}

export default function MapView({
  shops,
  gps,
  selectedShopId,
  onShopSelected,
  onViewportChange,
  layers,
  baseMap,
  assignmentPreview = null,
  assignmentPreviewColor,
  pointShops = null,
  servicePoints = null,
  doorPoints = null,
  pointShopVisible = true,
  serviceVisible = true,
  doorVisible = true,
  pointMode = false,
  onPointSelected,
  onServicePointSelected,
  onDoorPointSelected,
  onPlacementConfirmed,
  onPlacementCancel,
  onPointViewportChange,
  children
}: MapViewProps) {
  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={TABRIZ_CENTER}
        zoom={MAP.initialZoom}
        minZoom={MAP.minZoom}
        maxZoom={MAP.maxZoom}
        maxBounds={MAP_BOUNDS}
        zoomControl={true}
        className="z-0"
      >
        {/* OSM tiles only exist up to z=TILE_MAX_NATIVE_ZOOM; maxNativeZoom
            makes Leaflet upscale the top tiles instead of requesting the
            missing z≥20 tiles, so the base map never goes blank when zoomed
            in far enough to inspect individual shops. */}
        {baseMap === 'osm' && (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={TILE_URL}
            maxZoom={MAP.maxZoom}
            maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
          />
        )}
        {baseMap === 'satellite' && (
          <TileLayer
            attribution='&copy; Google'
            url={SATELLITE_TILE_URL}
            maxZoom={MAP.maxZoom}
            maxNativeZoom={20}
          />
        )}
        <GisReferenceLayers layers={layers} />
        <ShopLayer shops={shops} selectedShopId={selectedShopId} onShopSelected={onShopSelected} />
        <PointShopLayer points={pointShopVisible ? pointShops : null} onPointSelected={(feature) => onPointSelected?.(feature)} />
        <ServicePointLayer points={serviceVisible ? servicePoints : null} onPointSelected={(feature) => onServicePointSelected?.(feature)} />
        <DoorPointLayer points={doorVisible ? doorPoints : null} onPointSelected={(feature) => onDoorPointSelected?.(feature)} />
        <AssignmentPreviewLayer data={assignmentPreview} color={assignmentPreviewColor} />
        <UserLocation gps={gps} onViewportChange={onViewportChange} />
        <PointViewportReporter enabled={pointShopVisible || serviceVisible || doorVisible} onChange={onPointViewportChange} />
        <MapPointPlacement
          active={pointMode}
          onConfirm={(coordinates) => onPlacementConfirmed?.(coordinates)}
          onCancel={() => onPlacementCancel?.()}
        />
      </MapContainer>
      <button
        type="button"
        onClick={gps.locate}
        className="absolute bottom-20 left-3 z-50 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm shadow-md sm:bottom-5"
        aria-label="دریافت موقعیت فعلی"
        title="موقعیت فعلی"
      >
        📍
      </button>
      {children}
    </div>
  );
}

function PointViewportReporter({
  enabled,
  onChange
}: {
  enabled: boolean;
  onChange?: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!onChange) return undefined;
    let timer: number | undefined;
    const emit = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!enabled || !areMapPointsVisible(map.getZoom())) {
          onChange(null);
          return;
        }
        const bounds = map.getBounds();
        onChange({
          minLon: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLon: bounds.getEast(),
          maxLat: bounds.getNorth()
        });
      }, 180);
    };
    map.on('moveend zoomend', emit);
    emit();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      map.off('moveend zoomend', emit);
    };
  }, [enabled, map, onChange]);

  return null;
}
