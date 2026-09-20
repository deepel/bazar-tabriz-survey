import turfBuffer from '@turf/buffer';
import turfIntersect from '@turf/intersect';
import turfKinks from '@turf/kinks';
import {
  geometryFingerprint,
  toProjectedGeometry,
  type GeometryLike
} from '../utils/geo';

/**
 * Geometry matching engine for the import review flow.
 *
 * This module is a pure, HTTP/DB/UI-free function: given the existing shops
 * and the uploaded features it answers "is this uploaded polygon the same
 * real-world shop as an existing one, and how do I prove it?".
 *
 * Guarantees:
 *  - Deterministic: the same input always yields the same output. Matching
 *    never depends on array order, index, shop name, EntityHandle or any
 *    random value. EntityHandle (`oldHandle`) is carried strictly as
 *    diagnostics.
 *  - One-to-one: no old shop is assigned to two new features. When two
 *    plausible candidates compete for one old shop the loser is REVIEWED,
 *    never silently re-guessed.
 *  - Geometry is never silently changed: source geometries (in both the
 *    candidate and match objects) are the untouched uploaded/DB coordinates.
 *    Invalid polygons are only *repaired for analysis* (used to compute
 *    evidence). If an invalid old feature matches a new one through its
 *    repaired geometry the result is REVIEW, not an automatic match.
 *
 * All metrics are computed in projected meters (EPSG:32638 by default, an
 * UTM zone whose scale error is negligible around the bazaar) so overlap,
 * area ratio and distances are usable directly.
 */

export type ImportMatchStatus =
  | 'EXACT_MATCH'
  | 'GEOMETRY_MATCH'
  | 'NEW'
  | 'REVIEW'
  | 'INVALID'
  | 'DUPLICATE';

export interface MatchingWeights {
  /** Weight of the intersection/min-area ratio. The dominant term. */
  overlap: number;
  /** Weight of the min/max area ratio (size similarity). */
  area: number;
  /** Weight of the projected bounding-box Jaccard similarity. */
  bbox: number;
  /** Weight of how far apart the two centroids are (as a ramp to 0 at searchRadiusMeters). */
  distance: number;
}

export interface MatchingOptions {
  /** Projected CRS (meters) used for all geometry math. EPSG:32638 = Iran UTM 38N. */
  targetEpsg: number;
  /**
   * Radius (meters) around a new feature's bounding box in which old features
   * are candidate matches. A shop that moved less than this between exports is
   * still discovered. Calibrated against the real exports (the old 2023 export
   * and the new one): all 125 existing bazaar geometries have a counterpart
   * within this radius; the first "not a match" feature is already 2.6 m from
   * its nearest old geometry but has ~zero overlap, so a generous radius is
   * safe — the *score* is what separates them, not this cutoff.
   */
  searchRadiusMeters: number;
  /** Minimum score for a candidate to be considered a plausible match. */
  minCandidateScore: number;
  /** A candidate at/above this score becomes a confident match (when unambiguous). */
  highConfidenceScore: number;
  /** A second candidate within this margin of the best makes the result REVIEW. */
  ambiguityMargin: number;
  weights: MatchingWeights;
}

export const DEFAULT_MATCHING_OPTIONS: MatchingOptions = {
  targetEpsg: 32638,
  searchRadiusMeters: 15,
  minCandidateScore: 0.6,
  highConfidenceScore: 0.8,
  ambiguityMargin: 0.15,
  weights: { overlap: 0.6, area: 0.2, bbox: 0.1, distance: 0.1 }
};

export interface ImportGeometryEvidence {
  /** Distance between the two projected centroids in meters. */
  centroidDistanceMeters: number;
  /** min(area)/max(area) of the two projected geometries (1 = same footprint size). */
  areaRatio: number;
  /** Intersection area divided by the smaller area (1 = the small one is inside the big one). */
  overlapRatio: number;
  /** Jaccard index of the two projected bounding boxes: shared area / union area. */
  bboxSimilarity: number;
}

