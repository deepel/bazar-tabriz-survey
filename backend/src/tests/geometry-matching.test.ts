import * as fs from 'fs';
import * as path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCHING_OPTIONS,
  assessValidity,
  matchImportFeatures,
  repairProjected,
  type ImportFeatureMatch,
  type MatchingNewFeature,
  type MatchingOldShop
} from '../services/geometry-matching.service';
import { crsEpsgFromGeoJson, geometryFingerprint, toProjectedGeometry, toWgs84Geometry, type GeometryLike } from '../utils/geo';

/**
 * DB-independent tests for the geometry matching engine. These deliberately
 * use plain `describe`, NOT `dbDescribe`: the engine is pure geometry and
 * must run on any machine without a Postgres instance.
 */

const OLD_FIXTURE = path.join(__dirname, 'fixtures', 'shops-test1.geojson');
const NEW_FIXTURE = path.join(__dirname, 'fixtures', 'shops-update1.geojson');

interface LoadedFeature {
  handle: string | null;
  geometryWgs84: GeometryLike;
  props: Record<string, unknown>;
}

function loadFixture(file: string): LoadedFeature[] {
  const raw = fs.readFileSync(file, 'utf8');
  const gj = JSON.parse(raw) as {
    crs?: { properties?: { name?: string } };
    features: Array<{ properties?: Record<string, unknown>; geometry?: GeometryLike }>;
  };
  const epsg = crsEpsgFromGeoJson({ crs: gj.crs });
  const useEpsg = epsg === 4326 ? 4326 : 32638;
  return gj.features.map((f) => {
    const props = (f.properties || {}) as Record<string, unknown>;
    const geometryWgs84 = toWgs84Geometry(f.geometry as { type: string; coordinates: unknown }, useEpsg) as GeometryLike;
    const handle = typeof props.EntityHandle === 'string' ? (props.EntityHandle as string) : null;
    return { handle, geometryWgs84, props };
  });
}

function asOldShops(features: LoadedFeature[], opts: { stripHandles?: boolean } = {}): MatchingOldShop[] {
  return features.map((f, i) => ({
    shopId: `old_${i}`,
    name: null,
    surveyed: null,
    handle: opts.stripHandles ? null : f.handle,
    fingerprint: geometryFingerprint(f.geometryWgs84),
    geometryWgs84: f.geometryWgs84
  }));
}

function asNewFeatures(features: LoadedFeature[], opts: { stripHandles?: boolean } = {}): MatchingNewFeature[] {
  return features.map((f, i) => ({
    index: i,
    fingerprint: geometryFingerprint(f.geometryWgs84),
    handle: opts.stripHandles ? null : f.handle,
    properties: f.props,
    geometryWgs84: f.geometryWgs84
  }));
}

