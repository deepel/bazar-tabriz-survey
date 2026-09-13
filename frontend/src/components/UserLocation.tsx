import { useEffect } from 'react';
import { CircleMarker, useMap } from 'react-leaflet';
import type { GpsState } from '../types';

interface UserLocationProps {
  gps: GpsState;
  onViewportChange: (bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => void;
}

function FitToLocation({ gps }: { gps: GpsState }) {
  const map = useMap();
  useEffect(() => {
    if (gps.position) {
      map.panTo([gps.position.lat, gps.position.lon], { animate: false });
    }
  }, [map, gps.position]);
  return null;
}

export default function UserLocation({ gps, onViewportChange }: UserLocationProps) {
  const map = useMap();
  const position = gps.position;

  useEffect(() => {
    const onMove = () => {
      const bounds = map.getBounds();
      onViewportChange({
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth()
      });
    };
    map.on('moveend', onMove);
    return () => {
      map.off('moveend', onMove);
    };
  }, [map, onViewportChange]);

  if (!position) return <FitToLocation gps={gps} />;
  return (
    <>
      <FitToLocation gps={gps} />
      <CircleMarker
        center={[position.lat, position.lon]}
        radius={position.accuracy && position.accuracy < 200 ? Math.round(position.accuracy) : 8}
        pathOptions={{
          color: '#2563eb',
          fillColor: '#2563eb',
          fillOpacity: 0.15,
          weight: 1
        }}
      />
      <CircleMarker
        center={[position.lat, position.lon]}
        radius={6}
        pathOptions={{
          color: '#ffffff',
          fillColor: '#2563eb',
          fillOpacity: 1,
          weight: 2
        }}
      />
    </>
  );
}