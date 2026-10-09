import type { SupabaseClient } from '@supabase/supabase-js';

/** D-08 + BUG-01: 지갑·원장·작품은 건드리지 않는다(append-only). 대신 개인정보(필명·소개),
 * BYOK 키, 소셜 연결을 DB 함수 한 번으로 정리하고(`purge_account_data`, 멱등),
 * auth 사용자를 soft delete해 이메일을 익명화한다. 그러면 같은 소셜 계정으로 다시
 * 로그인할 때 새 계정으로 가입된다. 어느 단계든 실패하면 던지므로 같은 요청을 다시
 * 실행해 이어서 끝낼 수 있다(탈퇴 요청은 세션이 살아 있는 동안 반복 가능). */
export async function softDeleteAccount(admin: SupabaseClient, userId: string) {
  const { error: purgeError } = await admin.rpc('purge_account_data', { p_owner: userId });
  if (purgeError) throw purgeError;

  const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
  // 이미 soft delete된 사용자를 다시 처리하는 재시도는 오류로 보지 않는다.
  if (authError && authError.status !== 404 && !/not.?found/i.test(authError.message)) throw authError;
}

export interface ProfileActiveCheck {
  deleted_at: string | null;
}

/** Gate for the DAL/session-check path: a soft-deleted account must be treated as
 * logged out even if its access token JWT has not yet expired. */
export function isAccountActive(profile: ProfileActiveCheck): boolean {
  return profile.deleted_at === null;
}