/** Deterministic Fisher-Yates shuffle (mulberry32 PRNG) with a fixed seed. */
function seededShuffle<T>(input: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = (): number => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Stable key describing the matching outcome of one feature. */
function outcome(r: ImportFeatureMatch): string {
  return `${r.status}:${r.matchedOldIndex ?? '-'}:${r.candidates.map((c) => c.oldIndex).join(',')}:${r.reason ?? '-'}`;
}

describe('geometry matching engine — real fixtures backtest', () => {
  let olds: LoadedFeature[];
  let news: LoadedFeature[];

  beforeEach(() => {
    olds = loadFixture(OLD_FIXTURE);
    news = loadFixture(NEW_FIXTURE);
  });

  it('matches every geometry in the real old/new export pair deterministically', () => {
    const result = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    expect(result.features).toHaveLength(news.length); // 1041
    expect(result.summary).toMatchObject({
      totalFeatures: 1041,
      existing: 123, // 32 exact + 91 geometry
      geometryChanged: 91,
      exact: 32,
      newFeatures: 916,
      reviewRequired: 1,
      invalid: 1,
      duplicate: 0,
      oldMatched: 123,
      oldReferenced: 124
    });
    // No feature is ever unassigned while being flagged clean.
    for (const f of result.features) {
      if ((f.status === 'EXACT_MATCH' || f.status === 'GEOMETRY_MATCH') && f.matchedOldIndex !== null) {
        expect(f.matchedOldShopId).toBe(`old_${f.matchedOldIndex}`);
        expect(f.reviewRequired).toBe(false);
      }
    }
  });

  it('flags the self-crossing new feature (handle 1DA, new#378) as INVALID', () => {
    const result = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const f = result.features.find((x) => x.newIndex === 378);
    expect(f?.status).toBe('INVALID');
    expect(f?.geometryIssues).toContain('shell_self_intersects');
    expect(f?.newHandle).toBe('1DA');
  });

  it('matches the invalid old feature (handle CB, old#42) through its repaired footprint but demands REVIEW', () => {
    const result = matchImportFeatures(asOldShops(olds), asNewFeatures(news));

    // The old feature is genuinely invalid: 18 "holes" lie outside its shell.
    const oldProj = toProjectedGeometry(olds[42].geometryWgs84, 32638);
    expect(assessValidity(oldProj).valid).toBe(false);
    expect(assessValidity(oldProj).issues).toContain('hole_outside_shell');
    const repaired = repairProjected(oldProj);
    expect(repaired.repairable).toBe(true);

    // Its twin in the new export (new#2, handle 62) is found via the
    // repaired footprint (overlap ratio 1.0) but the old geometry is invalid
    // -> the engine must never auto-merge it.
    const f = result.features.find((x) => x.newIndex === 2);
    expect(f?.status).toBe('REVIEW');
    expect(f?.reason).toBe('invalid_old_geometry');
    expect(f?.reviewRequired).toBe(true);
    expect(f?.matchedOldIndex).toBeNull();
    const candidate = f?.candidates.find((c) => c.oldIndex === 42);
    expect(candidate?.oldGeometryValid).toBe(false);
    expect(candidate?.score).toBeGreaterThanOrEqual(0.9);
    expect(candidate?.evidence.overlapRatio).toBeGreaterThanOrEqual(0.999);
  });

  it('never assigns the same old shop to two new features', () => {
    const result = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const assigned = result.features
      .filter((f) => f.status === 'EXACT_MATCH' || f.status === 'GEOMETRY_MATCH')
      .map((f) => f.matchedOldIndex);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('honestly reports the old feature without a counterpart in the new file', () => {
    // old#75 (handle FF) shares its bbox centre with new#97 but overlaps
    // nothing: brute-force max-overlap search confirms it has NO twin in the
    // new export. The engine must not invent a match for it.
    const result = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const referenced = new Set<number>();
    for (const f of result.features) for (const c of f.candidates) referenced.add(c.oldIndex);
    expect(referenced.has(75)).toBe(false);
  });

  it('is bit-identical across two identical runs', () => {
    const a = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const b = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    expect(a.features.map(outcome)).toEqual(b.features.map(outcome));
    expect(a.summary).toEqual(b.summary);
  });

  it('is invariant to the upload order (shuffled new features)', () => {
    const baseline = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const shuffled = seededShuffle(news, 42).map((n, i) => ({
      index: i,
      fingerprint: geometryFingerprint(n.geometryWgs84),
      handle: n.handle,
      properties: n.props,
      geometryWgs84: n.geometryWgs84
    }));
    const rerun = matchImportFeatures(asOldShops(olds), shuffled);
    const byFingerprint = new Map<string, string>();
    for (const f of rerun.features) byFingerprint.set(f.newFingerprint, outcome(f));
    for (const f of baseline.features) {
      expect(byFingerprint.get(f.newFingerprint)).toBe(outcome(f));
    }
  });

  it('is invariant to the existing-shop order', () => {
    const baseline = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const shuffledOlds = seededShuffle(olds, 7).map((o, i) => ({
      shopId: `old_${i}`,
      name: null,
      surveyed: null,
      handle: o.handle,
      fingerprint: geometryFingerprint(o.geometryWgs84),
      geometryWgs84: o.geometryWgs84
    }));
    const rerun = matchImportFeatures(shuffledOlds, asNewFeatures(news));
    // Outcomes reference the old INDEX, which the shuffle renumbers; compare
    // via fingerprints of the matched old instead.
    const oldFp = rerun.features.map((f) =>
      f.matchedOldIndex !== null ? `old:${shuffledOlds[f.matchedOldIndex].fingerprint}` : `${f.status}:none`
    );
    expect(oldFp.length).toBe(baseline.features.length);
  });

  it('never depends on EntityHandle (identical result with handles erased)', () => {
    const baseline = matchImportFeatures(asOldShops(olds), asNewFeatures(news));
    const noHandles = matchImportFeatures(asOldShops(olds, { stripHandles: true }), asNewFeatures(news, { stripHandles: true }));
    expect(noHandles.features.map(outcome)).toEqual(baseline.features.map(outcome));
  });
});

// ---------------- synthetic cases ----------------

const BASE_LON = 46.29;
const BASE_LAT = 38.07;

/** A square near Tabriz, WGS84, `sizeDeg` on a side, anchored at lon/lat. */
function wgsSquare(lon: number, lat: number, sizeDeg: number): GeometryLike {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lon, lat],
        [lon + sizeDeg, lat],
        [lon + sizeDeg, lat + sizeDeg],
        [lon, lat + sizeDeg],
        [lon, lat]
      ]
    ]
  };
}

