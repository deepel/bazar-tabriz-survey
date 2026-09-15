import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { readConfig, writeConfig } from '../lib/gisCache';
import type { GisLayer, GisLayersResponse } from '../types';

/**
 * Loads the GIS layer configuration (the list of reference layers shown on
 * the survey map). Online it reads `/api/gis-layers` and caches the list;
 * offline it falls back to the cached config so the surveyor map still knows
 * the layer sources. With no network and no cache it returns [] (no crash).
 */
export function useGisLayers(): { layers: GisLayer[] | null; reload: () => Promise<void> } {
  const [layers, setLayers] = useState<GisLayer[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const response = await api.get<GisLayersResponse>('/api/gis-layers');
      await writeConfig(response.layers);
      setLayers(response.layers);
    } catch {
      const cached = await readConfig();
      setLayers(cached ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { layers, reload };
}