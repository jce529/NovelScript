import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// 08-03 Task 2: structured refusals (D-05..D-08), provider error kinds (D-10) and scrubbed logs (D-11/D-12).

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { computeDebitAmount } from '@/lib/ai/cost';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import type { GenerateResult, ProviderClient, RefusalReasonCode } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

const OWNER = '10000000-0000-4000-8000-000000000001';
const KEY = '60000000-0000-4000-8000-000000000001';
const input: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000001', chapterId: '30000000-0000-4000-8000-000000000001',
  modelTier: 'lite', mentionedNodeIds: [], presetLevel: 'beginner', styleId: 'concise-hemingway', genre: '판타지',
  precedingText: '', chatHistory: [{ role: 'user', content: '이어서 써줘' }], idempotencyKey: KEY,
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

function refusal(stage: 'input' | 'output', reasonCode: RefusalReasonCode, inputTokens: number, outputTokens: number, reported = true): GenerateResult {
  return {
    text: stage === 'output' ? 'PARTIAL-OUTPUT' : '', finishReason: 'refusal', refusal: { stage, reasonCode },
    usage: { inputTokens, outputTokens, thoughtsTokens: null, reported: { input: reported, output: reported && stage === 'output' } },
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.restoreAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('chat() structured refusals', () => {
  it('(A) input refusal debits reported usage with the key and returns only normalized info', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => refusal('input', 'SAFETY', 900, 0) });
    const result = await chat(session, asClient(provider), input);
    const amount = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 900, candidatesTokenCount: 0 });
    expect(debitCalls(admin)).toHaveLength(1);
    expect(debitCalls(admin)[0][1]).toMatchObject({ p_reference_id: KEY, p_delta: 0 - amount });
    expect(result).toEqual({
      ok: false, status: 'refused', error: CHAT_COPY.refusedTitle,
      refusal: { stage: 'input', reasonCode: 'SAFETY', debitAmount: amount }, remainingBalance: 1000 - amount,
    });
    for (const k of ['reply', 'draft', 'proposal', 'wasCapped']) expect(result).not.toHaveProperty(k);
  });

  it.each(['RECITATION', 'PROHIBITED_CONTENT'] as const)('(B) output refusal %s debits input + output usage', async (code) => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => refusal('output', code, 3000, 4000) });
    const result = await chat(session, asClient(provider), input);
    const amount = computeDebitAmount({ modelTier: 'lite', promptTokenCount: 3000, candidatesTokenCount: 4000 });
    expect(debitCalls(admin)[0][1]).toMatchObject({ p_delta: 0 - amount });
    expect(result).toMatchObject({ status: 'refused', refusal: { stage: 'output', reasonCode: code, debitAmount: amount } });
    expect(JSON.stringify(result)).not.toContain('PARTIAL-OUTPUT');
  });

  it('refusal with zero reported usage debits 0 and is still refused', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => refusal('input', 'SAFETY', 0, 0, false) });
    const result = await chat(session, asClient(provider), input);
    expect((debitCalls(admin)[0][1] as { p_delta: number }).p_delta).toBe(0);
    expect(result).toMatchObject({ status: 'refused', refusal: { debitAmount: 0 } });
  });

  it('refusal replay with the same key is already_processed without a provider call', async () => {
    setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => refusal('input', 'SAFETY', 900, 0) });
    await chat(session, asClient(provider), input);
    const replay = await chat(session, asClient(provider), input);
    expect(replay.status).toBe('already_processed');
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
  });

  it('D-04: a failed provider call leaves no row, so resending the same key completes once', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider();
    provider.generateContent
      .mockRejectedValueOnce(new ProviderCallError({ provider: 'gemini', status: 429, kind: 'rate_limited', providerErrorCode: 'RESOURCE_EXHAUSTED' }))
      .mockResolvedValueOnce(okResult());
    const first = await chat(session, asClient(provider), input);
    expect(first.failureKind).toBe('rate_limited');
    expect(admin.state.ledger).toHaveLength(0);
    const second = await chat(session, asClient(provider), input);
    expect(second.status).toBe('completed');
    expect(provider.generateContent).toHaveBeenCalledTimes(2);
    expect(debitCalls(admin)).toHaveLength(1);
    expect(admin.state.ledger.filter(r => r.reference_id === KEY)).toHaveLength(1);
  });

  it('refusal whose debit fails with no ledger row is a settlement failure (no refusal info)', async () => {
    setup({ balances: { [OWNER]: 1000 }, debitError: 'rpc' });
    const provider = createMockProvider({ generateContent: async () => refusal('input', 'SAFETY', 900, 0) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'settlement', error: CHAT_COPY.settlement });
  });

  it('refusal still respects the D-07 recheck', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 }, access: 'suspended' });
    const provider = createMockProvider({ generateContent: async () => refusal('input', 'SAFETY', 900, 0) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: false, status: 'failed', failureKind: 'write_denied', code: 'write_suspended' });
    expect(debitCalls(admin)).toHaveLength(0);
  });

  it('(D-05 C) a prose refusal with finishReason stop is a normal completion', async () => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({ generateContent: async () => okResult("I can't help with that.", 10, 10) });
    const result = await chat(session, asClient(provider), input);
    expect(result).toMatchObject({ ok: true, status: 'completed', reply: "I can't help with that." });
    expect(debitCalls(admin)).toHaveLength(1);
  });
});

describe('chat() provider error kinds and scrubbed logs', () => {
  it.each([
    [429, 'rate_limited', 'RESOURCE_EXHAUSTED'],
    [503, 'unavailable', 'UNAVAILABLE'],
    [401, 'config', 'UNAUTHENTICATED'],
  ] as const)('status %i → %s copy, never charged', async (status, kind, code) => {
    const admin = setup({ balances: { [OWNER]: 1000 } });
    const provider = createMockProvider({
      generateContent: async () => { throw new ProviderCallError({ provider: 'gemini', status, kind, providerErrorCode: code }); },
    });
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: kind, error: CHAT_COPY[kind] });
    expect(debitCalls(admin)).toHaveLength(0);
    expect(admin.state.ledger).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ai] provider call failed', { provider: 'gemini', status, kind, idempotencyKey: KEY });
  });

  it('a non-ProviderCallError is scrubbed to unavailable and leaks nothing', async () => {
    setup({ balances: { [OWNER]: 1000 } });
    const raw = Object.assign(new Error('boom sk-SENTINEL'), { config: { headers: { Authorization: 'Bearer sk-SENTINEL' } } });
    const provider = createMockProvider({ generateContent: async () => { throw raw; } });
    const result = await chat(session, asClient(provider), input);
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'unavailable', error: CHAT_COPY.unavailable });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ai] provider call failed', { provider: 'gemini', status: null, kind: 'unavailable', idempotencyKey: KEY });
    const systemInstruction = provider.generateContent.mock.calls[0][0].systemInstruction;
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain('sk-SENTINEL');
    expect(logged).not.toContain('이어서 써줘');
    expect(logged).not.toContain(systemInstruction.slice(0, 40));
    expect(JSON.stringify(result)).not.toContain('sk-SENTINEL');
  });

  it('settlement failure logs only provider/stage/idempotencyKey', async () => {
    setup({ balances: { [OWNER]: 1000 }, debitError: 'rpc' });
    await chat(session, asClient(createMockProvider()), input);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.keys(payload).sort()).toEqual(['idempotencyKey', 'provider', 'stage']);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('insufficient balance');
  });
});
