import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateContentResponse } from '@google/genai';
import { createGeminiProvider, mapGeminiResponse } from '@/lib/ai/providers/gemini';
import { createPlatformProvider } from '@/lib/ai/providers/registry';
import { ProviderCallError, toSanitizedProviderError } from '@/lib/ai/providers/errors';
import { estimateGeminiInputTokens } from '@/lib/ai/token-estimate';

const sdk = vi.hoisted(() => ({
  ctorOptions: [] as unknown[],
  generateContent: vi.fn(),
  countTokens: vi.fn(),
}));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class FakeGoogleGenAI {
    models = { generateContent: sdk.generateContent, countTokens: sdk.countTokens };
    constructor(opts: unknown) {
      sdk.ctorOptions.push(opts);
    }
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});

const fx = (o: unknown) => o as unknown as GenerateContentResponse;
const fullUsage = { promptTokenCount: 120, candidatesTokenCount: 30, totalTokenCount: 400, thoughtsTokenCount: 250 };
const mappedFullUsage = { inputTokens: 120, outputTokens: 30, thoughtsTokens: 250, reported: { input: true, output: true } };

describe('mapGeminiResponse', () => {
  it('maps STOP text parts and usage (never totalTokenCount)', () => {
    const r = mapGeminiResponse(
      fx({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '[REPLY]\n안녕' }, { text: '하세요' }] } }],
        usageMetadata: fullUsage,
      }),
    );
    expect(r).toEqual({ text: '[REPLY]\n안녕하세요', finishReason: 'stop', refusal: null, usage: mappedFullUsage });
  });

  it('excludes thought parts from text', () => {
    const r = mapGeminiResponse(
      fx({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'THINK', thought: true }, { text: 'answer' }] } }] }),
    );
    expect(r.text).toBe('answer');
  });

  it('MAX_TOKENS → max_tokens with text preserved', () => {
    const r = mapGeminiResponse(fx({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'cut' }] } }] }));
    expect(r).toMatchObject({ finishReason: 'max_tokens', text: 'cut', refusal: null });
  });

  it.each(['LANGUAGE', 'OTHER', 'MALFORMED_FUNCTION_CALL', undefined])('finishReason %s → other, not refusal', (fr) => {
    const r = mapGeminiResponse(fx({ candidates: [{ finishReason: fr, content: { parts: [{ text: 'keep' }] } }] }));
    expect(r).toMatchObject({ finishReason: 'other', text: 'keep', refusal: null });
  });

  it.each([[[]], [undefined]])('(A) prompt blocked (candidates %j) → input refusal without message', (candidates) => {
    const r = mapGeminiResponse(
      fx({ candidates, promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'BLOCKED-SENTINEL' }, usageMetadata: fullUsage }),
    );
    expect(r).toEqual({ text: '', finishReason: 'refusal', refusal: { stage: 'input', reasonCode: 'SAFETY' }, usage: mappedFullUsage });
    expect(JSON.stringify(r)).not.toContain('BLOCKED-SENTINEL');
  });

  it.each([
    ['BLOCKLIST', 'BLOCKLIST'],
    ['PROHIBITED_CONTENT', 'PROHIBITED_CONTENT'],
    ['IMAGE_SAFETY', 'IMAGE_SAFETY'],
    ['OTHER', 'OTHER'],
    ['JAILBREAK', 'OTHER'],
    ['MODEL_ARMOR', 'OTHER'],
    ['SOMETHING_NEW', 'OTHER'],
  ])('(A) blockReason %s → reasonCode %s', (blockReason, reasonCode) => {
    const r = mapGeminiResponse(fx({ candidates: [], promptFeedback: { blockReason } }));
    expect(r.refusal).toEqual({ stage: 'input', reasonCode });
  });

  it('(A) BLOCKED_REASON_UNSPECIFIED with no candidates → no refusal', () => {
    const r = mapGeminiResponse(fx({ candidates: [], promptFeedback: { blockReason: 'BLOCKED_REASON_UNSPECIFIED' } }));
    expect(r).toMatchObject({ refusal: null, finishReason: 'other', text: '' });
  });

  it.each(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION'])(
    '(B) finishReason %s → output refusal, partial text dropped',
    (fr) => {
      const r = mapGeminiResponse(
        fx({ candidates: [{ finishReason: fr, content: { parts: [{ text: 'PARTIAL-SENTINEL' }] } }], usageMetadata: fullUsage }),
      );
      expect(r).toEqual({ text: '', finishReason: 'refusal', refusal: { stage: 'output', reasonCode: fr }, usage: mappedFullUsage });
      expect(JSON.stringify(r)).not.toContain('PARTIAL-SENTINEL');
    },
  );

  it('(C) prose refusal under STOP is not a refusal', () => {
    const r = mapGeminiResponse(fx({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: "I can't help with that." }] } }] }));
    expect(r).toMatchObject({ refusal: null, text: "I can't help with that.", finishReason: 'stop' });
  });

  it('usageMetadata absent → unreported zeros', () => {
    const r = mapGeminiResponse(fx({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'x' }] } }] }));
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, thoughtsTokens: null, reported: { input: false, output: false } });
  });

  it('partial usage → only input reported', () => {
    const r = mapGeminiResponse(fx({ candidates: [], usageMetadata: { promptTokenCount: 15 } }));
    expect(r.usage).toEqual({ inputTokens: 15, outputTokens: 0, thoughtsTokens: null, reported: { input: true, output: false } });
  });

  it.each([-1, 1.5, '12', NaN])('invalid count %s → unreported', (bad) => {
    const r = mapGeminiResponse(
      fx({ candidates: [], usageMetadata: { promptTokenCount: bad, candidatesTokenCount: bad, thoughtsTokenCount: bad } }),
    );
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0, thoughtsTokens: null, reported: { input: false, output: false } });
  });
});

