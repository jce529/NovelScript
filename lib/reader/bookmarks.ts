import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToggleDenial } from '../auth/write-access';
import { toggleRow } from './toggle';

/** READ-08/D-19: toggleable, login-gated, distinct from work_likes/D-08. Atomic via DB RPC (BUG-02). */
export async function toggleBookmark(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ bookmarked?: boolean; denied?: ToggleDenial; error?: string }> {
  const { state, denied, error } = await toggleRow(supabase, 'work_bookmarks', { workId, userId }, '선호작 설정을 변경하지 못했어요.');
  return { ...(state === undefined ? {} : { bookmarked: state }), ...(denied ? { denied } : {}), ...(error ? { error } : {}) };
}

export async function getBookmarkState(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('work_bookmarks').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}
