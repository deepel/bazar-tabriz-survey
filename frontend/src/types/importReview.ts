/**
 * Import-review contract shared with the backend matching engine
 * (backend/src/services/geometry-matching.service.ts). This is the typed
 * shape the Phases 2+ endpoints will return; the backend and this file are
 * kept in lock-step.
 */

export type ImportMatchStatus =
  | 'EXACT_MATCH'
  | 'GEOMETRY_MATCH'
  | 'NEW'
  | 'REVIEW'
  | 'INVALID'
  | 'DUPLICATE';

export interface ImportGeometryEvidence {
  /** Distance between the two projected centroids, meters. */
  centroidDistanceMeters: number;
  /** min(area)/max(area), 0..1. */
  areaRatio: number;
  /** intersection / min(area), 0..1. */
  overlapRatio: number;
  /** Jaccard of the two projected bounding boxes, 0..1. */
  bboxSimilarity: number;
}

export interface ImportMatchCandidate {
  oldIndex: number;
  oldShopId: string;
  oldName: string | null;
  oldSurveyed: boolean | null;
  oldFingerprint: string;
  oldHandle: string | null;
  /** False when the existing geometry itself is invalid but still a candidate. */
  oldGeometryValid: boolean;
  oldWgs84Geometry: { type: string; coordinates: unknown };
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
  bestScore: number | null;
  /** Candidates that passed the threshold, sorted best-first (max 8). */
  candidates: ImportMatchCandidate[];
  /** Whether a human must confirm this row during import review. */
  reviewRequired: boolean;
  /** Machine code explaining a review/invalid/duplicate status; null when clean. */
  reason: string | null;
  geometryValid: boolean;
  geometryIssues: string[];
  newWgs84Geometry: { type: string; coordinates: unknown };
}

export interface ImportMatchSummary {
  totalFeatures: number;
  /** EXACT_MATCH + GEOMETRY_MATCH. */
  existing: number;
  /** GEOMETRY_MATCH only. */
  geometryChanged: number;
  /** EXACT_MATCH only. */
  exact: number;
  /** NEW only. */
  newFeatures: number;
  /** REVIEW only. */
  reviewRequired: number;
  /** INVALID only. */
  invalid: number;
  /** DUPLICATE only. */
  duplicate: number;
  /** Distinct old shops assigned one-to-one. */
  oldMatched: number;
  /** Distinct old shops referenced by any candidate/match. */
  oldReferenced: number;
}

export interface ImportReviewResult {
  options: {
    targetEpsg: number;
    searchRadiusMeters: number;
    minCandidateScore: number;
    highConfidenceScore: number;
    ambiguityMargin: number;
  };
  summary: ImportMatchSummary;
  features: ImportFeatureMatch[];
}

export type ImportResolutionAction = 'same_existing_shop' | 'new_shop' | 'exclude';

/**
 * An explicit admin decision for one reviewed (blocking) feature. Mirrors
 * backend/src/services/import-review.service.ts.
 */
export interface ImportResolution {
  action: ImportResolutionAction;
  /** Required and server-validated when action is `same_existing_shop`. */
  oldShopId?: string;
}

export interface ImportReviewSession {
  previewId: string;
  filename: string;
  result: ImportReviewResult;
}

export interface ResolveReviewResponse {
  ok: boolean;
  previewId: string;
  resolutions: Record<number, ImportResolution>;
  /** Blocking features still waiting for a decision. */
  pending: number;
}

export interface ApplyReviewResponse {
  ok: boolean;
  filename: string;
  summary: ImportMatchSummary;
  applied: { newShops: number; updates: number; excluded: number };
}