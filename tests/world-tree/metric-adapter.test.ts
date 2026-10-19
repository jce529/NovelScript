import { describe, expect, it, vi } from 'vitest';
import {
  METRIC_ADAPTER_KIND,
  chapterViewsToRaw,
  computeWorldTreePopularity,
  loadWorldTreePopularity,
} from '@/lib/world-tree/metric-adapter';

const baseline = { maxTotalViews: 1000, maxLikeCount: 200, authorViewsExcludedSince: '2026-10-01T00:00:00Z' };

describe('computeWorldTreePopularity', () => {
  it('returns 100 at the global maxima with ctr 1', () => {
    expect(computeWorldTreePopularity({ totalViews: 1000, likeCount: 200, ctr: 1 }, baseline)).toBe(100);
  });

  it('gives the same score for the same raw regardless of world size', () => {
    const raw = { totalViews: 300, likeCount: 50, ctr: 0.5 };
    const a = computeWorldTreePopularity(raw, baseline);
    const b = computeWorldTreePopularity(raw, { ...baseline });
    expect(a).toBe(b);
    // 0.4*0.3 + 0.3*0.25 + 0.3*0.5 = 0.345 -> 35 (rounded by computeTrendingScores)
    expect(a).toBe(35);
  });

  it('closes empty maxima, malformed, negative and nonfinite input to a finite 0..100 range', () => {
    const empty = { ...baseline, maxTotalViews: 0, maxLikeCount: 0 };
    expect(computeWorldTreePopularity({ totalViews: 5, likeCount: 5, ctr: 0 }, empty)).toBe(0);
    for (const bad of [NaN, Infinity, -Infinity, -5]) {
      const s = computeWorldTreePopularity({ totalViews: bad, likeCount: bad, ctr: bad }, baseline);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBe(0);
    }
    const badBase = { ...baseline, maxTotalViews: NaN, maxLikeCount: -3 };
    expect(computeWorldTreePopularity({ totalViews: 10, likeCount: 10, ctr: 1 }, badBase)).toBe(30);
  });

  it('clamps ctr to 0..1 and result to 0..100 when raw exceeds the baseline', () => {
    expect(computeWorldTreePopularity({ totalViews: 9999, likeCount: 9999, ctr: 7 }, baseline)).toBe(100);
    expect(computeWorldTreePopularity({ totalViews: 0, likeCount: 0, ctr: -2 }, baseline)).toBe(0);
  });
});

describe('chapterViewsToRaw', () => {
  it('sums views and averages adjacent ratios like the feed', () => {
    expect(chapterViewsToRaw([100, 50, 50], 3)).toEqual({ totalViews: 200, likeCount: 3, ctr: 0.75 });
    expect(chapterViewsToRaw([], 0)).toEqual({ totalViews: 0, likeCount: 0, ctr: 0 });
    expect(chapterViewsToRaw([0, 10], 0).ctr).toBe(0);
  });
});

describe('loadWorldTreePopularity', () => {
  it('scores work nodes only, skips broken stubs, and carries the temporary-metric note', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: baseline, error: null }) };
    const result = await loadWorldTreePopularity(supabase as never, [
      { nodeType: 'work', nodeKey: 'n0', metrics: { totalViews: 1000, likeCount: 200, ctr: 1 } },
      { nodeType: 'broken', nodeKey: 'n1' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scores).toEqual({ n0: 100 });
    expect(result.note.kind).toBe(METRIC_ADAPTER_KIND);
    expect(METRIC_ADAPTER_KIND).toBe('feed-proxy-v1');
    expect(result.note.temporary).toBe(true);
    expect(result.note.authorViewsExcludedSince).toBe(baseline.authorViewsExcludedSince);
    expect(result.note.limitations.length).toBeGreaterThan(0);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('get_world_tree_metric_baseline');
  });

  it('fails closed with a typed failure when the baseline is unavailable', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } }) };
    const result = await loadWorldTreePopularity(supabase as never, []);
    expect(result.ok).toBe(false);
  });
});
