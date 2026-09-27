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
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!points?.features?.length) {
      if (layer) {
        map.removeLayer(layer);
        layerRef.current = null;
      }
      return;
    }
    if (layer) {
      layer.clearLayers();
      layer.addData(points as GeoJSON.GeoJsonObject);
      return;
    }
    const created = L.geoJSON(points as GeoJSON.GeoJsonObject, {
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
    created.addTo(map);
    layerRef.current = created;
  }, [map, points]);

  return null;
}