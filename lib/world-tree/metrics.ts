/**
 * World-tree visual coefficients (18-05, WORLD-TREE rules 9 and 14). Pure functions only.
 *
 * The formulas are provisional (`METRIC_COEFFICIENTS.provisional`): the UI should tell readers the
 * sizing formula is a temporary draft. All inputs close to a finite value: NaN, Infinity and
 * negative numbers are treated as 0.
 */

export const METRIC_COEFFICIENTS = Object.freeze({
  provisional: true,
  depthDecay: 0.85,
  strokeMinPx: 1,
  strokeMaxPx: 6,
  strokeProximityPx: 4,
  strokeScalePx: 0.25,
  strokeScaleLogCap: 4,
  fruitMinPx: 14,
  fruitRangePx: 30,
  /** Real touch target, independent of the visual fruit size. */
  touchTargetPx: 44,
});

/** Fixed neutral stroke for broken-branch stubs: no diff, depth or scale is inferred from it. */
export const STUB_STROKE_PX = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export interface ProximityInput {
  /** Setting files of the 5 kinds at the fork point (template, folder and chapter excluded). */
  baselineDocCount: number;
  modified: number;
  deleted: number;
  added: number;
  depth: number;
}

/**
 * 1 - (modified + deleted + added) / max(baseline, 1), clamped to 0..1, times 0.85^depth.
 * Added documents are never offset by a larger denominator. With an empty baseline, no change
 * gives 1 * decay and any addition gives 0.
 */
export function branchProximity(input: ProximityInput): number {
  const baseline = nonNeg(input.baselineDocCount);
  const changes = nonNeg(input.modified) + nonNeg(input.deleted) + nonNeg(input.added);
  const depth = Math.floor(nonNeg(input.depth));
  const ratio = changes === 0 ? 1 : clamp(1 - changes / Math.max(baseline, 1), 0, 1);
  return ratio * Math.pow(METRIC_COEFFICIENTS.depthDecay, depth);
}

/**
 * clamp(1 + 4 * proximity + min(log2(1 + visibleDescendantCount), 4) * 0.25, 1, 6) px.
 * Callers pass the count of descendants the audience can see, so unpublished works never leak
 * through thickness.
 */
export function branchStroke(input: { proximity: number; visibleDescendantCount: number }): number {
  const c = METRIC_COEFFICIENTS;
  const proximity = clamp(nonNeg(input.proximity), 0, 1);
  const scale = Math.min(Math.log2(1 + Math.floor(nonNeg(input.visibleDescendantCount))), c.strokeScaleLogCap);
  return clamp(c.strokeMinPx + c.strokeProximityPx * proximity + scale * c.strokeScalePx, c.strokeMinPx, c.strokeMaxPx);
}

/** 14 + 30 * sqrt(clamp(score / 100, 0, 1)) px: score 0 -> 14, score 100 -> 44. */
export function fruitDiameter(score: number): number {
  const c = METRIC_COEFFICIENTS;
  return c.fruitMinPx + c.fruitRangePx * Math.sqrt(clamp(nonNeg(score) / 100, 0, 1));
}

export type StrokeNodeInput =
  | { nodeType: 'broken' }
  | { nodeType: 'work'; proximity: ProximityInput; visibleDescendantCount: number };

/** Stubs get the fixed neutral stroke; only published work nodes use real diff and scale values. */
export function strokeForNode(node: StrokeNodeInput): number {
  if (node.nodeType === 'broken') return STUB_STROKE_PX;
  return branchStroke({
    proximity: branchProximity(node.proximity),
    visibleDescendantCount: node.visibleDescendantCount,
  });
}
