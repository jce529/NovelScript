import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * D-07 write guard (07-03). Suspension blocks user-initiated writes but never reads, so this is
 * deliberately separate from `isAccountActive` (lib/auth/account.ts), which only models soft
 * deletion and gates the session itself.
 *
 * The decision is made by the `get_write_access` database function using DB `now()`
 * (supabase/migrations/0008_sanction_enforcement.sql), never by comparing timestamps here:
 * - With a session client the function only answers for `auth.uid()`; asking about another
 *   user returns `forbidden`, so a forged `userId` fails closed.
 * - With the service-role client it answers for the session-derived `userId` the Server Action
 *   passed in (AI generation uses this to re-check just before charging).
 * Any lookup failure or unexpected payload denies the write (fail closed). Reads never call this.
 */

export type WriteDenialCode = 'write_suspended' | 'write_forbidden' | 'write_unavailable';

export const WRITE_SUSPENDED_MESSAGE =
  '계정 이용이 제한되어 이 작업을 할 수 없어요. 기존 작품과 구매한 회차는 계속 볼 수 있어요.';
export const WRITE_FORBIDDEN_MESSAGE = '이 작업을 할 수 있는 계정이 아니에요. 다시 로그인해주세요.';
export const WRITE_UNAVAILABLE_MESSAGE = '지금은 이 작업을 처리할 수 없어요. 잠시 후 다시 시도해주세요.';

export type WriteAccessResult =
  | { ok: true }
  | {
      ok: false;
      code: WriteDenialCode;
      error: string;
      permanent: boolean;
      /** ISO timestamp for a timed suspension; null for permanent or non-suspension denials. */
      sanctionedUntil: string | null;
    };

export class WriteAccessDenied extends Error {
  constructor(readonly denial: Extract<WriteAccessResult, { ok: false }>) {
    super(denial.code);
    this.name = 'WriteAccessDenied';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function deny(code: WriteDenialCode, extra: { permanent?: boolean; sanctionedUntil?: string | null } = {}) {
  const error = code === 'write_suspended' ? WRITE_SUSPENDED_MESSAGE
    : code === 'write_forbidden' ? WRITE_FORBIDDEN_MESSAGE : WRITE_UNAVAILABLE_MESSAGE;
  return {
    ok: false as const, code, error,
    permanent: extra.permanent ?? false,
    sanctionedUntil: extra.sanctionedUntil ?? null,
  };
}

export async function checkWriteAccess(supabase: SupabaseClient, userId: string): Promise<WriteAccessResult> {
  if (typeof userId !== 'string' || !UUID.test(userId)) return deny('write_forbidden');
  let data: unknown;
  try {
    const response = await supabase.rpc('get_write_access', { p_user_id: userId });
    if (response.error) return deny('write_unavailable');
    data = response.data;
  } catch {
    return deny('write_unavailable');
  }
  if (!data || typeof data !== 'object') return deny('write_unavailable');
  const row = data as { can_write?: unknown; reason?: unknown; sanctioned_until?: unknown };

  if (row.can_write === true && row.reason === 'ok') return { ok: true };
  switch (row.reason) {
    case 'suspended':
      return deny('write_suspended', {
        sanctionedUntil: typeof row.sanctioned_until === 'string' ? new Date(row.sanctioned_until).toISOString() : null,
      });
    case 'permanent_suspension':
      return deny('write_suspended', { permanent: true });
    case 'forbidden':
    case 'not_found':
      return deny('write_forbidden');
    default:
      return deny('write_unavailable');
  }
}

/** Throwing variant for call sites that have no result object to return. */
export async function assertCanWrite(supabase: SupabaseClient, userId: string): Promise<void> {
  const access = await checkWriteAccess(supabase, userId);
  if (!access.ok) throw new WriteAccessDenied(access);
}

/** Returned alongside the unchanged state when a reader toggle is refused. */
export interface ToggleDenial { error: string; code: WriteDenialCode }

/** Safe denial payload for `{ ok, error }`-shaped mutation results. Never includes DB details. */
export function writeDenial(access: Extract<WriteAccessResult, { ok: false }>) {
  return { ok: false as const, error: access.error, code: access.code };
}

/** Maps the DB-side `write_access_denied` exception (RPCs) to the same safe message. */
export function isWriteAccessDbError(message: string | undefined | null): boolean {
  return Boolean(message && message.includes('write_access_denied'));
}
