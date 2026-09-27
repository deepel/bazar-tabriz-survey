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

function featureStyle(props: Record<string, unknown>, selectedShopId: string | null): L.PathOptions {
  const surveyed = Boolean(props.surveyed);
  const statusStyle = surveyed
    ? { ...COLORS.surveyed, fillOpacity: 0.55, weight: 1.2 }
    : { ...COLORS.unsurveyed, fillOpacity: 0.55, weight: 1.2 };
  const assignmentColor = typeof props.assignment_color === 'string'
    ? props.assignment_color
    : null;
  if (!selectedShopId || props.shop_id !== selectedShopId) {
    // Keep red/green as the survey-status semantics. Assignment colors
    // are only used as a stronger outline and light halo.
    return assignmentColor
      ? {
          ...statusStyle,
          color: assignmentColor,
          weight: 2.4,
          dashArray: surveyed ? undefined : '4 2'
        }
      : statusStyle;
  }
  // An assigned shop keeps its team color even while selected; the thicker
  // outline supplies the selection affordance without hiding the red/green
  // survey status fill.
  return assignmentColor
    ? { ...statusStyle, color: assignmentColor, weight: 3.2, dashArray: '2 2' }
    : { ...COLORS.selected };
}

function applySelectionStyles(layer: L.GeoJSON, selectedShopId: string | null): void {
  layer.eachLayer((child) => {
    const path = child as L.Path & { feature?: GeoJSON.Feature };
    if (!path.feature || typeof path.setStyle !== 'function') return;
    path.setStyle(featureStyle((path.feature.properties ?? {}) as Record<string, unknown>, selectedShopId));
  });
}

export default function ShopLayer({ shops, selectedShopId, onShopSelected }: ShopLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const clickHandlerRef = useRef(onShopSelected);
  clickHandlerRef.current = onShopSelected;
  const selectedRef = useRef<string | null>(selectedShopId);
  selectedRef.current = selectedShopId;

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
    if (!shops?.features?.length) {
      if (layer) {
        map.removeLayer(layer);
        layerRef.current = null;
      }
      return;
    }
    if (layer) {
      layer.clearLayers();
      layer.addData(shops as GeoJSON.GeoJsonObject);
      return;
    }
    const created = L.geoJSON(shops as GeoJSON.GeoJsonObject, {
      style: (feature) =>
        featureStyle((feature?.properties ?? {}) as Record<string, unknown>, selectedRef.current),
      onEachFeature: (feature, layerItem) => {
        layerItem.on('click', () => {
          clickHandlerRef.current(feature as unknown as GeoJsonFeature);
        });
      }
    });
    created.addTo(map);
    layerRef.current = created;
  }, [map, shops]);

  useEffect(() => {
    if (layerRef.current) applySelectionStyles(layerRef.current, selectedShopId);
  }, [selectedShopId]);

  return null;
}