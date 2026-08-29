import type { SupabaseClient } from '@supabase/supabase-js';

/** D-14: server-side, login-gated, one row per user+work, chapter-level granularity
 * only (no scroll-position tracking — D-14's explicit scope). Called on every chapter
 * open from the viewer (Plan 03-07). */
export async function upsertReadingProgress(
  supabase: SupabaseClient,
  { userId, workId, chapterId }: { userId: string; workId: string; chapterId: string }
): Promise<void> {
  const { error } = await supabase.from('reading_progress').upsert(
    { user_id: userId, work_id: workId, chapter_id: chapterId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,work_id' }
  );
  if (error) throw new Error(error.message);
}

/** D-15(a): work-detail page's "이어보기" vs "읽기 시작" CTA reads this. */
export async function getReadingProgress(
  supabase: SupabaseClient,
  { userId, workId }: { userId: string; workId: string }
): Promise<{ chapterId: string } | null> {
  const { data } = await supabase
    .from('reading_progress')
    .select('chapter_id')
    .eq('user_id', userId)
    .eq('work_id', workId)
    .maybeSingle();
  if (!data) return null;
  return { chapterId: data.chapter_id };
}

export interface RecentlyReadItem {
  workId: string;
  workTitle: string;
  coverImageUrl: string | null;
  chapterId: string;
  chapterTitle: string;
  /** 0-based order_index. UI-SPEC's "{N}화" copy uses chapterOrderIndex + 1. */
  chapterOrderIndex: number;
  updatedAt: string;
}

/** D-15(b): cross-work "최근 읽은 작품" list on the homepage. */
export async function listRecentlyRead(
  supabase: SupabaseClient,
  { userId, limit = 10 }: { userId: string; limit?: number }
): Promise<RecentlyReadItem[]> {
  const { data, error } = await supabase
    .from('reading_progress')
    .select('work_id, chapter_id, updated_at, works(title, cover_image_url), chapters(title, order_index)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const work = row.works as unknown as { title: string; cover_image_url: string | null } | null;
    const chapter = row.chapters as unknown as { title: string; order_index: number } | null;
    return {
      workId: row.work_id,
      workTitle: work?.title ?? '',
      coverImageUrl: work?.cover_image_url ?? null,
      chapterId: row.chapter_id,
      chapterTitle: chapter?.title ?? '',
      chapterOrderIndex: chapter?.order_index ?? 0,
      updatedAt: row.updated_at,
    };
  });
}