export interface ImportMatchCandidate {
  oldIndex: number;
  oldShopId: string;
  oldName: string | null;
  oldSurveyed: boolean | null;
  oldFingerprint: string;
  oldHandle: string | null;
  /** False when the existing geometry itself is invalid (e.g. holes outside the shell). */
  oldGeometryValid: boolean;
  /** Untouched existing geometry (WGS84) — nothing is ever modified. */
  oldWgs84Geometry: GeometryLike;
  evidence: ImportGeometryEvidence;
  score: number;
}

export interface ImportFeatureMatch {
  newIndex: number;
  newFingerprint: string;
  newHandle: string | null;
  newProperties: Record<string, unknown>;
  status: ImportMatchStatus;
  /** Winning old feature for EXACT_MATCH/GEOMETRY_MATCH, otherwise null. */
  matchedOldIndex: number | null;
  matchedOldShopId: string | null;
  /** Score of the best candidate (null when nothing reached the threshold). */
  bestScore: number | null;
  /** Candidates that passed the minimum threshold, sorted best-first (max 8). */
  candidates: ImportMatchCandidate[];
  /** Whether a human must confirm this row during import review. */
  reviewRequired: boolean;
  /** Machine code explaining a review/invalid/duplicate status; null when clean. */
  reason: string | null;
  geometryValid: boolean;
  geometryIssues: string[];
  /** Untouched uploaded geometry (WGS84). */
  newWgs84Geometry: GeometryLike;
}

export interface ImportMatchSummary {
  totalFeatures: number;
  /** EXACT_MATCH + GEOMETRY_MATCH. */
  existing: number;
  /** GEOMETRY_MATCH only (same shop, changed footprint). */
  geometryChanged: number;
  /** EXACT_MATCH only (identical fingerprint). */
  exact: number;
  /** NEW only. */
  newFeatures: number;
  /** REVIEW only. */
  reviewRequired: number;
  /** INVALID only. */
  invalid: number;
  /** DUPLICATE only. */
  duplicate: number;
  /** Distinct old shops assigned one-to-one (EXACT_MATCH or GEOMETRY_MATCH). */
  oldMatched: number;
  /** Distinct old shops referenced by any scored candidate or match (spatially accounted). */
  oldReferenced: number;
}

export interface ImportReviewResult {
  options: MatchingOptions;
  summary: ImportMatchSummary;
  features: ImportFeatureMatch[];
}

export interface MatchingOldShop {
  shopId: string;
  name: string | null;
  surveyed: boolean | null;
  handle: string | null;
  /** SHA-256 of the WGS84 geometry (the DB geom_fingerprint); computed when null. */
  fingerprint: string | null;
  /** Existing shop geometry, WGS84, untouched. */
  geometryWgs84: GeometryLike;
}

export interface MatchingNewFeature {
  index: number;
  /** SHA-256 of the WGS84 geometry produced by analyzeGeoJsonContent. */
  fingerprint: string;
  handle: string | null;
  properties: Record<string, unknown>;
  /** Uploaded geometry already converted to WGS84. */
  geometryWgs84: GeometryLike;
}

type Point = [number, number];
type Ring = Point[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface Metrics {
  areaM2: number;
  centroid: { x: number; y: number };
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

interface WorkingFeature {
  index: number;
  fingerprint: string;
  handle: string | null;
  geometryWgs84: GeometryLike;
  projected: GeometryLike;
  valid: boolean;
  issues: string[];
  analysisProjected: GeometryLike | null;
  repairable: boolean;
  areaM2: number;
  centroid: { x: number; y: number };
  bbox: Metrics['bbox'];
}

const MAX_CANDIDATES = 8;

function mergeOptions(passed?: Partial<MatchingOptions>): MatchingOptions {
  const base = DEFAULT_MATCHING_OPTIONS;
  return {
    targetEpsg: passed?.targetEpsg ?? base.targetEpsg,
    searchRadiusMeters: passed?.searchRadiusMeters ?? base.searchRadiusMeters,
    minCandidateScore: passed?.minCandidateScore ?? base.minCandidateScore,
    highConfidenceScore: passed?.highConfidenceScore ?? base.highConfidenceScore,
    ambiguityMargin: passed?.ambiguityMargin ?? base.ambiguityMargin,
    weights: { ...base.weights, ...passed?.weights }
  };
}

/** Every polygon in a geometry (one Polygon = [shell, ...holes]). */
function ringsOf(geometry: GeometryLike): Polygon[] {
  if (geometry.type === 'Polygon') {
    return [geometry.coordinates as unknown as Polygon];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as unknown as MultiPolygon).map((parts) => parts as Polygon);
  }
  return [];
}

function coordsFinite(coord: unknown): boolean {
  if (typeof coord === 'number') return Number.isFinite(coord);
  if (Array.isArray(coord)) return coord.every(coordsFinite);
  return true;
}

function dedupeConsecutive(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (last && last[0] === p[0] && last[1] === p[1]) continue;
    out.push(p);
  }
  return out;
}

