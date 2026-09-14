// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useGeolocation } from './useGeolocation';

type GeolocationResult = ReturnType<typeof useGeolocation>;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onResult }: { onResult: (r: GeolocationResult) => void }) {
  onResult(useGeolocation(true));
  return null;
}

function cleanGeolocation(): void {
  try {
    delete (navigator as { geolocation?: unknown }).geolocation;
  } catch {
    // jsdom may not expose it at all
  }
}

describe('TEST I - useGeolocation never breaks when GPS is unavailable/denied', () => {
  let container: HTMLDivElement;
  let root: Root;
  let captured: GeolocationResult | null;

  beforeEach(() => {
    captured = null;
    cleanGeolocation();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    cleanGeolocation();
  });

  function renderProbe(): void {
    act(() => {
      root.render(<Probe onResult={(r) => (captured = r)} />);
    });
  }

  it('stays silent (position null, watching false) when geolocation is unavailable', () => {
    cleanGeolocation();
    renderProbe();
    expect(captured).not.toBeNull();
    expect(captured!.position).toBeNull();
    expect(captured!.watching).toBe(false);
    expect(captured).not.toHaveProperty('error');
    expect(captured).not.toHaveProperty('errorKind');
  });

  it('stays silent when the user denies the permission or a fix errs', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn(
          (_ok: unknown, err: (e: { code: number; PERMISSION_DENIED: number }) => void) => {
            err({ code: 1, PERMISSION_DENIED: 1 });
            return 7;
          }
        ),
        clearWatch: vi.fn()
      }
    });

    renderProbe();
    expect(captured).not.toBeNull();
    expect(captured!.position).toBeNull();
    expect(captured!.watching).toBe(false);
    expect(captured).not.toHaveProperty('error');
    expect(captured).not.toHaveProperty('errorKind');
  });

  it('uses the last fix when geolocation works (informational dot only)', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn(
          (ok: (pos: { coords: { latitude: number; longitude: number } }) => void) => {
            ok({ coords: { latitude: 38.0801, longitude: 46.2911 } });
            return 7;
          }
        ),
        clearWatch: vi.fn()
      }
    });

    renderProbe();
    expect(captured!.position).toEqual({ lat: 38.0801, lon: 46.2911 });
    expect(captured!.watching).toBe(true);
  });
});