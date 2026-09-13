import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { GeoJsonFeature, ShopsResponse } from '../types';
import { COLORS } from '../config/constants';

interface ShopLayerProps {
  shops: ShopsResponse | null;
  selectedShopId: string | null;
  onShopSelected: (feature: GeoJsonFeature) => void;
}

export default function ShopLayer({ shops, selectedShopId, onShopSelected }: ShopLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const clickHandlerRef = useRef(onShopSelected);
  clickHandlerRef.current = onShopSelected;
  const selectedRef = useRef(selectedShopId);
  selectedRef.current = selectedShopId;

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!shops || !shops.features?.length) return undefined;

    const layer = L.geoJSON(shops as GeoJSON.GeoJsonObject, {
      style: (feature) => {
        const props = (feature?.properties || {}) as Record<string, unknown>;
        const selected = props.shop_id === selectedRef.current;
        const surveyed = Boolean(props.surveyed);
        if (selected) return { ...COLORS.selected };
        return surveyed
          ? { ...COLORS.surveyed, fillOpacity: 0.55, weight: 1.2 }
          : { ...COLORS.unsurveyed, fillOpacity: 0.55, weight: 1.2 };
      },
      onEachFeature: (feature, layerItem) => {
        layerItem.on('click', () => {
          clickHandlerRef.current(feature as unknown as GeoJsonFeature);
        });
      }
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [shops, map, selectedShopId]);

  return null;
}