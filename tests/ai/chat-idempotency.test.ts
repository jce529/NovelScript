import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// COST-01 offline evidence (08-03): the debit is keyed by the caller's idempotencyKey and a
// recorded key is never charged or generated twice.

const adminState = vi.hoisted(() => ({ client: null as unknown }));
const mentionsMock = vi.hoisted(() => ({ fail: false }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({
  getMentionedNodesContent: async () => {
    if (mentionsMock.fail) throw new Error('mention lookup failed');
    return [];
  },
}));

import { chat, type ChatInput } from '@/lib/ai/chat';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { computeDebitAmount } from '@/lib/ai/cost';
import { GEMINI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/gemini/cost';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER_WALLET = '10000000-0000-4000-8000-000000000002';
const KEY = '60000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';

const input: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000001', chapterId, providerId: 'gemini', model: 'gemini-3.5-flash',
  mentionedNodeIds: [], presetLevel: 'beginner', styleId: 'concise-hemingway', genre: '판타지',
  precedingText: '어느 날', chatHistory: [{ role: 'user', content: '이어서 써줘' }], idempotencyKey: KEY,
};

const session = {
  rpc: async () => ({ data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null }),
} as unknown as SupabaseClient;

function setup(opts: FakeLedgerOptions) {
  const admin = createFakeLedgerAdmin(opts);
  adminState.client = admin.client;
  return admin;
}
const asClient = (p: ReturnType<typeof createMockProvider>) => p as unknown as ProviderClient;
const debitCalls = (admin: ReturnType<typeof createFakeLedgerAdmin>) =>
  admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta');
const keyRows = (admin: ReturnType<typeof createFakeLedgerAdmin>, wallet = OWNER) =>
  admin.state.ledger.filter(r => r.wallet_id === wallet && r.reference_type === 'ai_generation' && r.reference_id === KEY);

describe('chat() idempotent debit (COST-01, D-02/D-03)', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('debits once with the stable key as reference_id', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: true, status: 'completed' });
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10, candidatesTokenCount: 10 });
    expect(debitCalls(admin)).toEqual([['apply_wallet_delta', {
      p_wallet_id: OWNER, p_delta: -debit, p_reference_type: 'ai_generation', p_reference_id: KEY, p_reason: `chapter:${chapterId}`,
    }]]);
  });

  it('BUG-04: folds reported thinking tokens into the debit at the output rate', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => okResult('[REPLY]\n응답', 1000, 2000, 3000) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: true, status: 'completed' });
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: 3000 });
    const debitWithoutThoughts = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 1000, candidatesTokenCount: 2000 });
    expect(debit).toBeGreaterThan(debitWithoutThoughts);
    expect(debitCalls(admin)).toEqual([['apply_wallet_delta', {
      p_wallet_id: OWNER, p_delta: -debit, p_reference_type: 'ai_generation', p_reference_id: KEY, p_reason: `chapter:${chapterId}`,
    }]]);
  });

  it('blocks a replay of a recorded key before the cap and the provider call', async () => {
    const admin = setup({ balances: { [OWNER]: 500 }, ledger: [{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY }] });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({ ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 500 });
    expect(provider.generateContent).not.toHaveBeenCalled();
    expect(debitCalls(admin)).toHaveLength(0);
  });

  it('sequential replay: provider called once, one row, second call already_processed', async () => {
    const usage = okResult('[REPLY]\n응답', 10000, 10000);
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => usage });
    const first = await chat(session, asClient(provider), input);
    const second = await chat(session, asClient(provider), input);
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10000, candidatesTokenCount: 10000 });
    expect(first.status).toBe('completed');
    expect(second).toEqual({ ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 1000 - debit });
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
    expect(keyRows(admin)).toHaveLength(1);
    expect(admin.state.balances[OWNER]).toBe(1000 - debit);
  });

  it('the same key on another wallet is not treated as processed', async () => {
    const admin = setup({
      balances: { [OWNER]: 1000, [OTHER_WALLET]: 1000 },
      ledger: [{ wallet_id: OTHER_WALLET, reference_type: 'ai_generation', reference_id: KEY }],
    });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result.status).toBe('completed');
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
    expect(keyRows(admin)).toHaveLength(1);
  });

  it('the same key under another reference_type is not treated as processed', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, ledger: [{ wallet_id: OWNER, reference_type: 'purchase', reference_id: KEY }] });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result.status).toBe('completed');
    expect(keyRows(admin)).toHaveLength(1);
  });

  it('fails closed when the ledger lookup errors', async () => {
    setup({ balances: { [OWNER]: 1000 }, ledgerLookupError: true });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'unavailable', error: CHAT_COPY.unavailable });
    expect(provider.generateContent).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('DB-SENTINEL');
  });

  it('stops before the provider when the balance is 0 (no input estimate)', async () => {
    setup({ balances: { [OWNER]: 0 } });
    const provider = createMockProvider();
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({
      ok: false, status: 'failed', failureKind: 'insufficient_balance', error: CHAT_COPY.insufficient_balance,
      wasCapped: true, remainingBalance: 0,
    });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('caps output from the whole balance with no input estimate', async () => {
    setup({ balances: { [OWNER]: 1 } });
    const provider = createMockProvider();
    await chat(session, asClient(provider), input);
    const params = provider.generateContent.mock.calls[0][0];
    expect(params).toMatchObject({ maxOutputTokens: 793, temperature: 0.9 });
    expect(params.contents).toContain('이어서 써줘');
    expect(provider).not.toHaveProperty('estimateInputTokens');
  });

  it('actual usage above the balance debits only the remaining balance and still returns the body', async () => {
    const admin = setup({ balances: { [OWNER]: 1 } });
    const provider = createMockProvider({ generateContent: async () => okResult('[REPLY]\n응답 본문', 100000, 100000) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: true, status: 'completed', reply: '응답 본문', remainingBalance: 0 });
    expect(admin.state.balances[OWNER]).toBe(0);
    expect(keyRows(admin)).toHaveLength(1);
    expect((debitCalls(admin)[0][1] as { p_delta: number }).p_delta).toBe(-1);
  });

  it('debit error but another request already recorded the key → already_processed', async () => {
    setup({
      balances: { [OWNER]: 700 }, debitError: 'rpc',
      beforeDebit: s => { s.ledger.push({ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY }); },
    });
    const result = await chat(session, asClient(createMockProvider()), input);
    expect(result).toEqual({ ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: 700 });
  });

  it('a thrown debit is treated like a debit error', async () => {
    setup({ balances: { [OWNER]: 700 }, debitError: 'throw' });
    const result = await chat(session, asClient(createMockProvider()), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'settlement', error: CHAT_COPY.settlement });
  });

  it('settlement re-read that also errors → settlement failure', async () => {
    setup({ balances: { [OWNER]: 700 }, debitError: 'rpc', ledgerLookupError: [3] });
    const result = await chat(session, asClient(createMockProvider()), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'settlement', error: CHAT_COPY.settlement });
  });

  // BUG-06: same-wallet generations are serialized by a lease, so a concurrent same-key request
  // is refused before any provider call instead of racing to the debit.
  it('concurrent same key (barrier): one provider call, one ledger row, loser told generation is in progress', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    let release!: () => void;
    const barrier = new Promise<void>(r => { release = r; });
    const provider = createMockProvider({ generateContent: async () => { await barrier; return okResult('[REPLY]\n응답', 10000, 10000); } });
    const first = chat(session, asClient(provider), input);
    await vi.waitFor(() => expect(provider.generateContent).toHaveBeenCalledTimes(1));
    const second = await chat(session, asClient(provider), input);
    expect(second).toEqual({ ok: false, status: 'failed', failureKind: 'generation_in_progress', error: CHAT_COPY.generation_in_progress });
    release();
    const firstResult = await first;
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10000, candidatesTokenCount: 10000 });
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
    expect(firstResult.status).toBe('completed');
    expect(keyRows(admin)).toHaveLength(1);
    expect(admin.state.balances[OWNER]).toBe(1000 - debit);
    expect(admin.state.locks).toEqual({});
  });

  it('concurrent requests with balance for one debit: the loser never reaches settlement, balance never negative', async () => {
    const debit = computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 10000, candidatesTokenCount: 10000 });
    const admin = setup({ balances: { [OWNER]: debit } });
    let release!: () => void;
    const barrier = new Promise<void>(r => { release = r; });
    const provider = createMockProvider({ generateContent: async () => { await barrier; return okResult('[REPLY]\n응답', 10000, 10000); } });
    const otherKey = { ...input, idempotencyKey: '60000000-0000-4000-8000-000000000002' };
    const first = chat(session, asClient(provider), input);
    await vi.waitFor(() => expect(provider.generateContent).toHaveBeenCalledTimes(1));
    const second = await chat(session, asClient(provider), otherKey);
    expect(second.failureKind).toBe('generation_in_progress');
    release();
    expect((await first).status).toBe('completed');
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
    expect(keyRows(admin)).toHaveLength(1);
    expect(admin.state.balances[OWNER]).toBe(0);
    expect(debitCalls(admin)).toHaveLength(1);
  });

  it('a different wallet is not blocked while another wallet generates', async () => {
    const OTHER = '10000000-0000-4000-8000-000000000009';
    const admin = setup({ balances: { [OWNER]: 1000, [OTHER]: 1000 } });
    let release!: () => void;
    const barrier = new Promise<void>(r => { release = r; });
    const slow = createMockProvider({ generateContent: async () => { await barrier; return okResult('[REPLY]\n응답', 10, 10); } });
    const first = chat(session, asClient(slow), input);
    await vi.waitFor(() => expect(slow.generateContent).toHaveBeenCalledTimes(1));
    const fast = createMockProvider({ generateContent: async () => okResult('[REPLY]\n응답', 10, 10) });
    const other = await chat(session, asClient(fast), { ...input, ownerId: OTHER });
    expect(other.status).toBe('completed');
    release();
    await first;
    expect(admin.state.locks).toEqual({});
  });

  describe('wallet lease release on every exit (BUG-06)', () => {
    it.each([
      ['success', {}, async () => okResult('[REPLY]\n응답', 10, 10)],
      ['provider failure', {}, async () => { throw new ProviderCallError({ provider: 'gemini', status: 503, kind: 'unavailable', providerErrorCode: 'UNAVAILABLE' }); }],
      ['refusal', {}, async () => ({ ...okResult('', 10, 0), finishReason: 'refusal' as const, refusal: { stage: 'output' as const, reasonCode: 'SAFETY' as const } })],
      ['settlement failure', { debitError: 'rpc' as const }, async () => okResult('[REPLY]\n응답', 10, 10)],
      ['write access revoked', { access: 'suspended' as const }, async () => okResult('[REPLY]\n응답', 10, 10)],
    ])('%s: the next request can generate', async (_name, extra, generate) => {
      const admin = setup({ balances: { [OWNER]: 1000 }, ...extra });
      const provider = createMockProvider({ generateContent: generate });
      await chat(session, asClient(provider), input);
      expect(admin.state.locks).toEqual({});
    });

    it('a throw before settle (mention lookup) still releases the lease', async () => {
      const admin = setup({ balances: { [OWNER]: 1000 } });
      mentionsMock.fail = true;
      try {
        await expect(chat(session, asClient(createMockProvider()), input)).rejects.toThrow('mention lookup failed');
      } finally {
        mentionsMock.fail = false;
      }
      expect(admin.state.locks).toEqual({});
    });

    it('a failed release is logged and does not break the result', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const admin = setup({ balances: { [OWNER]: 1000 }, releaseError: true });
      const result = await chat(session, asClient(createMockProvider()), input);
      expect(result.status).toBe('completed');
      expect(spy).toHaveBeenCalledWith('[ai] generation lease release failed', { stage: 'lease_release' });
      expect(Object.keys(admin.state.locks)).toEqual([OWNER]);
    });
  });

  it('lease acquire errors fail closed before any provider call', async () => {
    for (const lock of ['rpc', 'throw'] as const) {
      setup({ balances: { [OWNER]: 1000 }, lock });
      const provider = createMockProvider();
      const result = await chat(session, asClient(provider), input);
      expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'unavailable', error: CHAT_COPY.unavailable });
      expect(provider.generateContent).not.toHaveBeenCalled();
    }
  });

  it('insufficient balance releases the lease so a later request can retry', async () => {
    const admin = setup({ balances: { [OWNER]: 0 } });
    const result = await chat(session, asClient(createMockProvider()), input);
    expect(result.failureKind).toBe('insufficient_balance');
    expect(admin.state.locks).toEqual({});
  });

  it('zero usage debits +0 (never -0) and still records the key', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const zero = { ...okResult('[REPLY]\n응답', 0, 0), usage: { inputTokens: 0, outputTokens: 0, thoughtsTokens: null, reported: { input: false, output: false } } };
    const provider = createMockProvider({ generateContent: async () => zero });
    await chat(session, asClient(provider), input);
    const p = debitCalls(admin)[0][1] as { p_delta: number };
    expect(p.p_delta).toBe(0);
    expect(Object.is(p.p_delta, -0)).toBe(false);
    const replay = await chat(session, asClient(provider), input);
    expect(replay.status).toBe('already_processed');
  });

  it('debits actual provider-reported usage', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => okResult('[REPLY]\nx', 12345, 6789) });
    await chat(session, asClient(provider), input);
    const p = debitCalls(admin)[0][1] as { p_delta: number };
    expect(p.p_delta).toBe(-computeDebitAmount({ pricing: GEMINI_PRICING_USD_PER_MILLION['gemini-3.5-flash'], promptTokenCount: 12345, candidatesTokenCount: 6789 }));
  });
});
