import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ReactNode } from 'react';
import type { GeoJsonFeature, GisLayer, GpsState, ShopsResponse } from '../types';
import {
  MAP,
  MAP_BOUNDS,
  TABRIZ_CENTER,
  TILE_MAX_NATIVE_ZOOM,
  TILE_URL
} from '../config/constants';
import GisReferenceLayers from './GisReferenceLayers';
import ShopLayer from './ShopLayer';
import UserLocation from './UserLocation';

interface MapViewProps {
  shops: ShopsResponse | null;
  gps: GpsState & { locate: () => void };
  selectedShopId: string | null;
  onShopSelected: (feature: GeoJsonFeature) => void;
  onViewportChange: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
  layers: GisLayer[];
  children?: ReactNode;
}

export default function MapView({
  shops,
  gps,
  selectedShopId,
  onShopSelected,
  onViewportChange,
  layers,
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={TILE_URL}
          maxZoom={MAP.maxZoom}
          maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
        />
        <GisReferenceLayers layers={layers} />
        <ShopLayer shops={shops} selectedShopId={selectedShopId} onShopSelected={onShopSelected} />
        <UserLocation gps={gps} onViewportChange={onViewportChange} />
      </MapContainer>
      {gps.position && (
        <button
          type="button"
          onClick={gps.locate}
          className="absolute bottom-5 left-3 z-50 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-md"
          aria-label="دریافت موقعیت فعلی"
        >
          📍
        </button>
      )}
      {children}
    </div>
  );
}