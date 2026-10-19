import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// 11-10 Task 3 (EDIT-03 support only): the general chat() path forwards ChatInput.customInstruction
// and ChatInput.workSystemInstruction to composeSystemInstruction (04-07 contract), so they reach
// the real generateContent.systemInstruction. Offline: fake ledger admin + mock provider, no DB.

const adminState = vi.hoisted(() => ({ client: null as unknown }));
const usageWrites = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: async (...args: unknown[]) => { usageWrites.calls.push(args); return { ok: true }; } }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import { composeSystemInstruction, PRESET_INSTRUCTIONS } from '@/lib/ai/prompt';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin } from '../helpers/fake-ledger-admin';
import { createMockProvider } from '../helpers/mock-provider';

const OWNER = '10000000-0000-4000-8000-000000000001';
const KEY = '60000000-0000-4000-8000-000000000001';
const CUSTOM = 'CUSTOM-SENTINEL: 모든 문장을 현재형으로 쓰세요.';
const WORK = 'WORK-SENTINEL: 주인공은 존댓말을 쓴다.';

const base: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000001', chapterId: '30000000-0000-4000-8000-000000000001',
  providerId: 'gemini', model: 'gemini-3.5-flash', mentionedNodeIds: [], presetLevel: 'beginner', styleId: 'concise-hemingway',
  genre: '판타지', precedingText: '어느 날', chatHistory: [{ role: 'user', content: '이어서 써줘' }], idempotencyKey: KEY,
};
const session = {
  rpc: async () => ({ data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null }),
} as unknown as SupabaseClient;

let admin: ReturnType<typeof createFakeLedgerAdmin>;
beforeEach(() => {
  vi.restoreAllMocks();
  usageWrites.calls = [];
  admin = createFakeLedgerAdmin({ balances: { [OWNER]: 1000 } });
  adminState.client = admin.client;
});

async function capture(input: ChatInput): Promise<string> {
  const provider = createMockProvider();
  const result = await chat(session, provider as unknown as ProviderClient, input);
  expect(result.status).toBe('completed');
  expect(provider.generateContent).toHaveBeenCalledTimes(1);
  return provider.generateContent.mock.calls[0][0].systemInstruction as string;
}

describe('chat() forwards the two instructions to the real systemInstruction (11-10)', () => {
  it('freeform customInstruction replaces the preset instruction', async () => {
    const sys = await capture({ ...base, presetLevel: 'freeform', customInstruction: CUSTOM });
    expect(sys).toContain(CUSTOM);
    expect(sys).not.toContain(PRESET_INSTRUCTIONS.freeform);
  });

  it('intermediate workSystemInstruction is included', async () => {
    const sys = await capture({ ...base, presetLevel: 'intermediate', workSystemInstruction: WORK });
    expect(sys).toContain(WORK);
  });

  it('freeform carries both instructions', async () => {
    const sys = await capture({ ...base, presetLevel: 'freeform', customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).toContain(CUSTOM);
    expect(sys).toContain(WORK);
  });

  it('beginner applies neither instruction', async () => {
    const sys = await capture({ ...base, presetLevel: 'beginner', customInstruction: CUSTOM, workSystemInstruction: WORK });
    expect(sys).not.toContain(CUSTOM);
    expect(sys).not.toContain(WORK);
    expect(sys).toBe(composeSystemInstruction({ presetLevel: 'beginner', styleId: base.styleId, genre: base.genre }));
  });

  it.each([
    ['absent', {}],
    ['null', { customInstruction: null, workSystemInstruction: null }],
    ['undefined', { customInstruction: undefined, workSystemInstruction: undefined }],
    ['blank', { customInstruction: '   ', workSystemInstruction: '\n\t ' }],
  ] as const)('%s fields keep the pre-existing output for every preset', async (_name, extra) => {
    for (const presetLevel of ['beginner', 'intermediate', 'freeform'] as const) {
      const sys = await capture({ ...base, presetLevel, idempotencyKey: crypto.randomUUID(), ...extra });
      expect(sys).toBe(composeSystemInstruction({ presetLevel, styleId: base.styleId, genre: base.genre }));
    }
  });

  it('the instructions do not change billing and are never written to usage or settlement', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await capture({ ...base, presetLevel: 'freeform', customInstruction: CUSTOM, workSystemInstruction: WORK });
    const settle = admin.rpc.mock.calls.filter(c => c[0] === 'settle_service_ai_generation');
    expect(settle).toHaveLength(1);
    const serialized = JSON.stringify([settle, admin.state.usage, admin.state.ledger, usageWrites.calls, logSpy.mock.calls]);
    expect(serialized).not.toContain('CUSTOM-SENTINEL');
    expect(serialized).not.toContain('WORK-SENTINEL');
    const lease = admin.rpc.mock.calls.filter(c => c[0] === 'acquire_ai_generation_lock');
    expect(lease).toHaveLength(1);
  });
});
