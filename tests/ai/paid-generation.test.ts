import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
const usageState = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: usageState.record }));

import { GENERATION_LEASE_TTL_SECONDS, preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import { GenerationRejectedError } from '@/lib/ai/generation-rejected';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';
import { BYOK_MAX_OUTPUT_TOKENS, PER_REQUEST_MAX_OUTPUT_TOKENS, computeDebitAmount, computeMaxOutputTokens } from '@/lib/ai/cost';
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

beforeEach(() => {
  vi.restoreAllMocks();
  usageState.record.mockReset().mockResolvedValue({ ok: true, recorded: true });
});

describe('paid generation lifecycle', () => {
  it('runs trusted BYOK at its fixed cap without touching wallet or ledger', async () => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    const route = { kind: 'byok' as const, selection: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'byok' as const }, keyId: 'key-current', client: createMockProvider() };
    const pre = await preflightPaidGeneration(session(), { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini' }, route);
    expect(BYOK_MAX_OUTPUT_TOKENS).toBe(8192);
    expect(PER_REQUEST_MAX_OUTPUT_TOKENS).toBe(2048);
    expect(pre.ok).toBe(true);
    if (!pre.ok || pre.ctx.route.keySource !== 'byok') throw new Error('BYOK preflight failed');
    expect(pre.ctx.maxOutputTokens).toBe(8192);
    expect(pre.ctx.route.keySource).toBe('byok');
    const settled = await settlePaidGeneration(route.client, pre.ctx, { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini', ledgerReason: 'test' }, async () => okResult());
    expect(settled.kind).toBe('completed');
    expect(admin.from.mock.calls.map(([table]) => table)).not.toContain('wallets');
    expect(admin.from.mock.calls.map(([table]) => table)).not.toContain('ledger_entries');
    expect(admin.rpc.mock.calls.map(([name]) => name)).not.toContain('apply_wallet_delta');
    expect(admin.state.ledger).toHaveLength(0);
  });

  it('returns replacement-required as terminal before any provider call', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const route = { kind: 'replacement_required' as const, replacement: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'service' as const } };
    const pre = await preflightPaidGeneration(session(), { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini' }, route);
    expect(pre).toMatchObject({ ok: false, replacement: route.replacement });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('records normalized completed usage before service settlement and excludes prompt/client fields', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    usageState.record.mockRejectedValueOnce(new Error('private response body'));
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const client = createMockProvider();
    await settlePaidGeneration(client, pre.ctx, { ...identity, workId: 'work-1', chapterId: 'chapter-1', ledgerReason: 'test' }, async () => okResult('private prompt echo', 12, 8, 3));
    expect(usageState.record).toHaveBeenCalledTimes(1);
    expect(usageState.record.mock.calls[0][1]).toEqual({
      ownerId: OWNER, provider: 'gemini', model: 'gemini-3.5-flash', keySource: 'service', status: 'completed',
      idempotencyKey: KEY, usage: { inputTokens: 12, outputTokens: 8, thoughtsTokens: 3, reported: { input: true, output: true } }, workId: 'work-1', chapterId: 'chapter-1',
    });
    expect(JSON.stringify(usageState.record.mock.calls[0][1])).not.toMatch(/prompt|contents|text|client|secret/i);
    expect(admin.rpc.mock.calls.some(([name]) => name === 'apply_wallet_delta')).toBe(true);
  });

  it('records reported refusals but skips refusals without reported usage', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const refusal = { ...okResult(), refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const }, finishReason: 'refusal' as const };
    await settlePaidGeneration(createMockProvider(), pre.ctx, { ...identity, ledgerReason: 'test' }, async () => refusal);
    expect(usageState.record.mock.calls[0][1].status).toBe('refused');
    expect(admin.rpc.mock.calls.some(([name]) => name === 'apply_wallet_delta')).toBe(true);

    usageState.record.mockClear();
    const noUsage = await preflightPaidGeneration(session(), { ...identity, idempotencyKey: '60000000-0000-4000-8000-000000000002' });
    if (!noUsage.ok) throw new Error('preflight failed');
    await settlePaidGeneration(createMockProvider(), noUsage.ctx, { ...identity, idempotencyKey: '60000000-0000-4000-8000-000000000002', ledgerReason: 'test' }, async () => ({ ...refusal, usage: { ...refusal.usage, reported: { input: false, output: false } } }));
    expect(usageState.record.mock.calls[0][1].status).toBe('refused');
    expect(admin.state.ledger).toHaveLength(2);
  });

  it('records BYOK success without wallet semantics and ignores usage insert failure', async () => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    usageState.record.mockRejectedValueOnce(new Error('private response body'));
    const client = { ...createMockProvider(), provider: 'openai' as const };
    const route = { kind: 'byok' as const, selection: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'byok' as const }, keyId: 'key-current', client };
    const pre = await preflightPaidGeneration(session(), { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini' }, route);
    if (!pre.ok || pre.ctx.route.keySource !== 'byok') throw new Error('BYOK preflight failed');
    const settled = await settlePaidGeneration(client, pre.ctx, { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini', ledgerReason: 'test' }, async () => okResult());
    expect(settled.kind).toBe('completed');
    expect(usageState.record.mock.calls[0][1]).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', keySource: 'byok', status: 'completed' });
    expect(settled).not.toHaveProperty('remainingBalance');
    expect(settled).not.toHaveProperty('debitAmount');
    expect(admin.from.mock.calls.map(([table]) => table)).not.toContain('wallets');
    expect(admin.from.mock.calls.map(([table]) => table)).not.toContain('ledger_entries');
    expect(admin.rpc.mock.calls.map(([name]) => name)).not.toContain('apply_wallet_delta');
  });

  it.each([
    ['invalid_key', 401, 'invalid_key'],
    ['rate_limited', 429, 'rate_limited'],
    ['credit_exhausted', 429, 'credit_exhausted'],
    ['unavailable', 503, 'unavailable'],
  ] as const)('normalizes %s without usage and marks only invalid keys', async (label, status, kind) => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    const route = { kind: 'byok' as const, selection: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'byok' as const }, keyId: 'key-current', client: createMockProvider() };
    const requestKey = `${KEY.slice(0, -1)}${status === 401 ? '1' : status === 429 ? (kind === 'rate_limited' ? '2' : '3') : '4'}`;
    const pre = await preflightPaidGeneration(session(), { ownerId: OWNER, idempotencyKey: requestKey, providerId: 'openai', model: 'gpt-4o-mini' }, route);
    if (!pre.ok || pre.ctx.route.keySource !== 'byok') throw new Error('BYOK preflight failed');
    const client = { ...route.client, provider: 'openai' as const };
    await settlePaidGeneration(client, pre.ctx, { ownerId: OWNER, idempotencyKey: requestKey, providerId: 'openai', model: 'gpt-4o-mini', ledgerReason: 'test' }, async () => {
      throw new ProviderCallError({ provider: 'openai', status, kind, providerErrorCode: status === 401 ? 'UNAUTHENTICATED' : status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED' });
    });
    const marks = admin.rpc.mock.calls.filter(([name]) => name === 'mark_byok_failed');
    if (label === 'invalid_key') expect(marks).toEqual([['mark_byok_failed', { p_owner: OWNER, p_provider: 'openai', p_expected_key_id: 'key-current' }]]);
    else expect(marks).toHaveLength(0);
    expect(usageState.record).not.toHaveBeenCalled();
  });

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
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const client = createMockProvider() as unknown as ProviderClient;
    const settled = await settlePaidGeneration(client, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => {
      throw new ProviderCallError({ provider: 'gemini', status: 429, kind: 'rate_limited', providerErrorCode: 'RESOURCE_EXHAUSTED' });
    });
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'rate_limited' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
  });

  it('does not debit a GenerationRejectedError and leaves the key reusable (BUG-06)', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const client = createMockProvider() as unknown as ProviderClient;
    const settled = await settlePaidGeneration(client, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => {
      throw new GenerationRejectedError('rejected copy', 'structure');
    });
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'failed', failureKind: 'rejected_output', error: 'rejected copy' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
    expect(admin.state.locks).toEqual({});
    // 같은 키로 다시 preflight해도 already_processed가 아니다
    const again = await preflightPaidGeneration(session(), identity);
    expect(again.ok).toBe(true);
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
    const ctx = { route: { keySource: 'service' as const, providerId: 'gemini' as const, model: 'model' }, admin: admin.client, walletBalance: 100, model: 'model', pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], maxOutputTokens: 1 };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, ctx, { ...identity, ledgerReason: 'test' }, async () => okResult());
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'write_denied' } });
    expect(usageState.record).toHaveBeenCalledTimes(1);
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
    expect(usageState.record).not.toHaveBeenCalled();
    expect(admin.state.locks).toEqual({});
  });
});
