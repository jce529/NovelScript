import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as tiers from '../../lib/payments/tiers';
import { generateOrderId, isTopupTierId, TOPUP_REFERENCE_TYPE } from '../../lib/payments/tiers';

const migration = readFileSync('supabase/migrations/0027_payment_topup_tiers.sql', 'utf8');

describe('top-up tier contract (client-safe)', () => {
  it('checks the bounded ID format only, not fixed membership', () => {
    for (const id of ['t100', 't550', 't999', 'evt_2026-autumn', 'a', 'x'.repeat(64)]) {
      expect(isTopupTierId(id)).toBe(true);
    }
    for (const id of ['', 'x'.repeat(65), 't 100', 't100;drop', '한글', '../t100', null, 100, undefined]) {
      expect(isTopupTierId(id)).toBe(false);
    }
  });

  it('no longer exports a hardcoded price list or a sync tier lookup', () => {
    expect(Object.keys(tiers)).not.toContain('TOPUP_TIERS');
    expect(Object.keys(tiers)).not.toContain('getTopupTier');
  });

  it('does not import server/DB modules from the shared module', () => {
    const source = readFileSync('lib/payments/tiers.ts', 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
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

describe('0027 migration fixture', () => {
  it('seeds exactly the former four bundles in order', () => {
    const seed = migration.match(/insert into public\.payment_topup_tiers \(id, tokens, price_krw, sort_order\) values([\s\S]*?);/);
    expect(seed).not.toBeNull();
    const rows = [...seed![1].matchAll(/\('([^']+)', (\d+), (\d+), (\d+)\)/g)].map(([, id, tokens, price, sort]) => ({
      id, tokens: Number(tokens), priceKrw: Number(price), sort: Number(sort),
    }));
    expect(rows.map(({ id, tokens, priceKrw }) => ({ id, tokens, priceKrw }))).toEqual([
      { id: 't100', tokens: 100, priceKrw: 1000 },
      { id: 't300', tokens: 300, priceKrw: 2850 },
      { id: 't550', tokens: 550, priceKrw: 5000 },
      { id: 't1000', tokens: 1000, priceKrw: 9000 },
    ]);
    const sorts = rows.map((row) => row.sort);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
  });

  it('swaps the fixed tier CHECK for a restrictive FK without rewriting order snapshots', () => {
    expect(migration).toMatch(/drop constraint/);
    expect(migration).toMatch(/foreign key \(tier_id\) references public\.payment_topup_tiers\(id\)\s+on delete restrict on update restrict/);
    expect(migration).not.toMatch(/update public\.payment_orders/i);
    expect(migration).not.toMatch(/profiles/);
  });

  it('locks the table to service_role with RLS and explicit revokes', () => {
    expect(migration).toMatch(/alter table public\.payment_topup_tiers enable row level security/);
    expect(migration).toMatch(/revoke all on public\.payment_topup_tiers from public, anon, authenticated/);
    expect(migration).toMatch(/grant select, insert, update, delete on public\.payment_topup_tiers to service_role/);
    expect(migration).not.toMatch(/to (anon|authenticated)/);
    expect(migration).toMatch(/notify pgrst, 'reload schema'/);
  });
});
