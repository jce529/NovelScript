export const TOPUP_TIERS = Object.freeze([
  Object.freeze({ id: 't100', tokens: 100, priceKrw: 1_000 }),
  Object.freeze({ id: 't300', tokens: 300, priceKrw: 2_850 }),
  Object.freeze({ id: 't550', tokens: 550, priceKrw: 5_000 }),
  Object.freeze({ id: 't1000', tokens: 1_000, priceKrw: 9_000 }),
] as const);

export type TopupTierId = (typeof TOPUP_TIERS)[number]['id'];
export type TopupTier = (typeof TOPUP_TIERS)[number];

export const TOPUP_REFERENCE_TYPE = 'toss_topup' as const;

export function isTopupTierId(value: unknown): value is TopupTierId {
  return typeof value === 'string' && TOPUP_TIERS.some((tier) => tier.id === value);
}

export function getTopupTier(tierId: unknown): TopupTier | undefined {
  if (!isTopupTierId(tierId)) return undefined;
  return TOPUP_TIERS.find((tier) => tier.id === tierId);
}

export function generateOrderId(): string {
  return `ns_${crypto.randomUUID()}`;
}
