import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 04-09 Task 2 (EDIT-03/EDIT-04): the real chat() general path puts the freeform custom
 * instruction and the server-read work instruction into generateContent.systemInstruction.
 * Paid-generation preflight/settle are mocked at the boundary (no DB helper, no wallet).
 * The provider is a mock; no external AI call.
 */

const h = vi.hoisted(() => ({ preflight: vi.fn(), settle: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/paid-generation', () => ({ preflightPaidGeneration: h.preflight, settlePaidGeneration: h.settle }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import {
  BASELINE_SYSTEM_PROMPT, composeSystemInstruction, PRESET_INSTRUCTIONS, RESPONSE_PROTOCOL_INSTRUCTIONS,
} from '@/lib/ai/prompt';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createMockProvider } from '../helpers/mock-provider';

const CUSTOM = 'CUSTOM-SENTINEL: 모든 문장을 현재형으로 쓰세요.';
const WORK = 'WORK-SENTINEL: 주인공은 존댓말을 쓴다.';

const base: ChatInput = {
  ownerId: '10000000-0000-4000-8000-000000000001', workId: '20000000-0000-4000-8000-000000000001',
  chapterId: '30000000-0000-4000-8000-000000000001', providerId: 'gemini', model: 'gemini-3.5-flash',
  mentionedNodeIds: [], presetLevel: 'freeform', styleId: 'concise-hemingway', genre: '판타지',
  precedingText: '어느 날', chatHistory: [{ role: 'user', content: '이어서 써줘' }],
  idempotencyKey: '60000000-0000-4000-8000-000000000001',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.preflight.mockResolvedValue({ ok: true, ctx: { admin: {}, walletBalance: 900, model: 'gemini-3.5-flash', maxOutputTokens: 2048 } });
  h.settle.mockImplementation(async (_client, _ctx, _id, generate) => ({ kind: 'completed', result: await generate(), debitAmount: 1, remainingBalance: 899 }));
});

async function capture(input: ChatInput): Promise<string> {
  const provider = createMockProvider();
  const result = await chat({} as never, provider as unknown as ProviderClient, input);
  expect(result.status).toBe('completed');
  expect(provider.generateContent).toHaveBeenCalledTimes(1);
  return provider.generateContent.mock.calls[0][0].systemInstruction as string;
}

describe('general chat() systemInstruction carries the two instructions', () => {
  it('freeform: custom replaces the preset line and the work block follows the baseline', async () => {
    const sys = await capture({ ...base, customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).toContain(CUSTOM);
    expect(sys).toContain(WORK);
    expect(sys).not.toContain(PRESET_INSTRUCTIONS.freeform);
    expect(sys.startsWith(BASELINE_SYSTEM_PROMPT)).toBe(true);
    expect(sys.endsWith(RESPONSE_PROTOCOL_INSTRUCTIONS)).toBe(true);
    expect(sys.indexOf(WORK)).toBeLessThan(sys.indexOf(CUSTOM));
  });

  it('intermediate: work instruction applies, custom does not', async () => {
    const sys = await capture({ ...base, presetLevel: 'intermediate', customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).toContain(WORK);
    expect(sys).not.toContain(CUSTOM);
    expect(sys).toContain(PRESET_INSTRUCTIONS.intermediate);
  });

  it('beginner: neither instruction applies', async () => {
    const sys = await capture({ ...base, presetLevel: 'beginner', customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).toBe(composeSystemInstruction({ presetLevel: 'beginner', styleId: base.styleId, genre: base.genre }));
  });

  it('document (설정 문서) context carries the instructions too', async () => {
    const sys = await capture({ ...base, chapterId: undefined, nodeId: '70000000-0000-4000-8000-000000000001', contextKind: 'document', customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).toContain(CUSTOM);
    expect(sys).toContain(WORK);
  });

  it('keeps the preflight → settle order and does not leak instructions into settlement identity', async () => {
    await capture({ ...base, customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(h.preflight).toHaveBeenCalledTimes(1);
    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(h.preflight.mock.invocationCallOrder[0]).toBeLessThan(h.settle.mock.invocationCallOrder[0]);
    const serialized = JSON.stringify([h.preflight.mock.calls, h.settle.mock.calls.map((c) => c.slice(1, 3))]);
    expect(serialized).not.toContain('CUSTOM-SENTINEL');
    expect(serialized).not.toContain('WORK-SENTINEL');
  });
});
