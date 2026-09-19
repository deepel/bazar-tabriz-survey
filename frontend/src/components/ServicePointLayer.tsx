import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { SERVICE_TYPES } from '../config/constants';
import type { ServicePointFeature, ServicePointsResponse } from '../types';

interface ServicePointLayerProps {
  points: ServicePointsResponse | null;
  onPointSelected: (feature: ServicePointFeature) => void;
}

function serviceLabel(value: string): string {
  return SERVICE_TYPES.find((item) => item.value === value)?.label ?? value;
}

export default function ServicePointLayer({ points, onPointSelected }: ServicePointLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onPointSelected);
  clickRef.current = onPointSelected;

  useEffect(() => {
    layerRef.current?.removeFrom(map);
    layerRef.current = null;
    if (!points?.features?.length) return undefined;

    const layer = L.layerGroup();
    for (const feature of points.features) {
      const [lon, lat] = feature.geometry.coordinates;
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'service-point-marker',
          html: '<span aria-hidden="true">◆</span>',
          iconSize: [25, 25],
          iconAnchor: [12, 12]
        }),
        keyboard: true,
        title: serviceLabel(feature.properties.service_type)
      });
      marker.bindTooltip(serviceLabel(feature.properties.service_type), { direction: 'top', offset: [0, -10] });
      marker.on('click', () => clickRef.current(feature));
      layer.addLayer(marker);
    }
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.removeFrom(map);
      layerRef.current = null;
    };
  }, [map, points]);

  return null;
}
