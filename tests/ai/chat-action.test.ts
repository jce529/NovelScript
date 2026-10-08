import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { BYOK_COPY } from '@/lib/ai/providers/byok-copy';

/*
 * 08-05 Server Action boundary for chatAction: session-derived owner, UUID
 * idempotencyKey validation, and registry config failures (sanitized logs).
 */

const h = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  chatResult: { ok: true, status: 'completed', reply: 'r', remainingBalance: 9 },
  chat: vi.fn(),
  resolveRoute: vi.fn(),
  client: { provider: 'gemini', generateContent: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sessionUserId
          ? { data: { user: { id: h.sessionUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: () => {
      const query: Record<string, unknown> = {
        select: () => query, eq: () => query, is: () => query,
        maybeSingle: async () => ({ data: { id: 'owned-resource' }, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/ai/providers/byok', () => ({ resolveGenerationRoute: h.resolveRoute }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: vi.fn() }));
vi.mock('@/lib/kb/actions', () => ({ saveNodeContent: vi.fn() }));
vi.mock('@/lib/ai/decision/activation', () => ({ getAiDocPlanningMode: vi.fn(async () => ({ mode: 'off' })) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { ProviderCallError } from '@/lib/ai/providers/errors';

const SESSION_USER = 'session-user';
const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: 'w1',
    chapterId: 'c1',
    providerId: 'gemini',
    model: 'gemini-3.5-flash',
    mentionedNodeIds: [],
    presetLevel: 'balanced',
    styleId: 'default',
    genre: 'fantasy',
    precedingText: '',
    chatHistory: [{ role: 'user', content: 'hi' }],
    idempotencyKey: KEY,
    ...overrides,
  } as unknown as Parameters<typeof chatAction>[0];
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.sessionUserId = SESSION_USER;
  h.chat.mockReset();
  h.chat.mockImplementation(async () => h.chatResult);
  h.resolveRoute.mockReset();
  h.resolveRoute.mockImplementation(async ({ selection }: { selection: { providerId: string; model: string; keySource: string } }) => ({ kind: selection.keySource, selection, client: h.client, keyId: 'server-key' }));
  errorSpy?.mockRestore();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('chatAction boundary', () => {
  it('uses the shared BYOK pending copy', async () => {
    expect(CHAT_COPY.byokPending).toBe(BYOK_COPY.sendBoundary);
  });

  it('returns replacement_required for unavailable BYOK before chat', async () => {
    h.resolveRoute.mockResolvedValueOnce({ kind: 'replacement_required', replacement: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' } });
    const result = await chatAction(validInput({ keySource: 'byok' }));
    expect(result).toMatchObject({ kind: 'replacement_required', replacement: { keySource: 'service' } });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('rejects an unknown key source', async () => {
    const result = await chatAction(validInput({ keySource: 'x' }));
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('sends an explicit service selection without forwarding keySource', async () => {
    await chatAction(validInput({ keySource: 'service', ownerId: 'forged' }));
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.chat.mock.calls[0][2]).not.toHaveProperty('keySource');
    expect(h.chat.mock.calls[0][2].ownerId).toBe(SESSION_USER);
    expect(h.chat.mock.calls[0][2].route).toMatchObject({ kind: 'service', selection: { keySource: 'service' } });
  });

  it('re-resolves only the exact proposed service selection after explicit consent and preserves request identity', async () => {
    const replacement = { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' as const };
    h.resolveRoute.mockResolvedValueOnce({ kind: 'replacement_required', replacement });
    await chatAction(validInput({
      keySource: 'byok', replacementConsent: true, replacementSelection: replacement,
      chatHistory: [{ role: 'user', content: 'same snapshot' }],
    }));
    expect(h.resolveRoute).toHaveBeenNthCalledWith(2, expect.objectContaining({ selection: replacement, ownerId: SESSION_USER }));
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(h.chat.mock.calls[0][2]).toMatchObject({
      idempotencyKey: KEY, chatHistory: [{ role: 'user', content: 'same snapshot' }],
      route: { kind: 'service', selection: replacement },
    });
  });

  it('treats missing keySource as service', async () => {
    await chatAction(validInput());
    expect(h.chat).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated callers before provider or chat', async () => {
    h.sessionUserId = null;
    const result = await chatAction(validInput());
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'unauthenticated', error: '로그인이 필요해요.' });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it.each([
    ['not-a-uuid', { idempotencyKey: 'not-a-uuid' }],
    ['empty', { idempotencyKey: '' }],
    ['missing', { idempotencyKey: undefined }],
    ['number', { idempotencyKey: 12345 }],
    ['bad provider', { providerId: 'unknown' }],
    ['model from another provider', { providerId: 'gemini', model: 'gpt-4o-mini' }],
  ])('rejects invalid input (%s)', async (_label, overrides) => {
    const result = await chatAction(validInput(overrides));
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('ignores a forged ownerId and forwards the key unchanged', async () => {
    const result = await chatAction(validInput({ ownerId: 'attacker-id' }));
    expect(h.chat).toHaveBeenCalledTimes(1);
    const third = h.chat.mock.calls[0][2];
    expect(third).toEqual(expect.objectContaining({ ownerId: SESSION_USER, idempotencyKey: KEY }));
    expect(third.ownerId).not.toBe('attacker-id');
    expect(result).toBe(h.chatResult);
  });

  it.each([
    ['openai', 'gpt-4o-mini'],
    ['anthropic', 'claude-sonnet-5'],
  ] as const)('passes %s model to the provider and chat', async (providerId, model) => {
    await chatAction(validInput({ providerId, model }));
    expect(h.chat.mock.calls[0][2]).toEqual(expect.objectContaining({ providerId, model }));
  });

  it('reports the selected provider for an unexpected config error', async () => {
    h.resolveRoute.mockRejectedValueOnce(new Error('secret'));
    await chatAction(validInput({ providerId: 'anthropic', model: 'claude-sonnet-5' }));
    expect(errorSpy).toHaveBeenCalledWith('[ai] generation route unavailable', expect.objectContaining({ provider: 'anthropic' }));
  });

  it('maps a ProviderCallError config failure to config copy with sanitized log', async () => {
    h.resolveRoute.mockRejectedValueOnce(new ProviderCallError({ provider: 'gemini', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' }));
    const result = await chatAction(validInput());
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ai] generation route unavailable', { provider: 'gemini', idempotencyKey: KEY });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('never leaks a plain Error message into logs or result', async () => {
    h.resolveRoute.mockRejectedValueOnce(new Error('GEMINI_API_KEY sk-SENTINEL'));
    const result = await chatAction(validInput());
    expect(result.failureKind).toBe('config');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sk-SENTINEL');
    expect(JSON.stringify(result)).not.toContain('sk-SENTINEL');
    expect(h.chat).not.toHaveBeenCalled();
  });
});
