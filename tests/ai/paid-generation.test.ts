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
const SETTLE = 'settle_service_ai_generation';
const settleCalls = (admin: ReturnType<typeof createFakeLedgerAdmin>) => admin.rpc.mock.calls.filter(c => c[0] === SETTLE);
const rpcNames = (admin: ReturnType<typeof createFakeLedgerAdmin>) => admin.rpc.mock.calls.map(([name]) => name);

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
    expect(rpcNames(admin)).not.toContain('apply_wallet_delta');
    expect(rpcNames(admin)).not.toContain(SETTLE);
    expect(rpcNames(admin)).not.toContain('acquire_ai_generation_lock');
    expect(admin.state.ledger).toHaveLength(0);
    expect(admin.state.balances[OWNER]).toBe(0);
  });

  it('returns replacement-required as terminal before any provider call', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const route = { kind: 'replacement_required' as const, replacement: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'service' as const } };
    const pre = await preflightPaidGeneration(session(), { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai', model: 'gpt-4o-mini' }, route);
    expect(pre).toMatchObject({ ok: false, replacement: route.replacement });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('sends normalized usage to the atomic settlement RPC and excludes prompt/client fields', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const client = createMockProvider();
    const settled = await settlePaidGeneration(client, pre.ctx, { ...identity, workId: 'work-1', chapterId: 'chapter-1', ledgerReason: 'test' }, async () => okResult('private prompt echo', 12, 8, 3));
    expect(settled.kind).toBe('completed');
    // COST-02 reopen: the service path no longer writes best-effort telemetry before settlement.
    expect(usageState.record).not.toHaveBeenCalled();
    expect(settleCalls(admin)).toHaveLength(1);
    const params = settleCalls(admin)[0][1] as Record<string, unknown>;
    expect(params).toMatchObject({ p_owner_id: OWNER, p_idempotency_key: KEY, p_ledger_reason: 'test' });
    expect(params.p_usage).toEqual({
      provider: 'gemini', model: 'gemini-3.5-flash', status: 'completed', input_tokens: 12, output_tokens: 8, thoughts_tokens: 3,
      input_reported: true, output_reported: true, work_id: 'work-1', chapter_id: 'chapter-1',
    });
    expect(JSON.stringify(params)).not.toMatch(/private|prompt|contents|text|client|secret/i);
    expect(rpcNames(admin)).not.toContain('apply_wallet_delta');
  });

  it('settles reported refusals once and leaves unreported refusals with no usage or ledger', async () => {
    const admin = setup({ balances: { [OWNER]: 100000 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok || pre.ctx.route.keySource !== 'service') throw new Error('preflight failed');
    const refusal = { ...okResult(), refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const }, finishReason: 'refusal' as const };
    await settlePaidGeneration(createMockProvider(), pre.ctx, { ...identity, ledgerReason: 'test' }, async () => refusal);
    expect((settleCalls(admin)[0][1] as { p_usage: { status: string } }).p_usage.status).toBe('refused');
    expect(admin.state.usage.filter(r => r.idempotency_key === KEY && r.service_settled_at !== null)).toHaveLength(1);

    const KEY2 = '60000000-0000-4000-8000-000000000002';
    const noUsage = await preflightPaidGeneration(session(), { ...identity, idempotencyKey: KEY2 });
    if (!noUsage.ok) throw new Error('preflight failed');
    const settled = await settlePaidGeneration(createMockProvider(), noUsage.ctx, { ...identity, idempotencyKey: KEY2, ledgerReason: 'test' }, async () => ({ ...refusal, usage: { ...refusal.usage, reported: { input: false, output: false } } }));
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { status: 'refused', refusal: { debitAmount: 0 } } });
    expect(settleCalls(admin)).toHaveLength(1);
    expect(usageState.record).not.toHaveBeenCalled();
    expect(admin.state.usage.filter(r => r.idempotency_key === KEY2)).toHaveLength(0);
    expect(admin.state.ledger.filter(r => r.reference_id === KEY2)).toHaveLength(0);
    // D-12: no marker, so the same key may be retried manually.
    expect((await preflightPaidGeneration(session(), { ...identity, idempotencyKey: KEY2 })).ok).toBe(true);
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
    expect(rpcNames(admin)).not.toContain('apply_wallet_delta');
    expect(rpcNames(admin)).not.toContain(SETTLE);
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
    const settled = await settlePaidGeneration(client, pre.ctx, { ownerId: OWNER, idempotencyKey: requestKey, providerId: 'openai', model: 'gpt-4o-mini', ledgerReason: 'test' }, async () => {
      throw new ProviderCallError({ provider: 'openai', status, kind, providerErrorCode: status === 401 ? 'UNAUTHENTICATED' : status === 503 ? 'UNAVAILABLE' : 'RESOURCE_EXHAUSTED' });
    });
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { ok: false, failureKind: kind } });
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
    expect(settleCalls(admin)).toHaveLength(0);
    expect(admin.state.usage).toHaveLength(0);
    expect((await preflightPaidGeneration(session(), identity)).ok).toBe(true);
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
    expect(settleCalls(admin)).toHaveLength(0);
    expect(admin.state.usage).toHaveLength(0);
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
    expect(settleCalls(admin)).toEqual([[SETTLE, expect.objectContaining({
      p_owner_id: OWNER, p_idempotency_key: KEY, p_ledger_reason: 'document:1',
    })]]);
    expect(admin.state.ledger).toEqual([{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY, delta: -(settled as { debitAmount: number }).debitAmount }]);
  });

  it('does not debit when the post-generation write check is denied', async () => {
    const admin = setup({ balances: { [OWNER]: 100 }, access: 'suspended' });
    const ctx = { route: { keySource: 'service' as const, providerId: 'gemini' as const, model: 'model' }, admin: admin.client, walletBalance: 100, model: 'model', pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], maxOutputTokens: 1 };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, ctx, { ...identity, ledgerReason: 'test' }, async () => okResult());
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'write_denied' } });
    // Observation-only telemetry may remain, but it is never a completion marker.
    expect(usageState.record).toHaveBeenCalledTimes(1);
    expect(settleCalls(admin)).toHaveLength(0);
  });

  it('debits a structured refusal and returns it as terminal', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const refusal = { ...okResult(), refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const }, finishReason: 'refusal' as const };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => refusal);
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { status: 'refused', refusal: { reasonCode: 'SAFETY' } } });
    expect(settleCalls(admin)).toHaveLength(1);
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

