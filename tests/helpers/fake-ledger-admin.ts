import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * In-memory wallets + ledger_entries + ai_usage.
 *
 * - apply_wallet_delta follows supabase/migrations/0001_init.sql order exactly: balance check
 *   (raise) BEFORE the ON CONFLICT (wallet_id, reference_type, reference_id) DO NOTHING insert.
 * - settle_service_ai_generation follows 0030 (11-09): wallet lock, duplicate checks (settled or
 *   BYOK usage row, then legacy ai_generation ledger row) BEFORE any balance check, usage upsert,
 *   debit only when the amount is positive, then service_settled_at — all-or-nothing.
 * RPC bodies are synchronous inside the async function, so JS turn ordering acts as the row lock.
 */

export interface FakeLedgerRow {
  wallet_id: string;
  reference_type: string;
  reference_id: string;
  delta?: number;
}

export interface FakeUsageRow {
  owner_id: string;
  idempotency_key: string;
  key_source: 'service' | 'byok';
  status?: 'completed' | 'refused';
  provider?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  thoughts_tokens?: number;
  input_reported?: boolean;
  output_reported?: boolean;
  work_id?: string | null;
  chapter_id?: string | null;
  /** NULL means "not proven complete" (telemetry only). */
  service_settled_at: string | null;
}

export interface FakeState {
  balances: Record<string, number>;
  ledger: FakeLedgerRow[];
  usage: FakeUsageRow[];
  locks: Record<string, string>;
}

type LookupErrorSpec = boolean | 'second' | number[];

export interface FakeLedgerOptions {
  balances: Record<string, number>;
  ledger?: FakeLedgerRow[];
  usage?: FakeUsageRow[];
  access?: 'ok' | 'suspended';
  /** true: every ledger lookup errors; 'second': every lookup after the first errors;
   * number[]: only these 1-based lookup indices error. */
  ledgerLookupError?: LookupErrorSpec;
  /** Same shape as ledgerLookupError, for ai_usage completion lookups. */
  usageLookupError?: LookupErrorSpec;
  /** true: ai_usage INSERT (best-effort telemetry) returns a non-unique error. */
  usageInsertError?: boolean;
  debitError?: 'rpc' | 'throw';
  /** settle_service_ai_generation fails BEFORE commit (nothing changes). */
  settleError?: 'rpc' | 'throw';
  /** settle_service_ai_generation COMMITS, then the response is lost (error result or throw). */
  settleLostResponse?: 'rpc' | 'throw';
  /** settle_service_ai_generation commits but answers with a malformed payload. */
  settleMalformed?: boolean;
  /** Wallet generation lease (BUG-06). 'busy': another holder owns it; 'rpc'/'throw': acquire fails. */
  lock?: 'busy' | 'rpc' | 'throw';
  /** true: release_ai_generation_lock returns an error. */
  releaseError?: boolean;
  /** Runs synchronously at the start of apply_wallet_delta (e.g. a racing request inserts a row). */
  beforeDebit?: (state: FakeState) => void;
  /** Runs synchronously at the start of settle_service_ai_generation (racing settlement). */
  beforeSettlement?: (state: FakeState) => void;
  /** Runs synchronously at the start of acquire_ai_generation_lock (a racing request finished). */
  beforeAcquire?: (state: FakeState) => void;
}

