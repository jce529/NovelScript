import type { SupabaseClient } from '@supabase/supabase-js';

/** READ-08/D-19: toggleable, login-gated, distinct from work_likes/D-08. */
export async function toggleBookmark(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ bookmarked: boolean }> {
  const { data: existing } = await supabase
    .from('work_bookmarks').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('work_bookmarks').delete().eq('work_id', workId).eq('user_id', userId);
    return { bookmarked: false };
  }
  await supabase.from('work_bookmarks').insert({ work_id: workId, user_id: userId });
  return { bookmarked: true };
}

export async function getBookmarkState(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('work_bookmarks').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}
