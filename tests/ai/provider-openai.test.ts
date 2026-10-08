import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_CALL_TIMEOUT_MS } from '@/lib/ai/providers/types';
import { createOpenAiProvider, mapOpenAiResponse } from '@/lib/ai/providers/openai';
import { OPENAI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/openai/cost';
import { ProviderCallError, toSanitizedProviderError } from '@/lib/ai/providers/errors';

const sdk = vi.hoisted(() => ({ ctorOptions: [] as unknown[], create: vi.fn() }));

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = { create: sdk.create };
    constructor(options: unknown) {
      sdk.ctorOptions.push(options);
    }
  },
}));

const fx = (value: unknown) => value as Parameters<typeof mapOpenAiResponse>[0];
const usage = { inputTokens: 120, outputTokens: 30, thoughtsTokens: null, reported: { input: true, output: true } };
const params = { model: 'gpt-4o-mini', systemInstruction: 'S', contents: 'C', maxOutputTokens: 512, temperature: 0.9 };

describe('OpenAI pricing', () => {
  it('owns the researched per-model USD rates', () => {
    expect(OPENAI_PRICING_USD_PER_MILLION['gpt-4o-mini']).toEqual({ input: 0.15, output: 0.60 });
    expect(OPENAI_PRICING_USD_PER_MILLION['gpt-5.6-terra']).toEqual({ input: 2.00, output: 12.00 });
  });
});

describe('mapOpenAiResponse', () => {
  it('maps output_text and reported usage', () => {
    const result = mapOpenAiResponse(fx({ status: 'completed', output_text: 'answer', usage: { input_tokens: 120, output_tokens: 30 } }));
    expect(result).toEqual({ text: 'answer', finishReason: 'stop', refusal: null, usage });
  });

  it('treats a refusal content block as an output refusal and drops partial text', () => {
    const result = mapOpenAiResponse(fx({
      status: 'completed', output_text: 'PARTIAL-SENTINEL',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'RAW-SENTINEL' }] }],
    }));
    expect(result).toMatchObject({ text: '', finishReason: 'refusal', refusal: { stage: 'output', reasonCode: 'OTHER' } });
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
  });

  it('maps incomplete content_filter to an output refusal', () => {
    const result = mapOpenAiResponse(fx({
      status: 'incomplete', output_text: 'PARTIAL-SENTINEL', incomplete_details: { reason: 'content_filter' },
    }));
    expect(result).toMatchObject({ text: '', finishReason: 'refusal', refusal: { stage: 'output', reasonCode: 'OTHER' } });
    expect(JSON.stringify(result)).not.toContain('PARTIAL-SENTINEL');
  });

  it('preserves text for incomplete max_output_tokens', () => {
    const result = mapOpenAiResponse(fx({
      status: 'incomplete', output_text: 'partial', incomplete_details: { reason: 'max_output_tokens' },
    }));
    expect(result).toMatchObject({ text: 'partial', finishReason: 'max_tokens', refusal: null });
  });
});

describe('createOpenAiProvider', () => {
  beforeEach(() => {
    sdk.ctorOptions.length = 0;
    sdk.create.mockReset();
  });

  it('constructs the SDK, forwards the Responses call, and maps the result', async () => {
    const response = fx({ status: 'completed', output_text: 'answer', usage: { input_tokens: 120, output_tokens: 30 } });
    sdk.create.mockResolvedValue(response);
    const provider = createOpenAiProvider({ apiKey: 'k' });
    expect(provider.provider).toBe('openai');
    expect(sdk.ctorOptions).toEqual([{ apiKey: 'k', maxRetries: 0 }]);
    const result = await provider.generateContent(params);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith({
      model: 'gpt-4o-mini', instructions: 'S', input: 'C', max_output_tokens: 512, temperature: 0.9,
    }, { signal: expect.any(AbortSignal), timeout: PROVIDER_CALL_TIMEOUT_MS, maxRetries: 0 });
    expect(result).toEqual(mapOpenAiResponse(response));
  });

  it('omits temperature for reasoning models that reject it (live 400 on gpt-5.6-terra)', async () => {
    sdk.create.mockResolvedValue(fx({ status: 'completed', output_text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } }));
    const provider = createOpenAiProvider({ apiKey: 'k' });
    await provider.generateContent({ ...params, model: 'gpt-5.6-terra' });
    expect(sdk.create).toHaveBeenCalledWith({
      model: 'gpt-5.6-terra', instructions: 'S', input: 'C', max_output_tokens: 512,
    }, expect.any(Object));
  });

  it('converts SDK errors to a sanitized ProviderCallError without raw fields', async () => {
    const original = new Error('sk-SENTINEL');
    original.stack = 'Error: sk-SENTINEL\n    at fake';
    Object.assign(original, { status: 403, config: { headers: { Authorization: 'sk-SENTINEL' } }, cause: new Error('sk-SENTINEL') });
    sdk.create.mockRejectedValue(original);
    const provider = createOpenAiProvider({ apiKey: 'k' });
    const err = await provider.generateContent(params).then(() => null, (caught: unknown) => caught);
    expect(err).toBeInstanceOf(ProviderCallError);
    const sanitized = err as ProviderCallError;
    expect(sanitized.info).toEqual(toSanitizedProviderError('openai', original));
    expect(JSON.stringify({ message: sanitized.message, info: sanitized.info })).not.toContain('sk-SENTINEL');
    expect(String(sanitized.stack)).not.toContain('sk-SENTINEL');
    expect(sanitized.cause).toBeUndefined();
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });

  it('classifies BYOK authentication failures as invalid_key', async () => {
    sdk.create.mockRejectedValue(Object.assign(new Error('secret'), { status: 401 }));
    const provider = createOpenAiProvider({ apiKey: 'k', errorContext: { keySource: 'byok' } });
    await expect(provider.generateContent(params)).rejects.toMatchObject({ info: { kind: 'invalid_key', status: 401 } });
  });
});
