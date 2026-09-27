// @vitest-environment jsdom
/**
 * The location button is the only allowed way to recenter the map on the
 * GPS fix. Regular GPS updates must never move the map: they only update the
 * blue dot. Clicking the button centers exactly once; a fix that arrives
 * after the click (no position yet) centers once and never again.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { panTo, on, off, getBounds } = vi.hoisted(() => ({
  panTo: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getBounds: vi.fn(() => ({
    getWest: () => 46.28,
    getSouth: () => 38.06,
    getEast: () => 46.3,
    getNorth: () => 38.08
  }))
}));

vi.mock('react-leaflet', () => ({
  useMap: () => ({ panTo, on, off, getBounds }),
  MapContainer: () => null,
  TileLayer: () => null
}));

import { LocationButton } from './MapView';
import type { GpsState } from '../types';

function gps(position: { lat: number; lon: number } | null): GpsState & { locate: () => void } {
  return { position, watching: Boolean(position), locate: vi.fn() };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  panTo.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

async function render(state: GpsState & { locate: () => void }): Promise<HTMLButtonElement> {
  await act(async () => {
    root.render(<LocationButton gps={state} />);
  });
  const button = container.querySelector('button') as HTMLButtonElement;
  if (!button) throw new Error('location button not rendered');
  return button;
}

describe('LocationButton - center only on explicit demand', () => {
  it('never pans on GPS updates; centers exactly once when clicked', async () => {
    const button = await render(gps({ lat: 38.0801, lon: 46.2911 }));
    expect(panTo).not.toHaveBeenCalled();

    act(() => button.click());
    expect(panTo).toHaveBeenCalledTimes(1);
    expect(panTo).toHaveBeenCalledWith([38.0801, 46.2911]);

    await act(async () => {
      root.render(<LocationButton gps={gps({ lat: 38.082, lon: 46.292 })} />);
    });
    expect(panTo).toHaveBeenCalledTimes(1);
  });

  it('with no fix yet, clicking starts the watch and the first fix centers once', async () => {
    const state = gps(null);
    const button = await render(state);

    act(() => button.click());
    expect(state.locate).toHaveBeenCalledTimes(1);
    expect(panTo).not.toHaveBeenCalled();

    const withFix = { ...state, position: { lat: 38.0801, lon: 46.2911 } };
    await act(async () => {
      root.render(<LocationButton gps={withFix} />);
    });
    expect(panTo).toHaveBeenCalledTimes(1);
    expect(panTo).toHaveBeenCalledWith([38.0801, 46.2911]);

    const laterFix = { ...state, position: { lat: 38.0805, lon: 46.2914 } };
    await act(async () => {
      root.render(<LocationButton gps={laterFix} />);
    });
    expect(panTo).toHaveBeenCalledTimes(1);
  });
});