function ringIsClosed(ring: Ring): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

/** |shoelace|/2 of a closed ring (units = projection units², here m²). */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

function hasRepeatedConsecutive(ring: Ring): boolean {
  for (let i = 1; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i - 1];
    if (a[0] === b[0] && a[1] === b[1]) return true;
  }
  return false;
}

function ringHasSelfIntersection(ring: Ring): boolean {
  try {
    const feature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
    const kinks = turfKinks(feature as never) as { features: unknown[] };
    return kinks.features.length > 0;
  } catch {
    return false;
  }
}

/** Standard ray-casting point-in-ring test for projected coordinates. */
function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function ringCentroid(ring: Ring): { x: number; y: number } {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const cross = a[0] * b[1] - b[0] * a[1];
    twice += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  if (twice === 0) {
    let sx = 0;
    let sy = 0;
    const slice = ring.filter((_, i) => i === 0 || i === Math.floor(ring.length / 2) || i === ring.length - 1);
    for (const p of slice) {
      sx += p[0];
      sy += p[1];
    }
    return { x: sx / Math.max(slice.length, 1), y: sy / Math.max(slice.length, 1) };
  }
  return { x: cx / (3 * twice), y: cy / (3 * twice) };
}

function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  try {
    const fa = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: a } };
    const fb = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: b } };
    return turfIntersect(fa as never, fb as never) !== null;
  } catch {
    return false;
  }
}

/** Checks one ring for structural problems. */
function assessRing(ring: Ring, issues: Set<string>, part: 'shell' | 'hole'): void {
  if (ring.length < 4) {
    issues.add('ring_has_less_than_4_points');
    return;
  }
  if (!ringIsClosed(ring)) issues.add('ring_not_closed');
  if (ringArea(ring) === 0) issues.add('ring_has_zero_area');
  if (hasRepeatedConsecutive(ring)) issues.add('ring_has_repeated_consecutive_points');
  if (ringHasSelfIntersection(ring)) {
    issues.add(part === 'shell' ? 'shell_self_intersects' : 'hole_self_intersects');
  }
}

/**
 * Validity assessment. Only ring-local tests are used (closure, minimum
 * size, zero area, self-intersection via kinks) plus hole-inside-shell and
 * (for MultiPolygon) pairwise shell separation.
 *
 * Exported as a diagnostic/utility: the engine itself uses it to decide
 * INVALID/REVIEW and to build analysis geometry.
 */
export function assessValidity(geometry: GeometryLike): { valid: boolean; issues: string[] } {
  const issues = new Set<string>();
  if (!coordsFinite(geometry.coordinates)) issues.add('non_finite_coordinates');
  const polys = ringsOf(geometry);
  if (polys.length === 0) {
    issues.add('unsupported_geometry_type');
    return { valid: false, issues: [...issues] };
  }
  for (const poly of polys) {
    if (poly.length === 0) {
      issues.add('polygon_has_no_rings');
      continue;
    }
    const [shell, ...holes] = poly;
    if (shell.length < 4) {
      issues.add('shell_has_less_than_4_points');
      continue;
    }
    assessRing(shell, issues, 'shell');
    for (const hole of holes) {
      if (hole.length < 4) {
        issues.add('hole_has_less_than_4_points');
        continue;
      }
      assessRing(hole, issues, 'hole');
      if (ringIsClosed(hole)) {
        const anchor = hole[0];
        if (!pointInRing(anchor[0], anchor[1], shell)) issues.add('hole_outside_shell');
      }
    }
  }
  if (polys.length > 1) {
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        if (polygonsOverlap(polys[i], polys[j])) {
          issues.add('multipolygon_parts_overlap');
          break;
        }
      }
    }
  }
  return { valid: issues.size === 0, issues: [...issues] };
}

