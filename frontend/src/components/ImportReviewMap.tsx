import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { GisLayer } from '../types';
import type { ImportFeatureMatch, ImportReviewResult } from '../types/importReview';
import {
  IMPORT_COLORS,
  MAP,
  MAP_BOUNDS,
  TILE_MAX_NATIVE_ZOOM,
  TILE_URL,
  TABRIZ_CENTER
} from '../config/constants';
import { statusTone } from '../utils/importReviewState';
import { useGisLayers } from '../hooks/useGisLayers';
import GisReferenceLayers from './GisReferenceLayers';

interface ImportReviewMapProps {
  result: ImportReviewResult;
  selectedNewIndex: number | null;
  onSelect: (newIndex: number) => void;
}

function toGeoJSON(feature: ImportFeatureMatch): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: feature.newIndex,
    properties: { newIndex: feature.newIndex, status: feature.status },
    geometry: feature.newWgs84Geometry as GeoJSON.Geometry
  };
}

/**
 * Map-centric import review: every new feature is painted with the shared
 * import palette (gray/amber/blue/purple/orange), the currently selected one
 * is re-drawn on top with a strong edge, and the candidate old-shop
 * footprints of the selected feature appear as thin neutral dashed outlines.
 * Reference layers and OSM tiles come from the same stack as the survey map.
 */
function ReviewLayer({
  result,
  selectedNewIndex,
  onSelect
}: {
  result: ImportReviewResult;
  selectedNewIndex: number | null;
  onSelect: (newIndex: number) => void;
}) {
  const map = useMap();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const base = L.layerGroup();
    result.features.forEach((feature) => {
      const tone = IMPORT_COLORS[statusTone(feature.status)];
      const gj = L.geoJSON(toGeoJSON(feature), {
        style: () => ({ color: tone.color, weight: 2, fillColor: tone.fill, fillOpacity: 0.55 }),
        onEachFeature: (_geo, layer) => {
          layer.on('click', () => onSelectRef.current(feature.newIndex));
        }
      });
      base.addLayer(gj);
    });
    base.addTo(map);
    return () => {
      map.removeLayer(base);
    };
  }, [map, result]);

  // Selection highlight, candidate outlines and fit-to-feature. Re-runs only
  // when the selected feature changes; the base layer above is untouched.
  useEffect(() => {
    if (selectedNewIndex === null) return undefined;

    const selected = result.features.find((f) => f.newIndex === selectedNewIndex);
    if (!selected) return undefined;

    const highlight = L.layerGroup();
    const tone = IMPORT_COLORS[statusTone(selected.status)];
    highlight.addLayer(
      L.geoJSON(toGeoJSON(selected), {
        interactive: false,
        style: () => ({ color: '#0f172a', weight: 3.5, fillColor: tone.fill, fillOpacity: 0.9 })
      })
    );

    const candidates = L.layerGroup();
    selected.candidates.forEach((candidate) => {
      candidates.addLayer(
        L.geoJSON(candidate.oldWgs84Geometry as GeoJSON.GeoJsonObject, {
          interactive: false,
          style: () => ({ color: '#475569', weight: 1.5, dashArray: '5 4', fillOpacity: 0 })
        })
      );
    });

    highlight.addTo(map);
    candidates.addTo(map);
    map.fitBounds(L.geoJSON(toGeoJSON(selected)).getBounds().pad(0.35), { maxZoom: MAP.maxZoom });

    return () => {
      map.removeLayer(highlight);
      map.removeLayer(candidates);
    };
  }, [map, result, selectedNewIndex]);

  return null;
}

export default function ImportReviewMap({ result, selectedNewIndex, onSelect }: ImportReviewMapProps) {
  const { layers } = useGisLayers();
  const gisLayers: GisLayer[] = layers ?? [];

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={TABRIZ_CENTER}
        zoom={MAP.initialZoom}
        minZoom={MAP.minZoom}
        maxZoom={MAP.maxZoom}
        maxBounds={MAP_BOUNDS}
        zoomControl={true}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={TILE_URL}
          maxZoom={MAP.maxZoom}
          maxNativeZoom={TILE_MAX_NATIVE_ZOOM}
        />
        <GisReferenceLayers layers={gisLayers} />
        <ReviewLayer result={result} selectedNewIndex={selectedNewIndex} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}