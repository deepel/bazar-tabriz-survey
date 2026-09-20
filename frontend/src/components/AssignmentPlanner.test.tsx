// @vitest-environment jsdom
/**
 * UX/state QA for the assignment planner: internal close control, a single
 * temporary preview (Roll Again clears the old preview BEFORE requesting),
 * failed rolls leave no stale preview, and confirm clears the preview while
 * the confirmed assignment is refreshed through onConfirmed.
 *
 * The Host component mirrors SurveyMap exactly: the page owns the preview
 * state and the planner is controlled, so panel and map can never disagree.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentPreview, User } from '../types';
import AssignmentPlanner from './AssignmentPlanner';

const ADMIN: User = { id: 1, username: 'admin', role: 'admin' };

function preview(id: string): AssignmentPreview {
  return {
    previewId: id,
    requestedCount: 100,
    actualCount: 3,
    sufficient: true,
    reason: null,
    members: [{ user_id: 2, username: 'jafari', color: '#0891b2', initials: 'ج' }],
    shops: { type: 'FeatureCollection', features: [] }
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data
  };
}

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}

interface PreviewRequestRecord {
  body: Record<string, unknown>;
  /** onPreviewChange timeline captured BEFORE this request was sent. */
  previewCallsBefore: Array<AssignmentPreview | null>;
}

const previewCalls: Array<AssignmentPreview | null> = [];
const previewRequests: PreviewRequestRecord[] = [];
let previewCounter = 0;
let failPreview = false;
let confirmCount = 0;