/**
 * Analysis-only repair: never returned to a caller as data.
 *  - drops rings that are structurally unusable (not closed / degenerate);
 *  - drops holes that lie outside the shell (the classic AutoCAD export bug
 *    where 18 "holes" wrongly sit beside the building);
 *  - as a last resort uses buffer(0), which cleans self-intersections.
 *
 * Exported as a diagnostic/utility (tests assert repair behavior).
 */
export function repairProjected(projected: GeometryLike): { geometry: GeometryLike | null; repairable: boolean } {
  const repairedPolys: Polygon[] = [];
  for (const poly of ringsOf(projected)) {
    const shell = dedupeConsecutive(poly.length > 0 ? poly[0] : []);
    if (shell.length < 4 || !ringIsClosed(shell) || ringArea(shell) === 0) continue;
    const holes: Ring[] = [];
    for (const rawHole of poly.slice(1)) {
      const hole = dedupeConsecutive(rawHole);
      if (hole.length < 4 || !ringIsClosed(hole) || ringArea(hole) === 0) continue;
      if (pointInRing(hole[0][0], hole[0][1], shell)) holes.push(hole);
    }
    repairedPolys.push([shell, ...holes]);
  }
  if (repairedPolys.length === 0) return { geometry: null, repairable: false };
  const assembled: GeometryLike =
    repairedPolys.length === 1
      ? { type: 'Polygon', coordinates: repairedPolys[0] as unknown }
      : { type: 'MultiPolygon', coordinates: repairedPolys as unknown };
  if (assessValidity(assembled).valid) return { geometry: assembled, repairable: true };
  try {
    const buffered = turfBuffer({ type: 'Feature', properties: {}, geometry: assembled } as never, 0, {
      units: 'meters'
    });
    if (buffered && assessValidity(buffered.geometry as unknown as GeometryLike).valid) {
      return { geometry: buffered.geometry as unknown as GeometryLike, repairable: true };
    }
  } catch {
    /* last-resort cleanup unavailable */
  }
  return { geometry: null, repairable: false };
}

