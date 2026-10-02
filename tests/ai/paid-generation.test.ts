import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));

import { GENERATION_LEASE_TTL_SECONDS, preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';
import { computeDebitAmount, computeMaxOutputTokens } from '@/lib/ai/cost';
import { GEMINI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/gemini/cost';

const OWNER = '10000000-0000-4000-8000-000000000001';
const KEY = '60000000-0000-4000-8000-000000000001';
const identity = { ownerId: OWNER, idempotencyKey: KEY, modelTier: 'lite' as const };
const session = (access: 'ok' | 'suspended' = 'ok') => ({
  rpc: async () => ({ data: access === 'ok'
    ? { can_write: true, reason: 'ok', sanctioned_until: null }
    : { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00+00:00' }, error: null }),
}) as unknown as SupabaseClient;

function setup(opts: FakeLedgerOptions) {
  const admin = createFakeLedgerAdmin(opts);
  adminState.client = admin.client;
  return admin;
}

beforeEach(() => vi.restoreAllMocks());

describe('paid generation lifecycle', () => {
  it('denies writes before reading the wallet', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const result = await preflightPaidGeneration(session('suspended'), identity);
    expect(result).toMatchObject({ ok: false, chatResult: { status: 'failed', failureKind: 'write_denied' } });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('returns already_processed for an existing ledger key', async () => {
    setup({ balances: { [OWNER]: 100 }, ledger: [{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY }] });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
  });

  it('caps a zero balance before generation', async () => {
    setup({ balances: { [OWNER]: 0 } });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toEqual({
      ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'insufficient_balance', error: CHAT_COPY.insufficient_balance, wasCapped: true, remainingBalance: 0 },
    });
  });

  it('does not debit a ProviderCallError', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const client = createMockProvider() as unknown as ProviderClient;
    const settled = await settlePaidGeneration(client, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => {
      throw new ProviderCallError({ provider: 'gemini', status: 429, kind: 'rate_limited', providerErrorCode: 'RESOURCE_EXHAUSTED' });
    });
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'rate_limited' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
  });

  it('settles the original result once with the supplied ledger reason', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const result = okResult('body', 10, 10);
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'document:1' }, async () => result);
    expect(settled).toMatchObject({ kind: 'completed', result });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toEqual([['apply_wallet_delta', expect.objectContaining({
      p_reference_type: 'ai_generation', p_reference_id: KEY, p_reason: 'document:1',
    })]]);
  });

  it('does not debit when the post-generation write check is denied', async () => {
    const admin = setup({ balances: { [OWNER]: 100 }, access: 'suspended' });
    const ctx = { admin: admin.client, walletBalance: 100, model: 'model', pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], maxOutputTokens: 1 };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, ctx, { ...identity, ledgerReason: 'test' }, async () => okResult());
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'write_denied' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
  });

  it('debits a structured refusal and returns it as terminal', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const refusal = { ...okResult(), refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const }, finishReason: 'refusal' as const };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => refusal);
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { status: 'refused', refusal: { reasonCode: 'SAFETY' } } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(1);
  });
  it.each([
    ['openai', 'gpt-4o-mini', 0.15, 0.60],
    ['anthropic', 'claude-sonnet-5', 2, 10],
  ] as const)('uses %s pricing for the output cap and actual debit', async (providerId, model, inputRate, outputRate) => {
    setup({ balances: { [OWNER]: 10 } });
    const selected = { ownerId: OWNER, idempotencyKey: KEY, providerId, model };
    const pre = await preflightPaidGeneration(session(), selected);
    if (!pre.ok) throw new Error('preflight failed');
    expect(pre.ctx.model).toBe(model);
    expect(pre.ctx.pricing).toEqual({ input: inputRate, output: outputRate });
    expect(pre.ctx.maxOutputTokens).toBe(computeMaxOutputTokens({ walletBalance: 10, pricing: pre.ctx.pricing }));
    const settled = await settlePaidGeneration(createMockProvider(), pre.ctx, { ...selected, ledgerReason: 'test' }, async () => okResult('body', 1000, 2000));
    expect(settled.kind).toBe('completed');
    if (settled.kind !== 'completed') throw new Error('settlement failed');
    expect(settled.debitAmount).toBe(computeDebitAmount({ pricing: pre.ctx.pricing, promptTokenCount: 1000, candidatesTokenCount: 2000 }));
    expect(settled.debitAmount).not.toBe(computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 1000, candidatesTokenCount: 2000 }));
  });
});

describe('wallet generation lease (BUG-06)', () => {
  it('acquires the lease after the ledger check and before reading the balance', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre.ok).toBe(true);
    const names = admin.rpc.mock.calls.map((c) => c[0]);
    expect(names).toContain('acquire_ai_generation_lock');
    expect(admin.state.locks[OWNER]).toBeTruthy();
    expect(admin.rpc.mock.calls.find((c) => c[0] === 'acquire_ai_generation_lock')![1]).toMatchObject({
      p_wallet_id: OWNER, p_ttl_seconds: GENERATION_LEASE_TTL_SECONDS,
    });
  });

  it('a recorded key is answered before the lease is touched', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 }, ledger: [{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY }] });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
    expect(admin.rpc.mock.calls.map((c) => c[0])).not.toContain('acquire_ai_generation_lock');
  });

  it('refuses a second preflight for the same wallet and releases on settle', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const first = await preflightPaidGeneration(session(), identity);
    if (!first.ok) throw new Error('expected first preflight to pass');
    const second = await preflightPaidGeneration(session(), { ...identity, idempotencyKey: '60000000-0000-4000-8000-000000000002' });
    expect(second).toEqual({ ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'generation_in_progress', error: CHAT_COPY.generation_in_progress } });
    await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, first.ctx, { ...identity, ledgerReason: 'test' }, async () => okResult());
    expect(admin.state.locks).toEqual({});
    expect((await preflightPaidGeneration(session(), { ...identity, idempotencyKey: '60000000-0000-4000-8000-000000000002' })).ok).toBe(true);
  });

  it('release is idempotent and only releases its own lease', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('expected preflight to pass');
    await pre.ctx.release!();
    await pre.ctx.release!();
    expect(admin.rpc.mock.calls.filter((c) => c[0] === 'release_ai_generation_lock')).toHaveLength(1);
  });

  it('releases the lease when the balance cannot cover a generation', async () => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { failureKind: 'insufficient_balance' } });
    expect(admin.state.locks).toEqual({});
  });

  it('releases the lease when the wallet is missing', async () => {
    const admin = setup({ balances: {} });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { failureKind: 'unknown' } });
    expect(admin.state.locks).toEqual({});
  });

  it('fails closed when the lease RPC errors', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 }, lock: 'rpc' });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { failureKind: 'unavailable' } });
    expect(admin.from.mock.calls.map((c) => c[0])).not.toContain('wallets');
  });

  it('settle releases even when the generate callback throws unexpectedly', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('expected preflight to pass');
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => { throw new Error('boom'); });
    expect(settled.kind).toBe('terminal');
    expect(admin.state.locks).toEqual({});
  });
});
