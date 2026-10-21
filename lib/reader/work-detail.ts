import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicChapterListItem } from '@/lib/chapters/actions';

export const CHAPTERS_PER_PAGE = 10;
const BUTTON_GROUP = 5;

/** Completion/continuation rates are not computed yet (Phase 3 only shows "집계 중"). null is never 0%. */
export function getWorkReadingStats(): { completionRate: null; continuationRate: null } {
  return { completionRate: null, continuationRate: null };
}

export interface ChapterPage {
  items: PublicChapterListItem[];
  page: number;
  pageCount: number;
  total: number;
  /** Fixed 5-page groups (1-5, 6-10, ...), truncated at pageCount. */
  buttons: number[];
  empty: boolean;
}

/** 10 rows per page; keeps each row's original orderIndex/blinded/entitled (no renumbering). */
export function paginateChapters(chapters: PublicChapterListItem[], page: number): ChapterPage {
  const total = chapters.length;
  if (total === 0) return { items: [], page: 1, pageCount: 0, total: 0, buttons: [], empty: true };
  const pageCount = Math.ceil(total / CHAPTERS_PER_PAGE);
  const requested = Number.isInteger(page) ? page : 1;
  const current = Math.min(Math.max(requested, 1), pageCount);
  const start = Math.floor((current - 1) / BUTTON_GROUP) * BUTTON_GROUP + 1;
  const end = Math.min(start + BUTTON_GROUP - 1, pageCount);
  const buttons = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const from = (current - 1) * CHAPTERS_PER_PAGE;
  return { items: chapters.slice(from, from + CHAPTERS_PER_PAGE), page: current, pageCount, total, buttons, empty: false };
}

export interface ResumeTarget {
  chapterId: string;
  orderIndex: number;
  resumed: boolean;
}

/** Validates the saved progress against the current public list; a vanished chapter falls back to the first public one. */
export function resolveResumeChapter(
  chapters: PublicChapterListItem[],
  progress: { chapterId: string } | null,
): ResumeTarget | null {
  if (chapters.length === 0) return null;
  if (progress) {
    const hit = chapters.find((c) => c.id === progress.chapterId);
    if (hit) return { chapterId: hit.id, orderIndex: hit.orderIndex, resumed: true };
  }
  const first = chapters.find((c) => !c.blinded) ?? chapters[0];
  return { chapterId: first.id, orderIndex: first.orderIndex, resumed: false };
}

export function sumViewCounts(rows: { view_count: number | null }[] | null | undefined): number {
  return (rows ?? []).reduce((sum, r) => sum + (typeof r.view_count === 'number' ? r.view_count : 0), 0);
}

/** Public metadata only (published, non-deleted chapters' view_count); never reads chapter content. */
export async function getWorkViewCount(supabase: SupabaseClient, { workId }: { workId: string }): Promise<number> {
  const { data } = await supabase
    .from('chapters')
    .select('view_count')
    .eq('work_id', workId)
    .eq('is_published', true)
    .is('deleted_at', null);
  return sumViewCounts(data as { view_count: number | null }[] | null);
}
