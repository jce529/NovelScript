// Client-safe top-up contract. Bundles, prices and tokens live in the
// operator-managed public.payment_topup_tiers table and are read only on the
// server (lib/payments/catalog.ts). Nothing here may import DB/server modules.

export type TopupTierId = string;

export type TopupTier = {
  id: TopupTierId;
  tokens: number;
  priceKrw: number;
  /** Limited-time label; null outside its display window. */
  label: string | null;
};

export const TOPUP_REFERENCE_TYPE = 'toss_topup' as const;

export const TOPUP_TIER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * FORMAT check only (1-64 chars of A-Z a-z 0-9 _ -, mirroring the DB CHECK).
 * It does NOT mean the bundle exists or is on sale — use catalog.getTopupTier.
 */
export function isTopupTierId(value: unknown): value is TopupTierId {
  return typeof value === 'string' && TOPUP_TIER_ID_PATTERN.test(value);
}

export function generateOrderId(): string {
  return `ns_${crypto.randomUUID()}`;
}
