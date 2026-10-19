import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// 11-11 Task 1 (BYOK-05/BYOK-09 Reopen): shared capped-result contract + real chat() wiring.
// Offline unit suite: fake ledger admin + mock provider, no DB helpers.

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: async () => ({ ok: true }) }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import {
  CAPPED_COPY, cappedCompletionFields, cappedPresentation, classifyCappedReason,
} from '@/lib/ai/chat-result';
import { BYOK_MAX_OUTPUT_TOKENS, PER_REQUEST_MAX_OUTPUT_TOKENS } from '@/lib/ai/cost';
import type { GenerateResult, ProviderClient } from '@/lib/ai/providers/types';
import type { GenerationRoute } from '@/lib/ai/providers/byok';
import { createFakeLedgerAdmin } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

const usage = (outputTokens: number, thoughtsTokens: number | null | undefined) =>
  ({ outputTokens, thoughtsTokens: thoughtsTokens as number | null });

describe('classifyCappedReason boundaries (existing classifier)', () => {
  it('a limit below the per-request cap is balance, even with heavy thinking', () => {
    expect(classifyCappedReason({ maxOutputTokens: 2047, usage: usage(10, 5000) })).toBe('balance');
    expect(classifyCappedReason({ maxOutputTokens: 1, usage: usage(1, null) })).toBe('balance');
  });

  it.each([2048, 8192])('at %i: thoughts >= output is thinking, otherwise request_limit', (max) => {
    expect(PER_REQUEST_MAX_OUTPUT_TOKENS).toBe(2048);
    expect(BYOK_MAX_OUTPUT_TOKENS).toBe(8192);
    expect(classifyCappedReason({ maxOutputTokens: max, usage: usage(100, null) })).toBe('request_limit');
    expect(classifyCappedReason({ maxOutputTokens: max, usage: usage(100, undefined) })).toBe('request_limit');
    expect(classifyCappedReason({ maxOutputTokens: max, usage: usage(100, 99) })).toBe('request_limit');
    expect(classifyCappedReason({ maxOutputTokens: max, usage: usage(100, 100) })).toBe('thinking');
    expect(classifyCappedReason({ maxOutputTokens: max, usage: usage(100, 101) })).toBe('thinking');
  });
});

describe('cappedCompletionFields', () => {
  it('only max_tokens is capped and carries a reason', () => {
    expect(cappedCompletionFields({ maxOutputTokens: 2047, finishReason: 'max_tokens', usage: usage(10, null) }))
      .toEqual({ wasCapped: true, cappedReason: 'balance' });
    expect(cappedCompletionFields({ maxOutputTokens: 2048, finishReason: 'max_tokens', usage: usage(10, 10) }))
      .toEqual({ wasCapped: true, cappedReason: 'thinking' });
    expect(cappedCompletionFields({ maxOutputTokens: 8192, finishReason: 'max_tokens', usage: usage(10, 1) }))
      .toEqual({ wasCapped: true, cappedReason: 'request_limit' });
  });

  it.each(['stop', 'refusal', 'other'] as GenerateResult['finishReason'][])('%s is not capped and has no reason', (finishReason) => {
    const fields = cappedCompletionFields({ maxOutputTokens: 2047, finishReason, usage: usage(10, 100) });
    expect(fields).toEqual({ wasCapped: false });
    expect('cappedReason' in fields).toBe(false);
  });

  it('BYOK 8192 is never classified as balance', () => {
    for (const t of [null, 0, 5000, 8192]) {
      const fields = cappedCompletionFields({ maxOutputTokens: BYOK_MAX_OUTPUT_TOKENS, finishReason: 'max_tokens', usage: usage(8192, t) });
      expect(fields.cappedReason).not.toBe('balance');
    }
  });
});

describe('cappedPresentation', () => {
  it('uncapped results have no presentation', () => {
    expect(cappedPresentation({})).toBeNull();
    expect(cappedPresentation({ wasCapped: false })).toBeNull();
    expect(cappedPresentation({ wasCapped: false, cappedReason: 'thinking' })).toBeNull();
  });

  it('capped results reuse the existing copy for their reason', () => {
    for (const reason of ['balance', 'thinking', 'request_limit'] as const) {
      expect(cappedPresentation({ wasCapped: true, cappedReason: reason })).toEqual(CAPPED_COPY[reason]);
    }
  });

  it('legacy capped results without a reason fall back to balance', () => {
    expect(cappedPresentation({ wasCapped: true })).toEqual(CAPPED_COPY.balance);
  });

  it('BYOK request_limit copy does not say tokens are exhausted', () => {
    const p = cappedPresentation(cappedCompletionFields({ maxOutputTokens: 8192, finishReason: 'max_tokens', usage: usage(8192, 0) }))!;
    expect(p).toEqual(CAPPED_COPY.request_limit);
    expect([p.title, p.body, p.toast].join(' ')).not.toContain('소진');
  });
});

