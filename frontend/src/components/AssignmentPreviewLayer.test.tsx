// @vitest-environment jsdom
/**
 * Verifies the temporary assignment preview map layer is fully replaced on
 * every data change: A → B removes A completely, repeated rolls never
 * accumulate GeoJSON layers, and the last layer is removed on unmount.
 * The Leaflet map itself is a stub; the component's add/remove behavior is
 * what is under test.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { addLayer, removeLayer } = vi.hoisted(() => ({
  addLayer: vi.fn(),
  removeLayer: vi.fn()
}));

vi.mock('react-leaflet', () => ({
  useMap: () => ({ addLayer, removeLayer })
}));

import AssignmentPreviewLayer from './AssignmentPreviewLayer';

function featureCollection(color: string): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { assignment_color: color },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] }
      }
    ]
  };
}

const A = featureCollection('#111111');
const B = featureCollection('#222222');
const C = featureCollection('#333333');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  addLayer.mockClear();
  removeLayer.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

async function renderWithData(data: GeoJSON.FeatureCollection | null): Promise<void> {
  await act(async () => {
    root.render(<AssignmentPreviewLayer data={data} color="#2563eb" />);
  });
}

/** How many preview layers the (stubbed) map currently holds: must be 0 or 1. */
function liveLayers(): number {
  return addLayer.mock.calls.length - removeLayer.mock.calls.length;
}

function lastAdded(): unknown {
  return addLayer.mock.calls[addLayer.mock.calls.length - 1][0];
}

function lastRemoved(): unknown {
  return removeLayer.mock.calls[removeLayer.mock.calls.length - 1][0];
}

describe('AssignmentPreviewLayer replacement', () => {
  it('changing preview A → B removes A completely; B becomes the only preview', async () => {
    await renderWithData(A);
    expect(addLayer).toHaveBeenCalledTimes(1);
    expect(removeLayer).toHaveBeenCalledTimes(0);
    expect(liveLayers()).toBe(1);
    const layerA = lastAdded();

    await renderWithData(B);
    expect(removeLayer).toHaveBeenCalledTimes(1);
    expect(lastRemoved()).toBe(layerA);
    expect(liveLayers()).toBe(1);
    const layerB = lastAdded();
    expect(layerB).not.toBe(layerA);

    await renderWithData(C);
    expect(lastRemoved()).toBe(layerB);
    expect(liveLayers()).toBe(1);
  });

  it('repeated rolls never accumulate layers: exactly one live preview remains', async () => {
    for (const data of [A, B, C, B, A]) {
      await renderWithData(data);
      expect(liveLayers()).toBe(1);
    }
    expect(addLayer).toHaveBeenCalledTimes(5);
    expect(removeLayer).toHaveBeenCalledTimes(4);
  });

  it('a null preview clears the layer; no duplicate layers afterwards', async () => {
    await renderWithData(A);
    await renderWithData(null);
    expect(liveLayers()).toBe(0);

    await renderWithData(A);
    expect(liveLayers()).toBe(1);
    expect(addLayer).toHaveBeenCalledTimes(2);
  });

  it('cleanup runs on unmount', async () => {
    const ownContainer = document.createElement('div');
    document.body.appendChild(ownContainer);
    const ownRoot = createRoot(ownContainer);
    try {
      await act(async () => {
        ownRoot.render(<AssignmentPreviewLayer data={A} color="#2563eb" />);
      });
      expect(liveLayers()).toBe(1);
      const layer = lastAdded();
      await act(async () => {
        ownRoot.unmount();
      });
      expect(lastRemoved()).toBe(layer);
      expect(liveLayers()).toBe(0);
    } finally {
      ownContainer.remove();
    }
  });
});
