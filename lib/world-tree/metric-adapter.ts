import type { SupabaseClient } from '@supabase/supabase-js';
import { computeTrendingScores } from '@/lib/discovery/actions';
import type { FruitMetricRaw } from '@/lib/world-tree/types';
import {
  getWorldTreeMetricBaseline,
  type WorldTreeMetricBaseline,
  type WorldTreeQueryFailure,
} from '@/lib/world-tree/queries';

/**
 * WTREE-08 temporary popularity adapter (18-05). The single place that turns raw fruit metrics
 * into a 0..100 score.
 *
 * TEMPORARY: the requirement asks for reader count / completion / continuation rates, but that
 * data does not exist yet. Until it does, the score is the current feed proxy (views 0.4, likes
 * 0.3, next-chapter move rate 0.3 via the existing computeTrendingScores). When real data is
 * available only this file is replaced; UI and layout receive just `score` and `note`.
 *
 * Normalization is against the database's public global maxima (not the world's own works), so
 * the same raw input yields the same score in every world and unpublished works never move the
 * baseline. Broken-branch stubs have no metrics and are never scored. Owner/admin metrics of
 * unpublished works are never merged into a reader response here: callers pass the projection's
 * own nodes.
 */

export const METRIC_ADAPTER_KIND = 'feed-proxy-v1' as const;

export interface WorldTreeMetricNote {
  kind: typeof METRIC_ADAPTER_KIND;
  temporary: true;
  /** Signed-in author views are excluded from this time on; earlier counts stay mixed. */
  authorViewsExcludedSince: string;
  limitations: string[];
}

export const METRIC_LIMITATIONS: readonly string[] = Object.freeze([
  '열매 크기는 조회·좋아요·다음화 이동률로 계산한 임시 점수예요. 완독률·연독률 데이터가 생기면 바뀔 수 있어요.',
  '기준 시각 이전의 누적 조회에는 작가 본인 조회가 섞여 있고, 소급해서 분리할 수 없어요.',
  '로그인하지 않은 작가의 조회는 식별할 수 없어 제외되지 않아요.',
]);

const finiteNonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Same adjacent-views ratio average as the feed (kept private there; reproduced here). */
function nextChapterRatio(views: number[]): number {
  if (views.length < 2) return 0;
  const ratios = views.slice(1).map((v, i) => {
    const prev = views[i];
    return prev > 0 ? Math.min(v / prev, 1) : 0;
  });
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** Builds raw metrics from published chapter views (in reading order) and a like count. */
export function chapterViewsToRaw(viewsInOrder: number[], likeCount: number): FruitMetricRaw {
  const views = viewsInOrder.map(finiteNonNeg);
  return {
    totalViews: views.reduce((a, b) => a + b, 0),
    likeCount: finiteNonNeg(likeCount),
    ctr: nextChapterRatio(views),
  };
}

/** Score 0..100 for one work's raw metrics against the public global maxima. */
export function computeWorldTreePopularity(
  raw: FruitMetricRaw,
  baseline: Pick<WorldTreeMetricBaseline, 'maxTotalViews' | 'maxLikeCount'>,
): number {
  const maxViews = finiteNonNeg(baseline.maxTotalViews);
  const maxLikes = finiteNonNeg(baseline.maxLikeCount);
  const row = {
    totalViews: Math.min(finiteNonNeg(raw.totalViews), maxViews),
    likeCount: Math.min(finiteNonNeg(raw.likeCount), maxLikes),
    ctr: Number.isFinite(raw.ctr) ? clamp(raw.ctr, 0, 1) : 0,
  };
  // Sentinel row carries the global maxima so the existing per-page normalization becomes global.
  const sentinel = { totalViews: maxViews, likeCount: maxLikes, ctr: 0 };
  const score = computeTrendingScores([row, sentinel])[0];
  return Number.isFinite(score) ? clamp(score, 0, 100) : 0;
}

export interface PopularityNodeInput {
  nodeType: 'work' | 'broken';
  nodeKey: string;
  metrics?: FruitMetricRaw;
}

export type WorldTreePopularityResult =
  | { ok: true; scores: Record<string, number>; note: WorldTreeMetricNote }
  | WorldTreeQueryFailure;

/**
 * Scores the work nodes of a projection. One baseline RPC; no feed listing and no row scans.
 * Broken stubs are skipped.
 */
export async function loadWorldTreePopularity(
  supabase: SupabaseClient,
  nodes: readonly PopularityNodeInput[],
): Promise<WorldTreePopularityResult> {
  const result = await getWorldTreeMetricBaseline(supabase);
  if (!result.ok) return result;
  const scores: Record<string, number> = {};
  for (const node of nodes) {
    if (node.nodeType !== 'work' || !node.metrics) continue;
    scores[node.nodeKey] = computeWorldTreePopularity(node.metrics, result.baseline);
  }
  return {
    ok: true,
    scores,
    note: {
      kind: METRIC_ADAPTER_KIND,
      temporary: true,
      authorViewsExcludedSince: result.baseline.authorViewsExcludedSince,
      limitations: [...METRIC_LIMITATIONS],
    },
  };
}
