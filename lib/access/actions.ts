import type { SupabaseClient } from '@supabase/supabase-js';

/** User identity comes from the authenticated DB session, never a caller ID. */
export async function canView(supabase: SupabaseClient, workId: string, chapterId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_view', {
    p_work_id: workId, p_chapter_id: chapterId ?? null,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function readChapterContent(supabase: SupabaseClient, chapterId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('read_chapter_content', { p_chapter_id: chapterId });
  if (error) throw new Error(error.message);
  return data;
}
