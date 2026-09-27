// @vitest-environment jsdom
/**
 * GPS is a passive position source. The map must never move just because the
 * watch produced a new fix: only the marker updates, and the moveend handler
 * reports the current viewport to the parent for data loading.
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
  CircleMarker: ({ center }: { center: number[] }) => (
    <div data-ton={center[1]} data-lat={center[0]} />
  )
}));

import UserLocation from './UserLocation';
import type { GpsState } from '../types';

function gpsWith(position: { lat: number; lon: number } | null): GpsState {
  return { position, watching: Boolean(position) };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  panTo.mockClear();
  on.mockClear();
  off.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

async function render(gps: GpsState, onViewportChange = vi.fn()): Promise<typeof onViewportChange> {
  await act(async () => {
    root.render(<UserLocation gps={gps} onViewportChange={onViewportChange} />);
  });
  return onViewportChange;
}

describe('UserLocation - GPS must never move the map', () => {
  it('does not pan when a GPS fix arrives or changes', async () => {
    await render(gpsWith({ lat: 38.0801, lon: 46.2911 }));
    expect(panTo).not.toHaveBeenCalled();

    await render(gpsWith({ lat: 38.0803, lon: 46.2913 }));
    expect(panTo).not.toHaveBeenCalled();
  });

  it('renders no marker while there is no fix, then shows the blue dot', async () => {
    await render(gpsWith(null));
    expect(container.childNodes.length).toBe(0);

    await render(gpsWith({ lat: 38.0801, lon: 46.2911 }));
    expect(container.querySelectorAll('div').length).toBe(2);
  });

  it('reports the viewport bounds on moveend', async () => {
    const onViewportChange = await render(gpsWith({ lat: 38.0801, lon: 46.2911 }), vi.fn());
    const moveendHandler = on.mock.calls.find((call) => call[0] === 'moveend')?.[1] as () => void;
    expect(moveendHandler).toBeTypeOf('function');
    act(() => moveendHandler());
    expect(onViewportChange).toHaveBeenCalledWith({
      minLon: 46.28,
      minLat: 38.06,
      maxLon: 46.3,
      maxLat: 38.08
    });
  });

  it('unsubscribes from moveend on unmount', async () => {
    await render(gpsWith(null));
    const moveendHandler = on.mock.calls.find((call) => call[0] === 'moveend')?.[1];
    await act(async () => root.unmount());
    expect(off).toHaveBeenCalledWith('moveend', moveendHandler);
  });
});