describe('createGeminiProvider', () => {
  beforeEach(() => {
    sdk.ctorOptions.length = 0;
    sdk.generateContent.mockReset();
  });

  afterAll(() => {
    expect(sdk.countTokens).not.toHaveBeenCalled();
  });

  it('constructs the SDK with a single attempt (no hidden retry)', () => {
    createGeminiProvider({ apiKey: 'k' });
    expect(sdk.ctorOptions).toEqual([{ apiKey: 'k', httpOptions: { retryOptions: { attempts: 1 } } }]);
  });

  it('sends the unchanged call shape and maps the response', async () => {
    const sdkResponse = fx({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: fullUsage,
    });
    sdk.generateContent.mockResolvedValue(sdkResponse);
    const provider = createGeminiProvider({ apiKey: 'k' });
    expect(provider.provider).toBe('gemini');
    const result = await provider.generateContent({
      model: 'gemini-3.5-flash',
      systemInstruction: 'S',
      contents: 'C',
      maxOutputTokens: 512,
      temperature: 0.9,
    });
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    expect(sdk.generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash',
      contents: 'C',
      config: { systemInstruction: 'S', maxOutputTokens: 512, temperature: 0.9 },
    });
    expect(result).toEqual(mapGeminiResponse(sdkResponse));
  });

  it('estimateInputTokens is offline and matches the estimator', () => {
    const provider = createGeminiProvider({ apiKey: 'k' });
    expect(provider.estimateInputTokens('S', 'C')).toBe(estimateGeminiInputTokens('S', 'C'));
    expect(sdk.countTokens).not.toHaveBeenCalled();
  });

  function sdkError(status: number | undefined, base?: Error): Error {
    const err = base ?? new Error('ApiError');
    err.message = `${err.message} sk-SENTINEL`;
    err.stack = 'Error: sk-SENTINEL\n    at fake';
    Object.assign(err, {
      config: { headers: { 'x-goog-api-key': 'sk-SENTINEL' } },
      cause: new Error('cause sk-SENTINEL'),
    });
    if (status !== undefined) Object.assign(err, { status });
    return err;
  }

  it.each([
    ['429', () => sdkError(429)],
    ['503', () => sdkError(503)],
    ['500', () => sdkError(500)],
    ['401', () => sdkError(401)],
    ['404', () => sdkError(404)],
    ['network', () => sdkError(undefined, new TypeError('fetch failed'))],
  ])('SDK failure %s → sanitized ProviderCallError, one attempt', async (_label, make) => {
    const original = make();
    sdk.generateContent.mockRejectedValue(original);
    const provider = createGeminiProvider({ apiKey: 'k' });
    const err = await provider
      .generateContent({ model: 'm', systemInstruction: 'S', contents: 'C', maxOutputTokens: 10, temperature: 0.9 })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(ProviderCallError);
    const pce = err as ProviderCallError;
    expect(pce.info).toEqual(toSanitizedProviderError('gemini', original));
    expect(JSON.stringify({ message: pce.message, info: pce.info })).not.toContain('sk-SENTINEL');
    expect(String(pce.stack)).not.toContain('sk-SENTINEL');
    expect(pce.cause).toBeUndefined();
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('createPlatformProvider', () => {
  it('throws a config ProviderCallError when GEMINI_API_KEY is missing', () => {
    let caught: unknown;
    try {
      createPlatformProvider({});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProviderCallError);
    expect((caught as ProviderCallError).info).toEqual({
      provider: 'gemini',
      status: null,
      kind: 'config',
      providerErrorCode: 'API_KEY_MISSING',
    });
  });

  it('returns a gemini provider when the key is set', () => {
    expect(createPlatformProvider({ GEMINI_API_KEY: 'k' }).provider).toBe('gemini');
  });
});
