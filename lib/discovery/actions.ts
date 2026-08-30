import type { SupabaseClient } from '@supabase/supabase-js';

export type FeedSortMode = 'latest' | 'popular';
export type FeedSortBasis = 'trending' | 'views' | 'likes' | 'ctr';

export interface FeedWork {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  genre: string | null;
  createdAt: string;
  viewCount: number;
  likeCount: number;
  ctr: number; // 0-1, D-02's "다음화 이동률" raw basis
  trendingScore: number; // 0-100, D-01
}

interface RawChapterRow {
  view_count: number;
  order_index: number;
  is_published: boolean;
  deleted_at: string | null;
}

/** D-01: proxy for "readers are hooked" — ratio of chapter[i+1] views to chapter[i]
 * views, averaged across consecutive published chapters. Avoids a dedicated
 * click-tracking table (RESEARCH.md Pattern 3 / Don't Hand-Roll). */
function averageNextChapterCtr(viewCountsInOrder: number[]): number {
  if (viewCountsInOrder.length < 2) return 0;
  const ratios = viewCountsInOrder.slice(1).map((v, i) => {
    const prev = viewCountsInOrder[i];
    return prev > 0 ? Math.min(v / prev, 1) : 0;
  });
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

// Defensive: a single non-finite input (malformed row from a large, concurrently
// mutated dataset) must never poison every other row's normalized value — dividing by
// a NaN max would otherwise NaN-out the whole result set.
function normalize(values: number[]): number[] {
  const finite = values.filter((v) => Number.isFinite(v));
  const max = Math.max(...finite, 0);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => (Number.isFinite(v) ? v / max : 0));
}

/** D-01: weights are Claude's/researcher's call (explicitly not precise per PROJECT.md) —
 * views 0.4, likes 0.3, next-chapter CTR 0.3, normalized per-page then scaled to 0-100. */
export function computeTrendingScores(
  rows: { totalViews: number; likeCount: number; ctr: number }[]
): number[] {
  const viewsNorm = normalize(rows.map((r) => r.totalViews));
  const likesNorm = normalize(rows.map((r) => r.likeCount));
  return rows.map((r, i) => {
    const ctr = Number.isFinite(r.ctr) ? r.ctr : 0;
    const raw = viewsNorm[i] * 0.4 + likesNorm[i] * 0.3 + ctr * 0.3;
    return Number.isFinite(raw) ? Math.round(raw * 100) : 0;
  });
}

/** D-02: 4 explicit sort bases. 'trending' (default) sorts by the composite score;
 * 'views'/'likes'/'ctr' sort by the individual raw metric the badge's tooltip
 * describes as inputs. 'latest' (sortMode, not sortBasis) ignores all of this and
 * sorts by createdAt instead. */
function sortFeed(rows: FeedWork[], sortMode: FeedSortMode, sortBasis: FeedSortBasis = 'trending'): FeedWork[] {
  if (sortMode === 'latest') {
    return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const key: keyof FeedWork =
    sortBasis === 'views' ? 'viewCount' : sortBasis === 'likes' ? 'likeCount' : sortBasis === 'ctr' ? 'ctr' : 'trendingScore';
  return [...rows].sort((a, b) => (b[key] as number) - (a[key] as number));
}

/** READ-01: only surfaces works with >=1 published chapter. D-04: genre filter reuses
 * GENRES from lib/works/genres.ts verbatim — callers must pass a value from that array. */
export async function listFeed(
  supabase: SupabaseClient,
  params: { genre?: string | null; sortMode: FeedSortMode; sortBasis?: FeedSortBasis }
): Promise<FeedWork[]> {
  let query = supabase
    .from('works')
    .select('id, title, synopsis, cover_image_url, genre, created_at, chapters(view_count, order_index, is_published, deleted_at)')
    .is('deleted_at', null);
  if (params.genre) query = query.eq('genre', params.genre);

  const { data: works, error } = await query;
  if (error) throw new Error(error.message);

  const workIds = (works ?? []).map((w) => w.id as string);
  const likeCounts = new Map<string, number>();
  // Batched to avoid HTTP header/URL overflow once workIds grows large — a single
  // `.in('work_id', workIds)` call with 200+ UUIDs can exceed the 16KB header limit
  // (observed against the live dev DB with 460+ works) and PostgREST/undici fails the
  // whole request rather than truncating, so every row's likeCount would silently read 0.
  const LIKE_QUERY_BATCH_SIZE = 150;
  for (let i = 0; i < workIds.length; i += LIKE_QUERY_BATCH_SIZE) {
    const batch = workIds.slice(i, i + LIKE_QUERY_BATCH_SIZE);
    const { data: likeRows, error: likeError } = await supabase
      .from('work_likes')
      .select('work_id')
      .in('work_id', batch);
    if (likeError) throw new Error(likeError.message);
    for (const row of likeRows ?? []) likeCounts.set(row.work_id, (likeCounts.get(row.work_id) ?? 0) + 1);
  }

  const staged = (works ?? [])
    .map((w) => {
      const chapters = ((w.chapters ?? []) as RawChapterRow[])
        .filter((c) => c.is_published && !c.deleted_at)
        .sort((a, b) => a.order_index - b.order_index);
      if (chapters.length === 0) return null;
      const totalViews = chapters.reduce((sum, c) => sum + c.view_count, 0);
      const likeCount = likeCounts.get(w.id as string) ?? 0;
      const ctr = averageNextChapterCtr(chapters.map((c) => c.view_count));
      return {
        id: w.id as string,
        title: w.title as string,
        synopsis: w.synopsis as string | null,
        coverImageUrl: w.cover_image_url as string | null,
        genre: w.genre as string | null,
        createdAt: w.created_at as string,
        viewCount: totalViews,
        likeCount,
        ctr,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const scores = computeTrendingScores(staged);
  const rows: FeedWork[] = staged.map((r, i) => ({
    id: r.id, title: r.title, synopsis: r.synopsis, coverImageUrl: r.coverImageUrl,
    genre: r.genre, createdAt: r.createdAt, viewCount: r.viewCount, likeCount: r.likeCount,
    ctr: r.ctr, trendingScore: scores[i],
  }));

  return sortFeed(rows, params.sortMode, params.sortBasis);
}
