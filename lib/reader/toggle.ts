import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkWriteAccess, isWriteAccessDbError, WRITE_FORBIDDEN_MESSAGE,
  type ToggleDenial,
} from '../auth/write-access';

export interface ToggleResult {
  /** DB-reported state after the toggle (true = row exists). Absent when it could not be determined. */
  state?: boolean;
  denied?: ToggleDenial;
  /** Safe, user-facing failure message. Never contains DB details. */
  error?: string;
}

type ToggleTable = 'work_likes' | 'work_bookmarks' | 'work_subscriptions';

/**
 * Atomic toggle (BUG-02). The flip happens in a single `toggle_<table>` RPC
 * (supabase/migrations/0019_reader_atomic_toggle.sql) that serializes per (work, user), so two
 * concurrent toggles always end in opposite states. The RPC derives the user from auth.uid().
 * Success state comes only from the RPC's return value; any error or malformed payload is
 * reported as a failure instead of being guessed (BUG-01).
 */
export async function toggleRow(
  supabase: SupabaseClient,
  table: ToggleTable,
  { workId, userId }: { workId: string; userId: string },
  failureMessage: string
): Promise<ToggleResult> {
  // D-07: checked before the write so a suspended user cannot toggle in either direction.
  const access = await checkWriteAccess(supabase, userId);
  if (!access.ok) {
    const { data, error } = await supabase
      .from(table).select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
    return {
      denied: { error: access.error, code: access.code },
      ...(error ? {} : { state: Boolean(data) }),
    };
  }
  try {
    const { data, error } = await supabase.rpc(`toggle_${table}`, { p_work_id: workId });
    if (error) {
      if (isWriteAccessDbError(error.message)) {
        return { denied: { error: WRITE_FORBIDDEN_MESSAGE, code: 'write_forbidden' } };
      }
      return { error: failureMessage };
    }
    if (typeof data !== 'boolean') return { error: failureMessage };
    return { state: data };
  } catch {
    return { error: failureMessage };
  }
}

/** Read-only state lookup shared by the get*State helpers. */
export async function readRowState(
  supabase: SupabaseClient,
  table: ToggleTable,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from(table).select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}
