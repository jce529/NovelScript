import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_GENERATION_REFERENCE_TYPE } from '@/lib/ai/paid-generation';

export type AiWalletStatus =
  | { ok: true; balance: number; recentDebit: number }
  | { ok: false; error: string };

export const WALLET_STATUS_READ_FAILED = '지갑 잔액을 불러오지 못했어요.';

/** bigint columns may arrive as number or string; anything that is not a nonnegative safe integer is a read failure. */
function toTokenCount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^-?\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

const FAILED: AiWalletStatus = { ok: false, error: WALLET_STATUS_READ_FAILED };

/**
 * Read-only wallet view for the AI panel gauge: the owner's balance plus the single most recent
 * REAL service AI debit (negative `ai_generation` ledger row, in wallet tokens — not cost).
 * Zero-cost markers, top-ups and paid-reading debits are excluded by the reference_type/delta filters.
 * Uses the caller's RLS-scoped client (wallets_select_own / ledger_entries_select_own); never the admin client.
 */
export async function getAiWalletStatus(supabase: SupabaseClient, ownerId: string): Promise<AiWalletStatus> {
  if (typeof ownerId !== 'string' || ownerId.length === 0) return FAILED;
  try {
    const [wallet, ledger] = await Promise.all([
      supabase.from('wallets').select('id, balance').eq('id', ownerId).maybeSingle(),
      supabase
        .from('ledger_entries')
        .select('id, delta')
        .eq('wallet_id', ownerId)
        .eq('reference_type', AI_GENERATION_REFERENCE_TYPE)
        .lt('delta', 0)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1),
    ]);
    if (wallet.error || ledger.error || !wallet.data || wallet.data.id !== ownerId) return FAILED;
    const balance = toTokenCount(wallet.data.balance);
    if (balance === null) return FAILED;
    const rows = (ledger.data ?? []) as { delta: unknown }[];
    let recentDebit = 0;
    if (rows.length > 0) {
      const raw = rows[0].delta;
      // delta is negative by the query filter; the debit is its magnitude.
      const negated = typeof raw === 'string' ? raw.trim().replace(/^-/, '') : typeof raw === 'number' ? -raw : null;
      const debit = toTokenCount(negated);
      if (debit === null) return FAILED;
      recentDebit = debit;
    }
    return { ok: true, balance, recentDebit };
  } catch {
    return FAILED;
  }
}
