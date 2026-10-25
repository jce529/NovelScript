'use server';

import { revalidatePath } from 'next/cache';
import { isAccountActive } from '@/lib/auth/account';
import { findActiveMcpConnection, revokeMcpConnectionInDatabase } from '@/lib/mcp/connections';
import { createClient } from '@/lib/supabase/server';

const settingsPath = '/studio/settings/mcp-connections';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DisconnectMcpConnectionResult =
  | { ok: true; status: 'disconnected' | 'already_disconnected'; message: string }
  | { ok: false; status: 'unauthorized' | 'forbidden' | 'invalid' | 'error' | 'partial'; message: string };

/** Rechecks the session because Server Actions can be called without visiting the settings page. */
export async function disconnectMcpConnectionAction(clientId: string): Promise<DisconnectMcpConnectionResult> {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, status: 'error', message: '연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }
  let userId: string;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, status: 'unauthorized', message: '다시 로그인해 주세요.' };
    userId = user.id;
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('role, deleted_at').eq('id', userId).maybeSingle();
    if (profileError || !profile || !isAccountActive(profile)) {
      return { ok: false, status: 'unauthorized', message: '다시 로그인해 주세요.' };
    }
    if (profile.role !== 'writer') {
      return { ok: false, status: 'forbidden', message: '작가 계정에서만 연결을 해제할 수 있어요.' };
    }
  } catch {
    return { ok: false, status: 'error', message: '연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }

  if (typeof clientId !== 'string' || !uuid.test(clientId)) {
    return { ok: false, status: 'invalid', message: '연결을 확인할 수 없어요.' };
  }

  const ownership = await findActiveMcpConnection(supabase, userId, clientId);
  if (ownership === 'error') {
    return { ok: false, status: 'error', message: '연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }
  if (ownership === 'missing') {
    return { ok: true, status: 'already_disconnected', message: '연결 상태를 확인했어요.' };
  }

  // The RPC only changes the current user's active row; a revoked row blocks the next MCP call.
  if (!(await revokeMcpConnectionInDatabase(supabase, clientId))) {
    return { ok: false, status: 'error', message: '연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
  }
  // OAuth cleanup follows the DB access-control change. Its failure never restores the row.
  let grantCleanupFailed = false;
  try {
    const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
    grantCleanupFailed = Boolean(error);
  } catch {
    grantCleanupFailed = true;
  }
  revalidatePath(settingsPath);
  if (grantCleanupFailed) {
    return { ok: false, status: 'partial', message: '연결은 해제됐어요. 외부 연결 정리를 완료하지 못했어요. 잠시 뒤 다시 확인해 주세요.' };
  }
  return { ok: true, status: 'disconnected', message: '연결을 해제했어요. 다음 호출부터 차단돼요.' };
}
