import { describe, expect, it } from 'vitest';
import {
  getTopupTier,
  generateOrderId,
  isTopupTierId,
  TOPUP_REFERENCE_TYPE,
  TOPUP_TIERS,
} from '../../lib/payments/tiers';

describe('top-up tiers', () => {
  it('defines the four fixed server-authoritative products in order', () => {
    expect(TOPUP_TIERS).toEqual([
      { id: 't100', tokens: 100, priceKrw: 1000 },
      { id: 't300', tokens: 300, priceKrw: 2850 },
      { id: 't550', tokens: 550, priceKrw: 5000 },
      { id: 't1000', tokens: 1000, priceKrw: 9000 },
    ]);
    expect(Object.isFrozen(TOPUP_TIERS)).toBe(true);
    expect(TOPUP_TIERS.every((tier) => Object.isFrozen(tier))).toBe(true);
  });

  it('validates literal tier IDs and resolves known tiers', () => {
    expect(isTopupTierId('t550')).toBe(true);
    expect(isTopupTierId('t999')).toBe(false);
    expect(getTopupTier('t300')).toEqual({ id: 't300', tokens: 300, priceKrw: 2850 });
    expect(getTopupTier('t999')).toBeUndefined();
  });

  it('generates unique Toss-compatible order IDs', () => {
    const ids = Array.from({ length: 100 }, generateOrderId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{6,64}$/.test(id))).toBe(true);
    expect(ids.every((id) => id.startsWith('ns_'))).toBe(true);
  });

  it('uses the stable ledger reference type', () => {
    expect(TOPUP_REFERENCE_TYPE).toBe('toss_topup');
  });
});
