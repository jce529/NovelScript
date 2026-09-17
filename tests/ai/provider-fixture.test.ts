import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * 08-08 Development-only provider fixture: env gating (inert outside
 * NODE_ENV=development), canned results/errors, and the drop-response hook
 * in chatAction (throws once per idempotencyKey after chat() completed).
 */

const h = vi.hoisted(() => ({
  chat: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'session-user' } }, error: null }) },
  }),
}));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: vi.fn() }));
vi.mock('@/lib/kb/actions', () => ({ saveNodeContent: vi.fn() }));

import { createFixtureProvider, readProviderFixture, PROVIDER_FIXTURE_MODES } from '@/lib/ai/providers/fixture';
import { createPlatformProvider } from '@/lib/ai/providers/registry';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import { estimateGeminiInputTokens } from '@/lib/ai/token-estimate';
import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';

const PARAMS = { model: 'm', systemInstruction: 'sys', contents: 'hello', maxOutputTokens: 100, temperature: 0.7 };
const OK_TEXT = '[REPLY]\n(개발용 고정 응답)\n[DRAFT]\n개발용 고정 초안 문단입니다.\n[/DRAFT]';

describe('readProviderFixture', () => {
  it('is null outside development', () => {
    expect(readProviderFixture({ NODE_ENV: 'production', AI_PROVIDER_FIXTURE: 'refusal-input' })).toBeNull();
    expect(readProviderFixture({ NODE_ENV: 'test', AI_PROVIDER_FIXTURE: 'refusal-input' })).toBeNull();
    expect(readProviderFixture({ AI_PROVIDER_FIXTURE: 'refusal-input' })).toBeNull();
  });

  it('returns known modes in development only', () => {
    expect(readProviderFixture({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'refusal-output' })).toBe('refusal-output');
    expect(readProviderFixture({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'bogus' })).toBeNull();
    expect(readProviderFixture({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: '' })).toBeNull();
    expect(readProviderFixture({ NODE_ENV: 'development' })).toBeNull();
  });
});

describe('createPlatformProvider with fixture', () => {
  it('ignores fixture in production (still config error without key)', () => {
    let caught: unknown;
    try {
      createPlatformProvider({ NODE_ENV: 'production', AI_PROVIDER_FIXTURE: 'rate_limited' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProviderCallError);
    expect((caught as ProviderCallError).info.kind).toBe('config');
  });

  it('returns fixture provider in development without key', () => {
    const p = createPlatformProvider({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'unavailable' });
    expect(p.provider).toBe('gemini');
  });
});

describe('createFixtureProvider', () => {
  it('refusal-input', async () => {
    const r = await createFixtureProvider('refusal-input').generateContent(PARAMS);
    expect(r).toEqual({
      text: '',
      finishReason: 'refusal',
      refusal: { stage: 'input', reasonCode: 'SAFETY' },
      usage: { inputTokens: 4800, outputTokens: 0, thoughtsTokens: null, reported: { input: true, output: false } },
    });
  });

  it('refusal-output', async () => {
    const r = await createFixtureProvider('refusal-output').generateContent(PARAMS);
    expect(r.finishReason).toBe('refusal');
    expect(r.refusal).toEqual({ stage: 'output', reasonCode: 'RECITATION' });
    expect(r.usage.inputTokens).toBe(4800);
    expect(r.usage.outputTokens).toBe(40);
  });

  it.each([
    ['rate_limited', 429, 'RESOURCE_EXHAUSTED'],
    ['unavailable', 503, 'UNAVAILABLE'],
    ['config', 401, 'UNAUTHENTICATED'],
  ] as const)('%s rejects with ProviderCallError', async (mode, status, code) => {
    const err = await createFixtureProvider(mode).generateContent(PARAMS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderCallError);
    expect((err as ProviderCallError).info).toEqual({ provider: 'gemini', status, kind: mode, providerErrorCode: code });
  });

  it('slow resolves after delay with canned ok result', async () => {
    const start = Date.now();
    const r = await createFixtureProvider('slow', { delayMs: 10 }).generateContent(PARAMS);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
    expect(r.text).toBe(OK_TEXT);
    expect(r.finishReason).toBe('stop');
    expect(r.refusal).toBeNull();
    expect(r.usage.inputTokens).toBe(400);
    expect(r.usage.outputTokens).toBe(200);
  });

  it('drop-response resolves with canned ok result', async () => {
    const r = await createFixtureProvider('drop-response').generateContent(PARAMS);
    expect(r.text).toBe(OK_TEXT);
    expect(r.finishReason).toBe('stop');
  });

  it('estimateInputTokens matches Gemini estimator for all modes', () => {
    for (const mode of PROVIDER_FIXTURE_MODES) {
      expect(createFixtureProvider(mode).estimateInputTokens('sys', 'contents text')).toBe(
        estimateGeminiInputTokens('sys', 'contents text'),
      );
    }
  });
});

describe('chatAction drop-response hook', () => {
  const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';
  const KEY2 = '7f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';
  const input = (key: string) =>
    ({
      workId: 'w1',
      chapterId: 'c1',
      modelTier: 'lite',
      mentionedNodeIds: [],
      presetLevel: 'balanced',
      styleId: 'default',
      genre: 'fantasy',
      precedingText: '',
      chatHistory: [{ role: 'user', content: 'hi' }],
      idempotencyKey: key,
    }) as unknown as Parameters<typeof chatAction>[0];

  afterEach(() => {
    vi.unstubAllEnvs();
    h.chat.mockReset();
  });

  it('throws once per key in development, then returns result', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AI_PROVIDER_FIXTURE', 'drop-response');
    const result = { ok: true, status: 'completed' };
    h.chat.mockResolvedValue(result);
    await expect(chatAction(input(KEY))).rejects.toThrow();
    await expect(chatAction(input(KEY))).resolves.toEqual(result);
  });

  it('never throws in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AI_PROVIDER_FIXTURE', 'drop-response');
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    const result = { ok: true, status: 'completed' };
    h.chat.mockResolvedValue(result);
    await expect(chatAction(input(KEY2))).resolves.toEqual(result);
    await expect(chatAction(input(KEY2))).resolves.toEqual(result);
  });
});
