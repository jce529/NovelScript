import type { SupabaseClient } from '@supabase/supabase-js';

/** D-08: toggleable, login-gated. Select-then-insert-or-delete (RESEARCH.md Pattern 6). */
export async function toggleLike(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ liked: boolean }> {
  const { data: existing } = await supabase
    .from('work_likes').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  if (existing) {
    await supabase.from('work_likes').delete().eq('work_id', workId).eq('user_id', userId);
    return { liked: false };
  }
  await supabase.from('work_likes').insert({ work_id: workId, user_id: userId });
  return { liked: true };
}

export async function getLikeState(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('work_likes').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

export async function getLikeCount(
  supabase: SupabaseClient,
  { workId }: { workId: string }
): Promise<number> {
  const { count } = await supabase
    .from('work_likes').select('work_id', { count: 'exact', head: true }).eq('work_id', workId);
  return count ?? 0;
}