function geometryMetrics(geometry: GeometryLike): Metrics {
  let areaM2 = 0;
  let weightSum = 0;
  let cx = 0;
  let cy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const polys = ringsOf(geometry);
  const shells: Ring[] = [];
  for (const poly of polys) {
    if (poly.length === 0) continue;
    const shell = poly[0];
    const shellArea = ringArea(shell);
    areaM2 += shellArea;
    for (const hole of poly.slice(1)) areaM2 -= ringArea(hole);
    if (shellArea > 0) {
      const c = ringCentroid(shell);
      cx += c.x * shellArea;
      cy += c.y * shellArea;
      weightSum += shellArea;
    }
    shells.push(shell);
    for (const ring of poly) {
      for (const p of ring) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
  }
  const fallback = shells.length > 0 && shells[0].length > 0 ? shells[0][0] : [0, 0];
  return {
    areaM2,
    centroid: weightSum > 0 ? { x: cx / weightSum, y: cy / weightSum } : { x: fallback[0], y: fallback[1] },
    bbox: { minX, minY, maxX, maxY }
  };
}

function intersectionAreaM2(a: GeometryLike, b: GeometryLike): number {
  try {
    const fa = { type: 'Feature', properties: {}, geometry: a };
    const fb = { type: 'Feature', properties: {}, geometry: b };
    const inter = turfIntersect(fa as never, fb as never);
    if (!inter) return 0;
    return geometryMetrics(inter.geometry as unknown as GeometryLike).areaM2;
  } catch {
    return 0;
  }
}

function bboxJaccard(a: Metrics['bbox'], b: Metrics['bbox']): number {
  const sharedW = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const sharedH = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  const shared = sharedW * sharedH;
  const union = (a.maxX - a.minX) * (a.maxY - a.minY) + (b.maxX - b.minX) * (b.maxY - b.minY) - shared;
  return union > 0 ? shared / union : 0;
}

function normalizeFeature(
  input: { index: number; fingerprint: string; handle: string | null; geometryWgs84: GeometryLike },
  options: MatchingOptions
): WorkingFeature {
  const projected = toProjectedGeometry(input.geometryWgs84, options.targetEpsg);
  const assessment = assessValidity(projected);
  let analysisProjected: GeometryLike | null = null;
  let repairable = false;
  if (assessment.valid) {
    analysisProjected = projected;
    repairable = true;
  } else {
    const repaired = repairProjected(projected);
    analysisProjected = repaired.geometry;
    repairable = repaired.repairable;
  }
  // Metrics come from the ANALYSIS geometry. For an invalid polygon such as
  // "holes outside the shell" the raw shoelace area is negative and would
  // poison every score; the repaired footprint is the meaningful shape.
  const metrics = geometryMetrics(analysisProjected ?? projected);
  return {
    index: input.index,
    fingerprint: input.fingerprint,
    handle: input.handle,
    geometryWgs84: input.geometryWgs84,
    projected,
    valid: assessment.valid,
    issues: assessment.issues,
    analysisProjected,
    repairable,
    areaM2: metrics.areaM2,
    centroid: metrics.centroid,
    bbox: metrics.bbox
  };
}

/**
 * Uniform bbox grid so candidate discovery is O(n) instead of O(n²):
 * every old feature is inserted into each grid cell its bbox covers, and a
 * new feature queries every cell its (expanded) bbox covers. An old feature
 * is returned iff its bbox lies within `radius` of the new bbox.
 */
class BboxGrid {
  private readonly cell: number;
  private readonly cells = new Map<string, number[]>();

  constructor(cellSizeMeters: number) {
    this.cell = cellSizeMeters;
  }

  private cellKey(x: number, y: number): string {
    return `${Math.floor(x / this.cell)}:${Math.floor(y / this.cell)}`;
  }

  add(index: number, bbox: Metrics['bbox']): void {
    const minCellX = Math.floor(bbox.minX / this.cell);
    const maxCellX = Math.floor(bbox.maxX / this.cell);
    const minCellY = Math.floor(bbox.minY / this.cell);
    const maxCellY = Math.floor(bbox.maxY / this.cell);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = this.cellKey(cx * this.cell, cy * this.cell);
        const list = this.cells.get(key);
        if (list) list.push(index);
        else this.cells.set(key, [index]);
      }
    }
  }

  query(bbox: Metrics['bbox'], radiusMeters: number): number[] {
    const minCellX = Math.floor((bbox.minX - radiusMeters) / this.cell);
    const maxCellX = Math.floor((bbox.maxX + radiusMeters) / this.cell);
    const minCellY = Math.floor((bbox.minY - radiusMeters) / this.cell);
    const maxCellY = Math.floor((bbox.maxY + radiusMeters) / this.cell);
    const found = new Set<number>();
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const list = this.cells.get(this.cellKey(cx * this.cell, cy * this.cell));
        if (!list) continue;
        for (const idx of list) found.add(idx);
      }
    }
    return [...found];
  }
}

function scoreCandidate(a: WorkingFeature, b: WorkingFeature, options: MatchingOptions): {
  evidence: ImportGeometryEvidence;
  score: number;
} {
  const aAnalysis = a.analysisProjected;
  const bAnalysis = b.analysisProjected;
  const interArea = aAnalysis && bAnalysis ? intersectionAreaM2(aAnalysis, bAnalysis) : 0;
  const minArea = Math.min(a.areaM2, b.areaM2);
  const maxArea = Math.max(a.areaM2, b.areaM2);
  const overlapRatio = minArea > 0 ? interArea / minArea : 0;
  const areaRatio = maxArea > 0 ? minArea / maxArea : 0;
  const bboxSimilarity = bboxJaccard(a.bbox, b.bbox);
  const dx = a.centroid.x - b.centroid.x;
  const dy = a.centroid.y - b.centroid.y;
  const centroidDistanceMeters = Math.sqrt(dx * dx + dy * dy);
  const distanceScore = Math.max(0, 1 - centroidDistanceMeters / options.searchRadiusMeters);
  const score =
    options.weights.overlap * overlapRatio +
    options.weights.area * areaRatio +
    options.weights.bbox * bboxSimilarity +
    options.weights.distance * distanceScore;
  return { evidence: { centroidDistanceMeters, areaRatio, overlapRatio, bboxSimilarity }, score };
}

