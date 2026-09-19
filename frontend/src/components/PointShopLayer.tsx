import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { PointShopFeature, PointShopsResponse } from '../types';

interface PointShopLayerProps {
  points: PointShopsResponse | null;
  onPointSelected: (feature: PointShopFeature) => void;
}

export default function PointShopLayer({ points, onPointSelected }: PointShopLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const clickRef = useRef(onPointSelected);
  clickRef.current = onPointSelected;

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!points?.features?.length) return undefined;
    const layer = L.geoJSON(points as GeoJSON.GeoJsonObject, {
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 7,
        color: '#0f766e',
        weight: 2,
        fillColor: '#2dd4bf',
        fillOpacity: 0.9
      }),
      onEachFeature: (feature, marker) => {
        marker.bindTooltip('مکان تکمیلی', { direction: 'top', offset: [0, -6] });
        marker.on('click', () => clickRef.current(feature as PointShopFeature));
      }
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [map, points]);

  return null;
}