const ACCESS = {
  ok: { can_write: true, reason: 'ok', sanctioned_until: null },
  suspended: { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00+00:00' },
};

function failsAt(spec: LookupErrorSpec | undefined, n: number): boolean {
  return spec === true || (spec === 'second' && n > 1) || (Array.isArray(spec) && spec.includes(n));
}

export function createFakeLedgerAdmin(opts: FakeLedgerOptions) {
  const state: FakeState = {
    balances: { ...opts.balances }, ledger: [...(opts.ledger ?? [])],
    usage: (opts.usage ?? []).map((row) => ({ ...row })),
    /** wallet_id -> owner token of the live lease (mirrors ai_generation_locks, no expiry modelled). */
    locks: {},
  };
  let ledgerLookups = 0;
  let usageLookups = 0;

  const findUsage = (owner: unknown, key: unknown) =>
    state.usage.find((r) => r.owner_id === owner && r.idempotency_key === key);
  const hasLegacyLedger = (owner: unknown, key: unknown) =>
    state.ledger.some((r) => r.wallet_id === owner && r.reference_type === 'ai_generation' && r.reference_id === key);

  function settleService(p: Record<string, unknown>) {
    const owner = p.p_owner_id as string;
    const key = p.p_idempotency_key as string;
    const debit = p.p_debit_amount as number;
    const usage = (p.p_usage ?? {}) as Record<string, unknown>;
    if (typeof key !== 'string' || key.length < 1 || key.length > 200) return { kind: 'error' as const, message: 'invalid settlement arguments' };
    if (typeof debit !== 'number' || !Number.isInteger(debit) || debit < 0) return { kind: 'error' as const, message: 'invalid debit amount' };
    if (!(owner in state.balances)) return { kind: 'error' as const, message: 'wallet not found' };
    const balance = state.balances[owner];
    const row = findUsage(owner, key);
    if (row && (row.key_source === 'byok' || row.service_settled_at !== null)) {
      return { kind: 'ok' as const, data: { kind: 'already_processed', remainingBalance: balance } };
    }
    if (hasLegacyLedger(owner, key)) return { kind: 'ok' as const, data: { kind: 'already_processed', remainingBalance: balance } };
    const allowed = ['provider', 'model', 'status', 'input_tokens', 'output_tokens', 'thoughts_tokens', 'input_reported', 'output_reported', 'work_id', 'chapter_id'];
    if (Object.keys(usage).some((k) => !allowed.includes(k))) return { kind: 'error' as const, message: 'unsupported usage field' };
    if (usage.status !== 'completed' && usage.status !== 'refused') return { kind: 'error' as const, message: 'invalid status' };
    if (usage.status === 'refused' && !usage.input_reported && !usage.output_reported) {
      return { kind: 'error' as const, message: 'refused usage requires reported tokens' };
    }
    let next = balance;
    if (debit > 0) {
      next = balance - debit;
      if (next < 0) return { kind: 'error' as const, message: 'insufficient balance' };
    }
    // Commit: usage upsert, positive debit, completion marker — together.
    const settledAt = new Date().toISOString();
    const values: FakeUsageRow = {
      owner_id: owner, idempotency_key: key, key_source: 'service',
      status: usage.status as 'completed' | 'refused', provider: usage.provider as string, model: usage.model as string,
      input_tokens: (usage.input_tokens as number) ?? 0, output_tokens: (usage.output_tokens as number) ?? 0,
      thoughts_tokens: (usage.thoughts_tokens as number) ?? 0,
      input_reported: Boolean(usage.input_reported), output_reported: Boolean(usage.output_reported),
      work_id: (usage.work_id as string | null) ?? null, chapter_id: (usage.chapter_id as string | null) ?? null,
      service_settled_at: settledAt,
    };
    if (row) Object.assign(row, values); else state.usage.push(values);
    if (debit > 0) {
      state.ledger.push({ wallet_id: owner, reference_type: 'ai_generation', reference_id: key, delta: -debit });
      state.balances[owner] = next;
    }
    return { kind: 'ok' as const, data: { kind: 'settled', remainingBalance: next, debitAmount: debit } };
  }

  const rpc = vi.fn(async (name: string, p: Record<string, unknown> = {}) => {
    if (name === 'get_write_access') {
      return { data: ACCESS[opts.access ?? 'ok'], error: null };
    }
    if (name === 'acquire_ai_generation_lock') {
      opts.beforeAcquire?.(state);
      if (opts.lock === 'throw') throw new Error('fetch failed');
      if (opts.lock === 'rpc') return { data: null, error: { message: 'lock rpc failed' } };
      const walletId = p.p_wallet_id as string;
      if (opts.lock === 'busy' || walletId in state.locks) return { data: false, error: null };
      state.locks[walletId] = p.p_owner_token as string;
      return { data: true, error: null };
    }
    if (name === 'release_ai_generation_lock') {
      if (opts.releaseError) return { data: null, error: { message: 'release failed' } };
      const walletId = p.p_wallet_id as string;
      if (state.locks[walletId] === p.p_owner_token) { delete state.locks[walletId]; return { data: true, error: null }; }
      return { data: false, error: null };
    }
    if (name === 'settle_service_ai_generation') {
      opts.beforeSettlement?.(state);
      if (opts.settleError === 'throw') throw new Error('fetch failed');
      if (opts.settleError === 'rpc') return { data: null, error: { message: 'insufficient balance' } };
      const outcome = settleService(p);
      if (outcome.kind === 'error') return { data: null, error: { message: outcome.message } };
      if (opts.settleLostResponse === 'throw') throw new Error('fetch failed');
      if (opts.settleLostResponse === 'rpc') return { data: null, error: { message: 'upstream timeout' } };
      if (opts.settleMalformed) return { data: { kind: 'weird' }, error: null };
      return { data: outcome.data, error: null };
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
      insert: async (values: Record<string, unknown>) => {
        if (table !== 'ai_usage') return { data: null, error: { message: `unsupported insert ${table}` } };
        if (opts.usageInsertError) return { data: null, error: { message: 'usage insert failed' } };
        if (findUsage(values.owner_id, values.idempotency_key)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        state.usage.push({ ...(values as unknown as FakeUsageRow), service_settled_at: null });
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'wallets') {
          const id = filters.id as string;
          return { data: id in state.balances ? { balance: state.balances[id] } : null, error: null };
        }
        if (table === 'ledger_entries') {
          ledgerLookups += 1;
          if (failsAt(opts.ledgerLookupError, ledgerLookups)) return { data: null, error: { message: 'DB-SENTINEL' } };
          const idx = state.ledger.findIndex(r =>
            Object.entries(filters).every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
          return { data: idx >= 0 ? { id: `ledger-${idx}` } : null, error: null };
        }
        if (table === 'ai_usage') {
          usageLookups += 1;
          if (failsAt(opts.usageLookupError, usageLookups)) return { data: null, error: { message: 'DB-SENTINEL' } };
          const row = findUsage(filters.owner_id, filters.idempotency_key);
          return { data: row ? { key_source: row.key_source, service_settled_at: row.service_settled_at } : null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  });

  const client = { rpc, from } as unknown as SupabaseClient;
  return { client, state, rpc, from };
}
