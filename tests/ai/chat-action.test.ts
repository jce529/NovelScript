import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_COPY } from '@/lib/ai/chat-result';

/*
 * 08-05 Server Action boundary for chatAction: session-derived owner, UUID
 * idempotencyKey validation, and registry config failures (sanitized logs).
 */

const h = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  chatResult: { ok: true, status: 'completed', reply: 'r', remainingBalance: 9 },
  chat: vi.fn(),
  createPlatformProvider: vi.fn(),
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
  }),
}));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/ai/providers/registry', () => ({ createPlatformProvider: h.createPlatformProvider }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: vi.fn() }));
vi.mock('@/lib/kb/actions', () => ({ saveNodeContent: vi.fn() }));

import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { ProviderCallError } from '@/lib/ai/providers/errors';

const SESSION_USER = 'session-user';
const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: 'w1',
    chapterId: 'c1',
    modelTier: 'lite',
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
  h.createPlatformProvider.mockReset();
  h.createPlatformProvider.mockImplementation(() => ({ provider: 'gemini' }));
  errorSpy?.mockRestore();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('chatAction boundary', () => {
  it('rejects unauthenticated callers before provider or chat', async () => {
    h.sessionUserId = null;
    const result = await chatAction(validInput());
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'unauthenticated', error: '로그인이 필요해요.' });
    expect(h.createPlatformProvider).not.toHaveBeenCalled();
    expect(h.chat).not.toHaveBeenCalled();
  });

  it.each([
    ['not-a-uuid', { idempotencyKey: 'not-a-uuid' }],
    ['empty', { idempotencyKey: '' }],
    ['missing', { idempotencyKey: undefined }],
    ['number', { idempotencyKey: 12345 }],
    ['bad modelTier', { modelTier: 'ultra' }],
  ])('rejects invalid input (%s)', async (_label, overrides) => {
    const result = await chatAction(validInput(overrides));
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input });
    expect(h.createPlatformProvider).not.toHaveBeenCalled();
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

  it('maps a ProviderCallError config failure to config copy with sanitized log', async () => {
    h.createPlatformProvider.mockImplementation(() => {
      throw new ProviderCallError({ provider: 'gemini', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
    });
    const result = await chatAction(validInput());
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('[ai] provider call failed', {
      provider: 'gemini',
      status: null,
      kind: 'config',
      idempotencyKey: KEY,
    });
    expect(h.chat).not.toHaveBeenCalled();
  });

  it('never leaks a plain Error message into logs or result', async () => {
    h.createPlatformProvider.mockImplementation(() => {
      throw new Error('GEMINI_API_KEY sk-SENTINEL');
    });
    const result = await chatAction(validInput());
    expect(result.failureKind).toBe('config');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sk-SENTINEL');
    expect(JSON.stringify(result)).not.toContain('sk-SENTINEL');
    expect(h.chat).not.toHaveBeenCalled();
  });
});
