'use server';

import { createClient } from '@/lib/supabase/server';
import { getAiWalletStatus, WALLET_STATUS_READ_FAILED, type AiWalletStatus } from '@/lib/ai/wallet-status';

/** Session-bound: the owner is always the signed-in user, never a client-supplied id. */
export async function loadAiWalletStatusAction(): Promise<AiWalletStatus> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: '로그인이 필요해요.' };
    return await getAiWalletStatus(supabase, user.id);
  } catch {
    return { ok: false, error: WALLET_STATUS_READ_FAILED };
  }
}