// ── Real chat() wiring ──────────────────────────────────────────────────────

const OWNER = '10000000-0000-4000-8000-000000000011';
const base: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000011', chapterId: '30000000-0000-4000-8000-000000000011',
  providerId: 'gemini', model: 'gemini-3.5-flash', mentionedNodeIds: [], presetLevel: 'beginner', styleId: 'concise-hemingway',
  genre: '판타지', precedingText: '어느 날', chatHistory: [{ role: 'user', content: '이어서 써줘' }], idempotencyKey: '',
};
const session = {
  rpc: async () => ({ data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null }),
} as unknown as SupabaseClient;

const result = (finishReason: GenerateResult['finishReason'], outputTokens: number, thoughtsTokens: number | null): GenerateResult =>
  ({ ...okResult('[REPLY]\n잘린 응답', 10, outputTokens, thoughtsTokens), finishReason });

function useBalance(balance: number) {
  const admin = createFakeLedgerAdmin({ balances: { [OWNER]: balance } });
  adminState.client = admin.client;
}

async function runService(balance: number, gen: GenerateResult) {
  useBalance(balance);
  const provider = createMockProvider({ generateContent: async () => gen });
  const res = await chat(session, provider as unknown as ProviderClient, { ...base, idempotencyKey: crypto.randomUUID() });
  return { res, max: provider.generateContent.mock.calls[0]?.[0].maxOutputTokens as number };
}

async function runByok(gen: GenerateResult) {
  useBalance(0);
  const platform = createMockProvider();
  const byokClient = createMockProvider({ generateContent: async () => gen });
  const route: GenerationRoute = {
    kind: 'byok', keyId: 'key-1', selection: { providerId: 'gemini', model: 'gemini-3.5-flash' } as never,
    client: byokClient as unknown as ProviderClient,
  };
  const res = await chat(session, platform as unknown as ProviderClient, { ...base, idempotencyKey: crypto.randomUUID(), route });
  expect(platform.generateContent).not.toHaveBeenCalled();
  return { res, max: byokClient.generateContent.mock.calls[0]?.[0].maxOutputTokens as number };
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('chat() returns the shared capped fields (11-11)', () => {
  it('service with a low balance → balance', async () => {
    const { res, max } = await runService(1, result('max_tokens', 5, 50));
    expect(res.status).toBe('completed');
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(PER_REQUEST_MAX_OUTPUT_TOKENS);
    expect(res).toMatchObject({ wasCapped: true, cappedReason: 'balance' });
  });

  it('service at 2048 with thoughts >= output → thinking', async () => {
    const { res, max } = await runService(100000, result('max_tokens', 300, 300));
    expect(max).toBe(PER_REQUEST_MAX_OUTPUT_TOKENS);
    expect(res).toMatchObject({ status: 'completed', wasCapped: true, cappedReason: 'thinking' });
  });

  it('service at 2048 with little thinking → request_limit', async () => {
    const { res, max } = await runService(100000, result('max_tokens', 2048, null));
    expect(max).toBe(PER_REQUEST_MAX_OUTPUT_TOKENS);
    expect(res).toMatchObject({ status: 'completed', wasCapped: true, cappedReason: 'request_limit' });
    expect(cappedPresentation(res)).toEqual(CAPPED_COPY.request_limit);
  });

  it('BYOK 8192 cap is request_limit, not balance (even with an empty wallet)', async () => {
    const { res, max } = await runByok(result('max_tokens', 8192, 0));
    expect(max).toBe(BYOK_MAX_OUTPUT_TOKENS);
    expect(res).toMatchObject({ status: 'completed', wasCapped: true, cappedReason: 'request_limit' });
    expect(cappedPresentation(res)).toEqual(CAPPED_COPY.request_limit);
  });

  it('BYOK 8192 with heavy thinking → thinking', async () => {
    const { res } = await runByok(result('max_tokens', 100, 8000));
    expect(res).toMatchObject({ status: 'completed', wasCapped: true, cappedReason: 'thinking' });
  });

  it.each([['service', false], ['byok', true]] as const)('%s normal stop has no cap fields or presentation', async (_n, byok) => {
    const gen = result('stop', 10, 500);
    const { res } = byok ? await runByok(gen) : await runService(1, gen);
    expect(res.status).toBe('completed');
    expect(res.wasCapped).toBe(false);
    expect('cappedReason' in res).toBe(false);
    expect(cappedPresentation(res)).toBeNull();
  });
});
