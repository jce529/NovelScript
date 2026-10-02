import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToggleDenial } from '../auth/write-access';
import { toggleRow } from './toggle';

/** D-08: toggleable, login-gated. Atomic via DB RPC (BUG-02). */
export async function toggleLike(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ liked?: boolean; denied?: ToggleDenial; error?: string }> {
  const { state, denied, error } = await toggleRow(supabase, 'work_likes', { workId, userId }, '좋아요를 반영하지 못했어요.');
  return { ...(state === undefined ? {} : { liked: state }), ...(denied ? { denied } : {}), ...(error ? { error } : {}) };
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