/**
 * Matches every uploaded feature against the existing shops. Deterministic
 * and one-to-one. See the module docblock for the guarantees.
 */
export function matchImportFeatures(
  oldShops: MatchingOldShop[],
  newFeatures: MatchingNewFeature[],
  passedOptions?: Partial<MatchingOptions>
): ImportReviewResult {
  const options = mergeOptions(passedOptions);

  const normalizedOlds: Array<{ rec: MatchingOldShop; norm: WorkingFeature }> = oldShops.map((rec, i) => ({
    rec,
    norm: normalizeFeature(
      {
        index: i,
        fingerprint: rec.fingerprint ?? geometryFingerprint(rec.geometryWgs84),
        handle: rec.handle,
        geometryWgs84: rec.geometryWgs84
      },
      options
    )
  }));

  const oldByFingerprint = new Map<string, number>();
  for (const { norm } of normalizedOlds) oldByFingerprint.set(norm.fingerprint, norm.index);

  const grid = new BboxGrid(options.searchRadiusMeters);
  normalizedOlds.forEach(({ norm }, i) => {
    if (norm.analysisProjected) grid.add(i, norm.bbox);
  });

  const seenFingerprints = new Map<string, number>();
  const referencedOlds = new Set<number>();
  const results: ImportFeatureMatch[] = [];

  for (const nf of newFeatures) {
    const norm = normalizeFeature(
      { index: nf.index, fingerprint: nf.fingerprint, handle: nf.handle, geometryWgs84: nf.geometryWgs84 },
      options
    );

    const base = {
      newIndex: nf.index,
      newFingerprint: nf.fingerprint,
      newHandle: nf.handle,
      newProperties: nf.properties,
      newWgs84Geometry: nf.geometryWgs84,
      geometryValid: norm.valid,
      geometryIssues: norm.issues
    };

    if (!norm.valid) {
      results.push({
        ...base,
        status: 'INVALID',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: true,
        reason: 'invalid_geometry'
      });
      continue;
    }

    const previous = seenFingerprints.get(nf.fingerprint);
    if (previous !== undefined) {
      results.push({
        ...base,
        status: 'DUPLICATE',
        matchedOldIndex: null,
        matchedOldShopId: null,
        bestScore: null,
        candidates: [],
        reviewRequired: true,
        reason: `duplicate_of_new_${previous}`
      });
      continue;
    }
    seenFingerprints.set(nf.fingerprint, nf.index);

    const exactOldIndex = oldByFingerprint.get(nf.fingerprint) ?? null;

    const scored: Array<{ oldIndex: number; cand: ImportMatchCandidate }> = [];
    for (const oldIndex of grid.query(norm.bbox, options.searchRadiusMeters)) {
      const { rec, norm: oldNorm } = normalizedOlds[oldIndex];
      if (!oldNorm.analysisProjected || !norm.analysisProjected) continue;
      const { evidence, score } = scoreCandidate(norm, oldNorm, options);
      if (score < options.minCandidateScore) continue;
      referencedOlds.add(oldIndex);
      scored.push({
        oldIndex,
        cand: {
          oldIndex,
          oldShopId: rec.shopId,
          oldName: rec.name,
          oldSurveyed: rec.surveyed,
          oldFingerprint: oldNorm.fingerprint,
          oldHandle: rec.handle ?? oldNorm.handle,
          oldGeometryValid: oldNorm.valid,
          oldWgs84Geometry: rec.geometryWgs84,
          evidence,
          score
        }
      });
    }
    // Deterministic tie-break: score desc, then old fingerprint asc, then old index asc.
    scored.sort(
      (a, b) => b.cand.score - a.cand.score || a.cand.oldFingerprint.localeCompare(b.cand.oldFingerprint) || a.oldIndex - b.oldIndex
    );
    const candidates = scored.slice(0, MAX_CANDIDATES).map((s) => s.cand);
    const best = scored[0];

    let status: ImportMatchStatus;
    let reason: string | null = null;
    let matchedOldIndex: number | null = null;

    if (exactOldIndex !== null) {
      status = 'EXACT_MATCH';
      matchedOldIndex = exactOldIndex;
    } else if (!best) {
      status = 'NEW';
    } else {
      const second = scored[1];
      const ambiguous =
        second !== undefined &&
        second.cand.score >= Math.max(options.minCandidateScore, best.cand.score - options.ambiguityMargin);
      if (best.cand.score >= options.highConfidenceScore) {
        if (ambiguous) {
          status = 'REVIEW';
          reason = 'ambiguous_candidates';
        } else {
          status = 'GEOMETRY_MATCH';
          matchedOldIndex = best.oldIndex;
        }
      } else {
        status = 'REVIEW';
        reason = 'low_confidence';
      }
    }

    // An invalid existing feature may match through its repaired footprint,
    // but never silently: the merge requires a human decision.
    if (
      status === 'GEOMETRY_MATCH' &&
      matchedOldIndex !== null &&
      !normalizedOlds[matchedOldIndex].norm.valid
    ) {
      status = 'REVIEW';
      reason = 'invalid_old_geometry';
      matchedOldIndex = null;
    }

    const matchedShop = matchedOldIndex !== null ? normalizedOlds[matchedOldIndex].rec : null;
    results.push({
      ...base,
      status,
      matchedOldIndex,
      matchedOldShopId: matchedShop?.shopId ?? null,
      bestScore: best ? best.cand.score : null,
      candidates,
      reviewRequired: status === 'REVIEW',
      reason
    });
  }

  // One-to-many conflict resolution: an old shop can be assigned to at most
  // one new feature. Losers move to REVIEW with their candidates preserved.
  const grouped = new Map<number, ImportFeatureMatch[]>();
  for (const r of results) {
    if (r.matchedOldIndex === null) continue;
    if (r.status !== 'EXACT_MATCH' && r.status !== 'GEOMETRY_MATCH') continue;
    const list = grouped.get(r.matchedOldIndex);
    if (list) list.push(r);
    else grouped.set(r.matchedOldIndex, [r]);
  }
  for (const members of grouped.values()) {
    if (members.length <= 1) continue;
    members.sort(
      (a, b) =>
        (b.status === 'EXACT_MATCH' ? 1 : 0) - (a.status === 'EXACT_MATCH' ? 1 : 0) ||
        (b.bestScore ?? -Infinity) - (a.bestScore ?? -Infinity) ||
        a.newFingerprint.localeCompare(b.newFingerprint)
    );
    for (const loser of members.slice(1)) {
      loser.status = 'REVIEW';
      loser.reason = 'conflict_one_to_many';
      loser.matchedOldIndex = null;
      loser.matchedOldShopId = null;
      loser.reviewRequired = true;
    }
  }

  results.sort((a, b) => a.newIndex - b.newIndex);

  const count = (status: ImportMatchStatus): number => results.filter((r) => r.status === status).length;
  const exact = count('EXACT_MATCH');
  const geometryChanged = count('GEOMETRY_MATCH');
  const matchedOlds = new Set<number>();
  for (const r of results) {
    if (r.matchedOldIndex !== null && (r.status === 'EXACT_MATCH' || r.status === 'GEOMETRY_MATCH')) {
      matchedOlds.add(r.matchedOldIndex);
    }
  }

  return {
    options,
    summary: {
      totalFeatures: results.length,
      existing: exact + geometryChanged,
      geometryChanged,
      exact,
      newFeatures: count('NEW'),
      reviewRequired: count('REVIEW'),
      invalid: count('INVALID'),
      duplicate: count('DUPLICATE'),
      oldMatched: matchedOlds.size,
      oldReferenced: referencedOlds.size
    },
    features: results
  };
}