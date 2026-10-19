import { describe, expect, it } from 'vitest';
import {
  METRIC_COEFFICIENTS,
  branchProximity,
  branchStroke,
  fruitDiameter,
  strokeForNode,
  STUB_STROKE_PX,
} from '@/lib/world-tree/metrics';

const same = { baselineDocCount: 10, modified: 0, deleted: 0, added: 0 };

describe('branchProximity', () => {
  it('decays by 0.85 per depth when unchanged', () => {
    expect(branchProximity({ ...same, depth: 1 })).toBeCloseTo(0.85, 6);
    expect(branchProximity({ ...same, depth: 3 })).toBeCloseTo(0.614125, 6);
    expect(branchProximity({ ...same, depth: 0 })).toBe(1);
  });

  it('is 0 when changes exceed the baseline and added is not offset by growth', () => {
    expect(branchProximity({ baselineDocCount: 4, modified: 3, deleted: 1, added: 2, depth: 1 })).toBe(0);
    expect(branchProximity({ baselineDocCount: 10, modified: 5, deleted: 0, added: 0, depth: 0 })).toBeCloseTo(0.5, 6);
  });

  it('handles baseline 0 without a zero division', () => {
    expect(branchProximity({ baselineDocCount: 0, modified: 0, deleted: 0, added: 0, depth: 1 })).toBeCloseTo(0.85, 6);
    expect(branchProximity({ baselineDocCount: 0, modified: 0, deleted: 0, added: 2, depth: 1 })).toBe(0);
  });

  it('closes NaN and negative input to a finite 0..1 value', () => {
    const p = branchProximity({ baselineDocCount: NaN, modified: -1, deleted: NaN, added: -3, depth: -2 });
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('branchStroke', () => {
  it('grows with visible descendants but never exceeds 6px', () => {
    const a = branchStroke({ proximity: 0.5, visibleDescendantCount: 0 });
    const b = branchStroke({ proximity: 0.5, visibleDescendantCount: 7 });
    expect(b).toBeGreaterThan(a);
    expect(branchStroke({ proximity: 1, visibleDescendantCount: 100000 })).toBe(6);
    expect(branchStroke({ proximity: 0, visibleDescendantCount: 0 })).toBe(1);
  });

  it('is finite for nonfinite input', () => {
    const s = branchStroke({ proximity: NaN, visibleDescendantCount: -4 });
    expect(s).toBe(1);
  });

  it('does not depend on unpublished work counts (only the visible count is an input)', () => {
    expect(branchStroke({ proximity: 0.6, visibleDescendantCount: 3 })).toBe(
      branchStroke({ proximity: 0.6, visibleDescendantCount: 3 }),
    );
  });
});

describe('fruitDiameter', () => {
  it('maps score 0/100 to 14/44px and closes bad input to 14', () => {
    expect(fruitDiameter(0)).toBe(14);
    expect(fruitDiameter(100)).toBe(44);
    expect(fruitDiameter(NaN)).toBe(14);
    expect(fruitDiameter(-10)).toBe(14);
    expect(fruitDiameter(1e9)).toBe(44);
  });

  it('keeps a separate 44px touch target', () => {
    expect(METRIC_COEFFICIENTS.touchTargetPx).toBeGreaterThanOrEqual(44);
    expect(METRIC_COEFFICIENTS.provisional).toBe(true);
  });
});

describe('strokeForNode', () => {
  it('uses a fixed neutral stroke for broken stubs without diff or scale inputs', () => {
    expect(strokeForNode({ nodeType: 'broken' })).toBe(STUB_STROKE_PX);
  });

  it('uses proximity and visible scale for published work nodes', () => {
    const s = strokeForNode({
      nodeType: 'work',
      proximity: { ...same, depth: 1 },
      visibleDescendantCount: 2,
    });
    expect(s).toBeGreaterThan(1);
    expect(s).toBeLessThanOrEqual(6);
  });
});
