import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

interface AssignmentPreviewLayerProps {
  data: GeoJSON.FeatureCollection | null;
  color?: string;
}

export default function AssignmentPreviewLayer({ data, color = '#2563eb' }: AssignmentPreviewLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!data?.features?.length) return undefined;

    const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      interactive: false,
      style: (feature) => {
        const featureColor = typeof feature?.properties?.assignment_color === 'string'
          ? feature.properties.assignment_color
          : color;
        return {
          color: featureColor,
          fillColor: featureColor,
          fillOpacity: 0.08,
          weight: 2,
          dashArray: '6 4'
        };
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
  }, [color, data, map]);

  return null;
}
