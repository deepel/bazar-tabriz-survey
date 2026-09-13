import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ReactNode } from 'react';
import type { GeoJsonFeature, GpsState, ShopsResponse } from '../types';
import { MAP, TABRIZ_CENTER } from '../config/constants';
import ShopLayer from './ShopLayer';
import UserLocation from './UserLocation';

interface MapViewProps {
  shops: ShopsResponse | null;
  gps: GpsState & { locate: () => void };
  selectedShopId: string | null;
  onShopSelected: (feature: GeoJsonFeature) => void;
  onViewportChange: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
  children?: ReactNode;
}

export default function MapView({
  shops,
  gps,
  selectedShopId,
  onShopSelected,
  onViewportChange,
  children
}: MapViewProps) {
  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={TABRIZ_CENTER}
        zoom={MAP.initialZoom}
        minZoom={MAP.minZoom}
        maxZoom={MAP.maxZoom}
        zoomControl={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
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