function installFetch(): void {
  const fetchMock = vi.fn(async (url: unknown, opts?: { body?: string }) => {
    const path = String(url);
    if (path.endsWith('/assignment-surveyors')) {
      return jsonResponse({
        surveyors: [{ id: 2, username: 'jafari', color: '#0891b2', initials: 'ج' }]
      });
    }
    if (path.endsWith('/assignments/preview')) {
      previewRequests.push({
        body: JSON.parse(opts?.body ?? '{}') as Record<string, unknown>,
        previewCallsBefore: [...previewCalls]
      });
      if (failPreview) {
        return jsonResponse({ error: 'roll_failed', message: 'ساخت پیش‌نمایش ناموفق بود.' }, 500);
      }
      previewCounter += 1;
      return jsonResponse(preview(`p${previewCounter}`));
    }
    if (path.endsWith('/assignments/confirm')) {
      confirmCount += 1;
      return jsonResponse({ ok: true }, 201);
    }
    return jsonResponse({ error: 'not_found', message: 'آدرس یافت نشد' }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function Host({ onConfirmed }: { onConfirmed: () => void }) {
  const [value, setValue] = useState<AssignmentPreview | null>(null);
  return (
    <AssignmentPlanner
      currentUser={ADMIN}
      preview={value}
      onPreviewChange={(next) => {
        previewCalls.push(next);
        setValue(next);
      }}
      onConfirmed={onConfirmed}
    />
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  previewCalls.length = 0;
  previewRequests.length = 0;
  previewCounter = 0;
  failPreview = false;
  confirmCount = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.unstubAllGlobals();
});

async function renderPlanner(onConfirmed: () => void = () => undefined): Promise<void> {
  await act(async () => {
    root.render(<Host onConfirmed={onConfirmed} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function buttonByLabel(label: string): HTMLButtonElement {
  const element = container.querySelector(`button[aria-label="${label}"]`);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`);
  return element;
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const button = buttons.find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === text.trim());
  if (!button) throw new Error(`button not found: ${text}`);
  return button;
}

async function click(element: HTMLButtonElement | HTMLInputElement): Promise<void> {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openPanel(): Promise<void> {
  await click(buttonByLabel('باز کردن ساخت assignment'));
}

async function selectMember(): Promise<void> {
  const checkbox = container.querySelector('input[type="checkbox"]');
  if (!(checkbox instanceof HTMLInputElement)) throw new Error('member checkbox not found');
  await click(checkbox);
}

/** At no point may the timeline hold more than one live preview. */
function assertSingleLivePreview(): void {
  let live = 0;
  for (const call of previewCalls) {
    live = call ? live + 1 : 0;
    expect(live).toBeLessThanOrEqual(1);
  }
}

function previewBoxCount(): number {
  return (container.textContent ?? '').split('پیش‌نمایش:').length - 1;
}

describe('AssignmentPlanner close control', () => {
  it('A+B: opens from the floating button and closes with the internal بستن button', async () => {
    installFetch();
    await renderPlanner();
    expect(container.textContent).not.toContain('محدوده برداشت');

    await openPanel();
    expect(container.textContent).toContain('محدوده برداشت');
    expect(buttonByLabel('بستن پنل محدوده برداشت')).toBeTruthy();

    const callsAtOpen = previewCalls.length;
    await click(buttonByLabel('بستن پنل محدوده برداشت'));
    expect(container.textContent).not.toContain('محدوده برداشت');
    // Closing only hides the panel: preview state and map data are untouched,
    // and confirmed assignments are never affected.
    expect(previewCalls.length).toBe(callsAtOpen);
  });

  it('closing with an active preview clears it, so reopening is clean', async () => {
    installFetch();
    await renderPlanner();
    await openPanel();
    await selectMember();
    await click(buttonByText('Roll'));
    expect(last(previewCalls)?.previewId).toBe('p1');

    await click(buttonByLabel('بستن پنل محدوده برداشت'));
    // The temporary preview is discarded on close (requirement 6): no stale
    // preview may reappear when the planner is reopened.
    expect(last(previewCalls)).toBeNull();

    await openPanel();
    expect(previewBoxCount()).toBe(0);
    expect(container.textContent).not.toContain('تأیید');
    expect(buttonByText('Roll')).toBeTruthy();
  });
});

describe('AssignmentPlanner roll lifecycle', () => {
  it('C+D+E: rolls, then replaces the preview after clearing it first, repeatedly', async () => {
    installFetch();
    await renderPlanner();
    await openPanel();
    await selectMember();
    expect(previewCalls).toEqual([]);

    // Roll A.
    await click(buttonByText('Roll'));
    expect(previewCalls.map((item) => item?.previewId ?? null)).toEqual(['p1']);
    expect(previewRequests[0].body).toEqual({
      requested_count: 100,
      member_ids: [2],
      replace_preview_id: undefined
    });
    expect(previewBoxCount()).toBe(1);
    expect(buttonByText('Roll Again')).toBeTruthy();

    // Roll Again: the map is cleared BEFORE the request leaves the client.
    await click(buttonByText('Roll Again'));
    expect(last(previewRequests[1].previewCallsBefore) ?? null).toBeNull();
    expect(previewRequests[1].body.replace_preview_id).toBe('p1');
    expect(previewCalls.map((item) => item?.previewId ?? null)).toEqual(['p1', null, 'p2']);
    assertSingleLivePreview();
    expect(previewBoxCount()).toBe(1);

    // Roll Again again: same invariant, still exactly one temporary preview.
    await click(buttonByText('Roll Again'));
    expect(last(previewRequests[2].previewCallsBefore) ?? null).toBeNull();
    expect(previewRequests[2].body.replace_preview_id).toBe('p2');
    expect(previewCalls.map((item) => item?.previewId ?? null)).toEqual(['p1', null, 'p2', null, 'p3']);
    assertSingleLivePreview();
    expect(previewBoxCount()).toBe(1);
  });

  it('F: a failed Roll Again leaves no stale preview on the map', async () => {
    installFetch();
    await renderPlanner();
    await openPanel();
    await selectMember();
    await click(buttonByText('Roll'));
    expect(last(previewCalls)?.previewId).toBe('p1');

    failPreview = true;
    await click(buttonByText('Roll Again'));
    // The old preview was cleared before the request and is never restored.
    expect(last(previewRequests[1].previewCallsBefore) ?? null).toBeNull();
    expect(last(previewCalls)).toBeNull();
    expect(container.textContent).toContain('ساخت پیش‌نمایش ناموفق بود.');
    expect(container.textContent).not.toContain('پیش‌نمایش:');
    // The button is back to first-roll wording: no live preview exists.
    expect(buttonByText('Roll')).toBeTruthy();
    failPreview = false;
  });

  it('G: confirm removes the temporary preview and refreshes active assignments', async () => {
    installFetch();
    const onConfirmed = vi.fn();
    await renderPlanner(onConfirmed);
    await openPanel();
    await selectMember();
    await click(buttonByText('Roll'));
    expect(last(previewCalls)?.previewId).toBe('p1');

    await click(buttonByText('تأیید'));
    expect(confirmCount).toBe(1);
    expect(last(previewCalls)).toBeNull();
    expect(container.textContent).not.toContain('پیش‌نمایش:');
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(buttonByText('Roll')).toBeTruthy();
  });
});