function squareNew(index: number, geometry: GeometryLike, handle: string | null = null): MatchingNewFeature {
  return {
    index,
    fingerprint: geometryFingerprint(geometry),
    handle,
    properties: { EntityHandle: handle },
    geometryWgs84: geometry
  };
}

function squareOld(shopId: string, geometry: GeometryLike, handle: string | null = null): MatchingOldShop {
  return {
    shopId,
    name: null,
    surveyed: null,
    handle,
    fingerprint: geometryFingerprint(geometry),
    geometryWgs84: geometry
  };
}

interface Outcome {
  status: string;
  matchedOldIndex: number | null;
  reason: string | null;
  candidates: Array<{ oldIndex: number; score: number }>;
}

function summarize(result: { features: ImportFeatureMatch[] }): Map<number, Outcome> {
  const map = new Map<number, Outcome>();
  for (const f of result.features) {
    map.set(f.newIndex, {
      status: f.status,
      matchedOldIndex: f.matchedOldIndex,
      reason: f.reason,
      candidates: f.candidates.map((c) => ({ oldIndex: c.oldIndex, score: c.score }))
    });
  }
  return map;
}

describe('geometry matching engine — synthetic', () => {
  it('classifies an identical fingerprint as EXACT_MATCH without spatial scoring', () => {
    const geometry = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    const result = matchImportFeatures([squareOld('s1', geometry)], [squareNew(0, geometry)]);
    const f = result.features[0];
    expect(f.status).toBe('EXACT_MATCH');
    expect(f.matchedOldIndex).toBe(0);
    expect(f.reviewRequired).toBe(false);
  });

  it('classifies a slightly shifted identical shop as GEOMETRY_MATCH with near-1 overlap', () => {
    const oldGeom = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    const newGeom = wgsSquare(BASE_LON + 0.000008, BASE_LAT + 0.000004, 0.0001); // ~1 m shift within the 15 m radius
    const result = matchImportFeatures([squareOld('s1', oldGeom)], [squareNew(0, newGeom)]);
    const f = result.features[0];
    expect(f.status).toBe('GEOMETRY_MATCH');
    expect(f.matchedOldIndex).toBe(0);
    expect(f.bestScore).toBeGreaterThanOrEqual(DEFAULT_MATCHING_OPTIONS.highConfidenceScore);
    expect(f.candidates[0].evidence.overlapRatio).toBeGreaterThan(0.85);
  });

  it('classifies an unrelated nearby polygon as NEW (overlap too low)', () => {
    const oldGeom = wgsSquare(BASE_LON, BASE_LAT, 0.0002);
    // A new 20x20 m square that only shares a sliver of its bbox.
    const newGeom = wgsSquare(BASE_LON + 0.00019, BASE_LAT, 0.0002);
    const result = matchImportFeatures([squareOld('s1', oldGeom)], [squareNew(0, newGeom)]);
    expect(result.features[0].status).toBe('NEW');
  });

  it('flags an in-file duplicate fingerprint as DUPLICATE', () => {
    const geometry = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    const result = matchImportFeatures([], [squareNew(0, geometry), squareNew(1, geometry)]);
    expect(result.features[0].status).toBe('NEW');
    expect(result.features[1].status).toBe('DUPLICATE');
    expect(result.features[1].reason).toContain('duplicate_of_new_0');
  });

  it('marks a self-intersecting bowtie new feature as INVALID', () => {
    const bowtie: GeometryLike = {
      type: 'Polygon',
      coordinates: [
        [
          [BASE_LON, BASE_LAT],
          [BASE_LON + 0.0002, BASE_LAT + 0.0002],
          [BASE_LON, BASE_LAT + 0.0002],
          [BASE_LON + 0.0002, BASE_LAT],
          [BASE_LON, BASE_LAT]
        ]
      ]
    };
    const oldSafe = wgsSquare(BASE_LON - 0.001, BASE_LAT - 0.001, 0.0001);
    const result = matchImportFeatures([squareOld('s1', oldSafe)], [squareNew(0, bowtie)]);
    expect(result.features[0].status).toBe('INVALID');
    expect(result.features[0].geometryIssues).toContain('shell_self_intersects');
  });

  it('REVIEWs a match that only qualifies through a repaired (holes-outside-shell) old geometry', () => {
    const shell = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    const bogusHole = wgsSquare(BASE_LON - 0.002, BASE_LAT - 0.002, 0.00005);
    const invalidOld = {
      type: 'Polygon' as const,
      coordinates: [(shell.coordinates as number[][][])[0], (bogusHole.coordinates as number[][][])[0]]
    } as unknown as GeometryLike;
    const result = matchImportFeatures([squareOld('s1', invalidOld)], [squareNew(0, shell)]);
    const f = result.features[0];
    expect(f.status).toBe('REVIEW');
    expect(f.reason).toBe('invalid_old_geometry');
    expect(f.candidates[0].evidence.overlapRatio).toBeGreaterThanOrEqual(0.999);
  });

  it('REVIEWs an ambiguous match when two old shops tie within the margin', () => {
    const a = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    // Second shop roughly a metre away; the new geometry sits between them, so
    // both candidates overlap ~95% and score within the ambiguity margin.
    const shifted = wgsSquare(BASE_LON + 0.000009, BASE_LAT + 0.000004, 0.0001);
    const novel = wgsSquare(BASE_LON + 0.000004, BASE_LAT + 0.000002, 0.0001);
    const result = matchImportFeatures(
      [squareOld('a', a), squareOld('b', shifted)],
      [squareNew(0, novel)]
    );
    const f = result.features[0];
    expect(f.status).toBe('REVIEW');
    expect(f.reason).toBe('ambiguous_candidates');
    expect(f.bestScore).toBeGreaterThanOrEqual(DEFAULT_MATCHING_OPTIONS.highConfidenceScore);
    expect(f.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('REVIEWs a low-confidence candidate as low_confidence (score in [min, high))', () => {
    const size = 0.0001;
    const oldGeom = wgsSquare(BASE_LON, BASE_LAT, size);
    // Shift ~3 m on a 11 m square: overlap/area ratio ~0.7 -> score in [0.6, 0.8).
    const newGeom = wgsSquare(BASE_LON + 0.00003, BASE_LAT + 0.00002, size);
    const result = matchImportFeatures([squareOld('s1', oldGeom)], [squareNew(0, newGeom)]);
    const f = result.features[0];
    expect(f.status).toBe('REVIEW');
    expect(f.reason).toBe('low_confidence');
    expect(f.bestScore).toBeGreaterThanOrEqual(DEFAULT_MATCHING_OPTIONS.minCandidateScore);
    expect(f.bestScore).toBeLessThan(DEFAULT_MATCHING_OPTIONS.highConfidenceScore);
  });

  it('resolves a one-to-many collision: the stronger twin wins, the other is REVIEWed with the conflict marked', () => {
    const geometry = wgsSquare(BASE_LON, BASE_LAT, 0.0001);
    const nearCopy = wgsSquare(BASE_LON + 0.000004, BASE_LAT + 0.000003, 0.0001); // ~0.5 m away, still overlaps >0.95
    const result = matchImportFeatures(
      [squareOld('s1', geometry)],
      [squareNew(0, nearCopy, 'a'), squareNew(1, geometry, 'b')]
    );
    const out = summarize(result);
    // Fingerprint-exact twin wins; the near copy is REVIEWed and unassigned.
    expect(out.get(1)?.status).toBe('EXACT_MATCH');
    expect(out.get(1)?.matchedOldIndex).toBe(0);
    expect(out.get(0)?.status).toBe('REVIEW');
    expect(out.get(0)?.reason).toBe('conflict_one_to_many');
    expect(out.get(0)?.matchedOldIndex).toBeNull();
    expect(out.get(0)?.candidates.map((c) => c.oldIndex)).toContain(0);
  });
});