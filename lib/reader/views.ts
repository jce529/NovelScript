import type { SupabaseClient } from '@supabase/supabase-js';
import { checkWriteAccess } from '../auth/write-access';

/** D-09: increments unconditionally on every chapter open, no per-user dedup.
 * Thin wrapper around the SECURITY DEFINER RPC (0003_reader.sql) — callable by
 * anonymous readers since reading itself is not login-gated in v1.
 * D-07: when a signed-in `userId` is supplied and that user may not write, the increment is
 * skipped silently (the RPC also skips it for suspended sessions), never failing the read. */
export async function incrementChapterView(
  supabase: SupabaseClient,
  { chapterId, userId }: { chapterId: string; userId?: string | null }
): Promise<void> {
  if (userId) {
    const access = await checkWriteAccess(supabase, userId);
    if (!access.ok) return;
  }
  const { error } = await supabase.rpc('increment_chapter_view', { p_chapter_id: chapterId });
  if (error) throw new Error(error.message);
}
