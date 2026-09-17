import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * In-memory wallets + ledger_entries with an apply_wallet_delta emulation that follows
 * supabase/migrations/0001_init.sql order exactly: balance check (raise) BEFORE the
 * ON CONFLICT (wallet_id, reference_type, reference_id) DO NOTHING insert. The RPC body is
 * synchronous inside the async function, so JS turn ordering acts as the row lock.
 */

export interface FakeLedgerRow {
  wallet_id: string;
  reference_type: string;
  reference_id: string;
  delta?: number;
}

export interface FakeLedgerOptions {
  balances: Record<string, number>;
  ledger?: FakeLedgerRow[];
  access?: 'ok' | 'suspended';
  /** true: every ledger lookup errors; 'second': every lookup after the first errors;
   * number[]: only these 1-based lookup indices error. */
  ledgerLookupError?: boolean | 'second' | number[];
  debitError?: 'rpc' | 'throw';
  /** Runs synchronously at the start of apply_wallet_delta (e.g. a racing request inserts a row). */
  beforeDebit?: (state: { balances: Record<string, number>; ledger: FakeLedgerRow[] }) => void;
}

const ACCESS = {
  ok: { can_write: true, reason: 'ok', sanctioned_until: null },
  suspended: { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00+00:00' },
};

export function createFakeLedgerAdmin(opts: FakeLedgerOptions) {
  const state = { balances: { ...opts.balances }, ledger: [...(opts.ledger ?? [])] };
  let lookups = 0;

  const rpc = vi.fn(async (name: string, p: Record<string, unknown> = {}) => {
    if (name === 'get_write_access') {
      return { data: ACCESS[opts.access ?? 'ok'], error: null };
    }
    if (name === 'apply_wallet_delta') {
      opts.beforeDebit?.(state);
      if (opts.debitError === 'throw') throw new Error('fetch failed');
      if (opts.debitError === 'rpc') return { data: null, error: { message: 'insufficient balance' } };
      const walletId = p.p_wallet_id as string;
      const delta = p.p_delta as number;
      if (!(walletId in state.balances)) return { data: null, error: { message: 'wallet not found' } };
      const balance = state.balances[walletId];
      const next = balance + delta;
      if (next < 0) return { data: null, error: { message: 'insufficient balance' } };
      const exists = state.ledger.some(r =>
        r.wallet_id === walletId && r.reference_type === p.p_reference_type && r.reference_id === p.p_reference_id);
      if (exists) return { data: balance, error: null };
      state.ledger.push({
        wallet_id: walletId, reference_type: p.p_reference_type as string, reference_id: p.p_reference_id as string, delta,
      });
      state.balances[walletId] = next;
      return { data: next, error: null };
    }
    return { data: null, error: { message: `unknown rpc ${name}` } };
  });

  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (col: string, value: unknown) => { filters[col] = value; return chain; },
      maybeSingle: async () => {
        if (table === 'wallets') {
          const id = filters.id as string;
          return { data: id in state.balances ? { balance: state.balances[id] } : null, error: null };
        }
        if (table === 'ledger_entries') {
          lookups += 1;
          const err = opts.ledgerLookupError;
          const fail = err === true || (err === 'second' && lookups > 1) || (Array.isArray(err) && err.includes(lookups));
          if (fail) return { data: null, error: { message: 'DB-SENTINEL' } };
          const idx = state.ledger.findIndex(r =>
            Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
          return { data: idx >= 0 ? { id: `ledger-${idx}` } : null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  });

  const client = { rpc, from } as unknown as SupabaseClient;
  return { client, state, rpc, from };
}
