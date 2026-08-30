import type { SupabaseClient } from '@supabase/supabase-js';

/** D-09: increments unconditionally on every chapter open, no per-user dedup.
 * Thin wrapper around the SECURITY DEFINER RPC (0003_reader.sql) — callable by
 * anonymous readers since reading itself is not login-gated in v1. */
export async function incrementChapterView(
  supabase: SupabaseClient,
  { chapterId }: { chapterId: string }
): Promise<void> {
  const { error } = await supabase.rpc('increment_chapter_view', { p_chapter_id: chapterId });
  if (error) throw new Error(error.message);
}
