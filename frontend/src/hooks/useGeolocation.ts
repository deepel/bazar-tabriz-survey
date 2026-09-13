import { useCallback, useEffect, useRef, useState } from 'react';
import type { GpsState } from '../types';

/**
 * Thin wrapper over the browser Geolocation API. Keeps watching the position
 * so the blue dot moves while the surveyor walks through the bazaar.
 */
export function useGeolocation(active: boolean): GpsState & { locate: () => void } {
  const [state, setState] = useState<GpsState>({
    position: null,
    error: null,
    errorKind: null,
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
    if (!('geolocation' in navigator)) {
      setState((s) => ({
        ...s,
        error: 'موقعیت‌یابی در این مرورگر پشتیبانی نمی‌شود.',
        errorKind: 'unavailable',
        watching: false
      }));
      return;
    }
    setState((s) => ({ ...s, watching: true, error: null, errorKind: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        setState((s) => ({
          ...s,
          position: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy
          },
          error: null,
          errorKind: null
        }));
      },
      (err) => {
        const errorKind = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
        const message =
          errorKind === 'denied'
            ? 'دسترسی به موقعیت مکانی مجاز نیست. لطفاً در مرورگر، موقعیت را فعال کنید.'
            : 'موقعیت مکانی در دسترس نیست. در صورت نیاز، GPS دستگاه خود را روشن کنید.';
        setState((s) => ({ ...s, error: message, errorKind }));
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