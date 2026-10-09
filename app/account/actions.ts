'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { softDeleteAccount } from '@/lib/auth/account';

export type DeleteAccountResult = { ok: boolean; message?: string };

const FAILURE_MESSAGE = '탈퇴를 끝내지 못했어요. 잠시 뒤 다시 시도해 주세요.';

/** 탈퇴가 모두 끝나면 `ok: true`를 돌려주고, 이동은 클라이언트가 맡는다. 중간에 실패하면
 * 세션을 유지한 채 오류를 돌려주므로 같은 버튼으로 이어서 다시 시도할 수 있다. */
export async function deleteAccountAction(): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: true };

  try {
    await softDeleteAccount(createAdminClient(), user.id);
  } catch {
    return { ok: false, message: FAILURE_MESSAGE };
  }
  await supabase.auth.signOut().catch(() => {});
  return { ok: true };
}
