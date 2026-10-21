import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { isTopupTierId, type TopupTier } from './tiers';

// Server-only source of truth for top-up bundles (public.payment_topup_tiers,
// service_role only). Read fresh on every call: no long-lived cache and no
// hardcoded fallback prices — a DB error is an error, not "use the old list".

const COLUMNS = 'id,tokens,price_krw,is_active,sort_order,starts_at,ends_at,label,label_starts_at,label_ends_at';

type TierRow = {
  id: string;
  tokens: number | string;
  price_krw: number | string;
  is_active: boolean;
  sort_order: number | null;
  starts_at: string | null;
  ends_at: string | null;
  label: string | null;
  label_starts_at: string | null;
  label_ends_at: string | null;
};

function within(nowMs: number, startsAt: string | null, endsAt: string | null): boolean {
  if (startsAt !== null && Date.parse(startsAt) > nowMs) return false;
  if (endsAt !== null && Date.parse(endsAt) <= nowMs) return false;
  return true;
}

function positiveSafeInteger(value: number | string, field: string): number {
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw new Error(`Invalid top-up tier ${field}`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid top-up tier ${field}`);
  return n;
}

function isOnSale(row: TierRow, nowMs: number): boolean {
  return row.is_active === true && within(nowMs, row.starts_at, row.ends_at);
}

function toDto(row: TierRow, nowMs: number): TopupTier {
  if (!isTopupTierId(row.id)) throw new Error('Invalid top-up tier id');
  const label = row.label?.trim() ? row.label.trim() : null;
  return {
    id: row.id,
    tokens: positiveSafeInteger(row.tokens, 'tokens'),
    priceKrw: positiveSafeInteger(row.price_krw, 'price'),
    label: label && within(nowMs, row.label_starts_at, row.label_ends_at) ? label : null,
  };
}

/** Bundles currently on sale (active and inside the sale window), stably ordered. */
export async function listTopupTiers(): Promise<TopupTier[]> {
  const { data, error } = await createAdminClient()
    .from('payment_topup_tiers')
    .select(COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error || !data) throw new Error('Unable to load top-up tiers');

  const nowMs = Date.now();
  return (data as TierRow[])
    .filter((row) => isOnSale(row, nowMs))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => toDto(row, nowMs));
}

/**
 * The bundle with this ID if it exists AND is on sale right now; otherwise
 * undefined. Throws on DB errors so callers never fall back to stale prices.
 */
export async function getTopupTier(id: string): Promise<TopupTier | undefined> {
  if (!isTopupTierId(id)) return undefined;
  const { data, error } = await createAdminClient()
    .from('payment_topup_tiers')
    .select(COLUMNS)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error('Unable to load top-up tier');
  if (!data) return undefined;

  const nowMs = Date.now();
  const row = data as TierRow;
  return isOnSale(row, nowMs) ? toDto(row, nowMs) : undefined;
}
