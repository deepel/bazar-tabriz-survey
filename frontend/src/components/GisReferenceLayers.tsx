import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { GisLayer } from '../types';
import {
  GIS_MASK_PANE,
  GIS_MASK_PANE_Z,
  GIS_REF_PANE,
  GIS_REF_PANE_Z
} from '../config/constants';
import { loadLayerData } from '../lib/gisLayerData';

/**
 * Renders the historical bazaar reference layers (mask, buildings, lines,
 * ways) as display-only overlays. Order (bottom to top):
 * OSM tiles -> bazaar mask -> reference layers -> shops -> GPS marker.
 *
 * The layers live in dedicated Leaflet panes with z-indexes below the default
 * overlay pane, so the interactive shop polygons always stay on top. Data for
 * every layer is loaded, transformed and cached exactly once; the Layer object
 * is only re-created when the admin changes the source URL or bumps the
 * cache version.
 */

/** Creates the custom panes once, before any reference layer is attached. */
function GisPanes() {
  const map = useMap();
  useEffect(() => {
    const mask = map.getPane(GIS_MASK_PANE) ?? map.createPane(GIS_MASK_PANE);
    mask.style.zIndex = String(GIS_MASK_PANE_Z);
    const ref = map.getPane(GIS_REF_PANE) ?? map.createPane(GIS_REF_PANE);
    ref.style.zIndex = String(GIS_REF_PANE_Z);
  }, [map]);
  return null;
}

function layerStyle(layerKey: string): L.PathOptions {
  switch (layerKey) {
    case 'bazar-area':
      // Solid light polygon covering the OSM base map inside the bazaar.
      return { color: '#94a3b8', weight: 1, fillColor: '#ffffff', fillOpacity: 0.92 };
    case 'buildings':
      return { color: '#64748b', weight: 1, fillColor: '#f1f5f9', fillOpacity: 0.5 };
    case 'lines':
      return { color: '#3b82f6', weight: 1.2, fillOpacity: 0 };
    case 'ways':
      return { color: '#fb923c', weight: 1.5, fillColor: '#fed7aa', fillOpacity: 0.35 };
    default:
      return { color: '#64748b', weight: 1, fillOpacity: 0 };
  }
}

function isMaskLayer(layerKey: string): boolean {
  return layerKey === 'bazar-area';
}

function ReferenceLayer({ layer }: { layer: GisLayer }) {
  const map = useMap();
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cacheKey = `${layer.source_url}#${layer.cache_version}`;
    if (loadedKeyRef.current === cacheKey) return undefined;
    let cancelled = false;
    setData(null);
    void loadLayerData(layer).then((collection) => {
      if (cancelled) return;
      loadedKeyRef.current = cacheKey;
      setData(collection);
    });
    return () => {
      cancelled = true;
    };
  }, [map, layer]);

  useEffect(() => {
    if (!data) return undefined;
    const pane = isMaskLayer(layer.layer_key) ? GIS_MASK_PANE : GIS_REF_PANE;
    const instance = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      pane,
      interactive: false,
      style: () => layerStyle(layer.layer_key)
    });
    instance.addTo(map);
    return () => {
      map.removeLayer(instance);
    };
  }, [map, data, layer.layer_key]);

  return null;
}

interface GisReferenceLayersProps {
  layers: GisLayer[];
}

export default function GisReferenceLayers({ layers }: GisReferenceLayersProps) {
  return (
    <>
      <GisPanes />
      {layers.map((layer) => (
        <ReferenceLayer key={layer.layer_key} layer={layer} />
      ))}
    </>
  );
}