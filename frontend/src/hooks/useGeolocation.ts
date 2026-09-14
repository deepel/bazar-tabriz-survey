import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsState } from '../types';

/**
 * Thin wrapper over the browser Geolocation API. Keeps watching the position
 * so the blue dot moves while the surveyor walks through the bazaar.
 *
 * GPS is optional metadata only: failures are silent and never block or
 * warn the surveyor. There is no distance validation against shops.
 */
export function useGeolocation(active: boolean): GpsState & { locate: () => void } {
  const [state, setState] = useState<GpsState>({
    position: null,
    watching: false
  });
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState((s) => ({ ...s, watching: false }));
      return;
    }
    setState((s) => ({ ...s, watching: true }));
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setState((s) => ({
          ...s,
          position: {
            lat: position.coords.latitude,
            lon: position.coords.longitude
          },
          watching: true
        }));
      },
      () => {
        setState((s) => ({ ...s, watching: false }));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
    );
  }, []);

  const locate = useCallback(() => {
    stop();
    start();
  }, [stop, start]);

  useEffect(() => {
    if (active) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [active, start, stop]);

  return { ...state, locate };
}