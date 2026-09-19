import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { DoorPointFeature, DoorPointsResponse } from '../types';

interface DoorPointLayerProps {
  points: DoorPointsResponse | null;
  onPointSelected: (feature: DoorPointFeature) => void;
}

export default function DoorPointLayer({ points, onPointSelected }: DoorPointLayerProps) {
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
          className: 'door-point-marker',
          html: '<span aria-hidden="true">↕</span>',
          iconSize: [25, 25],
          iconAnchor: [12, 12]
        }),
        keyboard: true,
        title: feature.properties.name
      });
      marker.bindTooltip(feature.properties.name, { direction: 'top', offset: [0, -10] });
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
