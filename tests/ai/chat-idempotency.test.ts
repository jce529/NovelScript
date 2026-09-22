import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// COST-01 offline evidence (08-03): the debit is keyed by the caller's idempotencyKey and a
// recorded key is never charged or generated twice.

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { computeDebitAmount } from '@/lib/ai/cost';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

const OWNER = '10000000-0000-4000-8000-000000000001';
const OTHER_WALLET = '10000000-0000-4000-8000-000000000002';
const KEY = '60000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';

const input: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000001', chapterId, modelTier: 'lite',
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
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 10, candidatesTokenCount: 10 });
    expect(debitCalls(admin)).toEqual([['apply_wallet_delta', {
      p_wallet_id: OWNER, p_delta: -debit, p_reference_type: 'ai_generation', p_reference_id: KEY, p_reason: `chapter:${chapterId}`,
    }]]);
  });

  it('BUG-04: folds reported thinking tokens into the debit at the output rate', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => okResult('[REPLY]\n응답', 1000, 2000, 3000) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: true, status: 'completed' });
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 1000, candidatesTokenCount: 2000, thoughtsTokenCount: 3000 });
    const debitWithoutThoughts = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 1000, candidatesTokenCount: 2000 });
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
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 10000, candidatesTokenCount: 10000 });
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

  it('concurrent same key (barrier): exactly one ledger row and one debit', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    let release!: () => void;
    const barrier = new Promise<void>(r => { release = r; });
    const provider = createMockProvider({ generateContent: async () => { await barrier; return okResult('[REPLY]\n응답', 10000, 10000); } });
    const both = Promise.all([chat(session, asClient(provider), input), chat(session, asClient(provider), input)]);
    await vi.waitFor(() => expect(provider.generateContent).toHaveBeenCalledTimes(2));
    release();
    const results = await both;
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 10000, candidatesTokenCount: 10000 });
    expect(keyRows(admin)).toHaveLength(1);
    expect(admin.state.balances[OWNER]).toBe(1000 - debit);
    for (const r of results) expect(['completed', 'already_processed']).toContain(r.status);
  });

  it('concurrent same key with balance for exactly one debit: loser is already_processed, never negative', async () => {
    const debit = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 10000, candidatesTokenCount: 10000 });
    const admin = setup({ balances: { [OWNER]: debit } });
    let release!: () => void;
    const barrier = new Promise<void>(r => { release = r; });
    const provider = createMockProvider({ generateContent: async () => { await barrier; return okResult('[REPLY]\n응답', 10000, 10000); } });
    const both = Promise.all([chat(session, asClient(provider), input), chat(session, asClient(provider), input)]);
    await vi.waitFor(() => expect(provider.generateContent).toHaveBeenCalledTimes(2));
    release();
    const results = await both;
    expect(keyRows(admin)).toHaveLength(1);
    expect(admin.state.balances[OWNER]).toBe(0);
    expect(results.map(r => r.status).sort()).toEqual(['already_processed', 'completed']);
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
    expect(p.p_delta).toBe(-computeDebitAmount({ modelTier: 'lite', promptTokenCount: 12345, candidatesTokenCount: 6789 }));
  });
});