describe('service completion marker in ai_usage (COST-02 reopen, 11-10)', () => {
  const OTHER = '10000000-0000-4000-8000-000000000002';
  const settledRow = (owner = OWNER, key = KEY) => ({ owner_id: owner, idempotency_key: key, key_source: 'service' as const, status: 'completed' as const, service_settled_at: '2026-10-17T00:00:00Z' });
  const pendingRow = (owner = OWNER, key = KEY) => ({ owner_id: owner, idempotency_key: key, key_source: 'service' as const, status: 'completed' as const, service_settled_at: null });
  const zero = () => ({ ...okResult('body', 0, 0), usage: { inputTokens: 0, outputTokens: 0, thoughtsTokens: null, reported: { input: false, output: false } } });

  async function run(admin: ReturnType<typeof createFakeLedgerAdmin>, generate: () => Promise<ReturnType<typeof okResult>>, id: typeof identity = identity) {
    const pre = await preflightPaidGeneration(session(), id);
    if (!pre.ok) return { pre };
    const settled = await settlePaidGeneration(createMockProvider(), pre.ctx, { ...id, ledgerReason: 'test' }, generate);
    return { pre, settled };
  }

  it('zero-usage success: one settled usage row, no ledger row, balance unchanged, replay blocked', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const { settled } = await run(admin, async () => zero());
    expect(settled).toMatchObject({ kind: 'completed', debitAmount: 0, remainingBalance: 1000 });
    expect(admin.state.usage).toEqual([expect.objectContaining({ owner_id: OWNER, idempotency_key: KEY, key_source: 'service', status: 'completed', service_settled_at: expect.any(String) })]);
    expect(admin.state.ledger).toHaveLength(0);
    expect(admin.state.balances[OWNER]).toBe(1000);
    const replay = await preflightPaidGeneration(session(), identity);
    expect(replay).toEqual({ ok: false, chatResult: { ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 1000 } });
    expect(admin.state.locks).toEqual({});
  });

  it('a settled usage row blocks the key before the lease', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, usage: [settledRow()] });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { status: 'already_processed', remainingBalance: 1000 } });
    expect(rpcNames(admin)).not.toContain('acquire_ai_generation_lock');
  });

  it('a completed usage row with service_settled_at NULL is NOT a completion (unconfirmed telemetry)', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, usage: [pendingRow()] });
    const { settled } = await run(admin, async () => okResult('body', 1000, 1000));
    expect(settled).toMatchObject({ kind: 'completed' });
    expect(admin.state.usage).toHaveLength(1);
    expect(admin.state.usage[0].service_settled_at).not.toBeNull();
    expect(admin.state.ledger).toHaveLength(1);
  });

  it('a BYOK usage row for the same logical key counts as consumed', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, usage: [{ ...pendingRow(), key_source: 'byok' }] });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
    expect(rpcNames(admin)).not.toContain(SETTLE);
  });

  it('a legacy zero-delta ai_generation ledger row still blocks replay', async () => {
    setup({ balances: { [OWNER]: 1000 }, ledger: [{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY, delta: 0 }] });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
  });

  it('the same key under another owner is independent', async () => {
    const admin = setup({ balances: { [OWNER]: 1000, [OTHER]: 1000 }, usage: [settledRow(OTHER)] });
    const { settled } = await run(admin, async () => okResult('body', 1000, 1000));
    expect(settled).toMatchObject({ kind: 'completed' });
    expect(admin.state.usage.filter(r => r.owner_id === OWNER && r.service_settled_at !== null)).toHaveLength(1);
  });

  it('a usage lookup error fails closed before the lease and the provider', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, usageLookupError: true });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toEqual({ ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'unavailable', error: CHAT_COPY.unavailable } });
    expect(rpcNames(admin)).not.toContain('acquire_ai_generation_lock');
    expect(JSON.stringify(pre)).not.toContain('DB-SENTINEL');
  });

  it('re-checks after taking the lease: a request that finished in between is already_processed', async () => {
    const admin = setup({
      balances: { [OWNER]: 1000 },
      beforeAcquire: (s) => { s.usage.push(settledRow()); },
    });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
    expect(admin.state.locks).toEqual({});
  });

  it('a lookup error after taking the lease releases it and fails closed', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, usageLookupError: [2] });
    const pre = await preflightPaidGeneration(session(), identity);
    expect(pre).toMatchObject({ ok: false, chatResult: { failureKind: 'unavailable' } });
    expect(admin.state.locks).toEqual({});
  });

  it('its own unsettled telemetry row is never mistaken for already_processed', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    // Simulate a writer of best-effort telemetry under the same key (e.g. an earlier revoked run).
    usageState.record.mockImplementation(async (client: SupabaseClient, input: { ownerId: string; idempotencyKey: string }) => {
      await client.from('ai_usage').insert({ owner_id: input.ownerId, idempotency_key: input.idempotencyKey, key_source: 'service', status: 'completed' });
      return { ok: true, recorded: true };
    });
    const { settled } = await run(admin, async () => okResult('body', 1000, 1000));
    expect(settled).toMatchObject({ kind: 'completed' });
    expect(settleCalls(admin)).toHaveLength(1);
    expect(admin.state.ledger).toHaveLength(1);
  });

  it('a positive cost is debited once, inside the settlement RPC', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const { settled } = await run(admin, async () => okResult('body', 10000, 10000));
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10000, candidatesTokenCount: 10000 });
    expect(settled).toMatchObject({ kind: 'completed', debitAmount: debit, remainingBalance: 1000 - debit });
    expect((settleCalls(admin)[0][1] as { p_debit_amount: number }).p_debit_amount).toBe(debit);
    expect(admin.state.ledger).toEqual([{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY, delta: -debit }]);
  });

  it.each(['rpc', 'throw'] as const)('settlement fails before commit (%s): no body, no marker, same key retries', async (mode) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = setup({ balances: { [OWNER]: 1000 }, settleError: mode });
    const { settled } = await run(admin, async () => okResult('SECRET-BODY', 1000, 1000));
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'failed', failureKind: 'settlement', error: CHAT_COPY.settlement } });
    expect(JSON.stringify(settled)).not.toContain('SECRET-BODY');
    expect(admin.state.usage).toHaveLength(0);
    expect(admin.state.ledger).toHaveLength(0);
    expect(admin.state.locks).toEqual({});
    expect(errorSpy).toHaveBeenCalledWith('[ai] wallet settlement failed', { provider: 'gemini', stage: 'settlement', idempotencyKey: KEY });
    expect(rpcNames(admin).filter(n => n === SETTLE)).toHaveLength(1); // no automatic RPC retry
    expect((await preflightPaidGeneration(session(), identity)).ok).toBe(true);
  });

  it.each(['rpc', 'throw'] as const)('settlement commits but the response is lost (%s): re-read says already_processed, no extra debit', async (mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = setup({ balances: { [OWNER]: 1000 }, settleLostResponse: mode });
    const { settled } = await run(admin, async () => okResult('SECRET-BODY', 10000, 10000));
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10000, candidatesTokenCount: 10000 });
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 1000 - debit } });
    expect(JSON.stringify(settled)).not.toContain('SECRET-BODY');
    expect(admin.state.ledger).toHaveLength(1);
    expect(rpcNames(admin).filter(n => n === SETTLE)).toHaveLength(1);
  });

  it('a malformed settlement payload is re-read like an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = setup({ balances: { [OWNER]: 1000 }, settleMalformed: true });
    const { settled } = await run(admin, async () => okResult('body', 10, 10));
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { status: 'already_processed' } });
    expect(admin.state.usage).toHaveLength(1);
  });

  it('lost response whose re-read also fails is a settlement failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const admin = setup({ balances: { [OWNER]: 1000 }, settleLostResponse: 'rpc', usageLookupError: [3] });
    const { settled } = await run(admin, async () => okResult('body', 10, 10));
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'failed', failureKind: 'settlement', error: CHAT_COPY.settlement } });
  });

  it('a racing settlement of the same key makes the RPC answer already_processed without a second debit', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, beforeSettlement: (s) => { s.usage.push(settledRow()); } });
    const { settled } = await run(admin, async () => okResult('SECRET-BODY', 10000, 10000));
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 1000 } });
    expect(admin.state.ledger).toHaveLength(0);
  });

  it('a reported refusal with zero tokens is settled with usage1/ledger0 and blocks replay', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const refusal = { ...okResult('', 0, 0), finishReason: 'refusal' as const, refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const } };
    const { settled } = await run(admin, async () => refusal);
    expect(settled).toEqual({ kind: 'terminal', chatResult: { ok: false, status: 'refused', error: CHAT_COPY.refusedTitle, remainingBalance: 1000, refusal: { stage: 'input', reasonCode: 'SAFETY', debitAmount: 0 } } });
    expect(admin.state.usage).toEqual([expect.objectContaining({ status: 'refused', service_settled_at: expect.any(String) })]);
    expect(admin.state.ledger).toHaveLength(0);
    await expect(preflightPaidGeneration(session(), identity)).resolves.toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
  });

  it('a wallet drained to 0 by this key answers a resend with already_processed (no insufficient_balance)', async () => {
    const admin = setup({ balances: { [OWNER]: 1 } });
    const { settled } = await run(admin, async () => okResult('body', 100000, 100000));
    expect(settled).toMatchObject({ kind: 'completed', debitAmount: 1, remainingBalance: 0 });
    const replay = await preflightPaidGeneration(session(), identity);
    expect(replay).toMatchObject({ ok: false, chatResult: { status: 'already_processed', remainingBalance: 0 } });
    expect(admin.state.ledger).toHaveLength(1);
  });

  it('BYOK at balance 0 succeeds without any wallet, lease, ledger or settlement RPC', async () => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    const client = { ...createMockProvider(), provider: 'openai' as const };
    const route = { kind: 'byok' as const, selection: { providerId: 'openai' as const, model: 'gpt-4o-mini', keySource: 'byok' as const }, keyId: 'key-current', client };
    const id = { ownerId: OWNER, idempotencyKey: KEY, providerId: 'openai' as const, model: 'gpt-4o-mini' };
    const pre = await preflightPaidGeneration(session(), id, route);
    if (!pre.ok) throw new Error('BYOK preflight failed');
    const settled = await settlePaidGeneration(client, pre.ctx, { ...id, ledgerReason: 'test' }, async () => okResult());
    expect(settled.kind).toBe('completed');
    expect(usageState.record).toHaveBeenCalledTimes(1);
    expect(rpcNames(admin).filter(n => n !== 'get_write_access')).toEqual([]);
    expect(admin.from.mock.calls.map(([t]) => t)).toEqual([]);
  });
});
