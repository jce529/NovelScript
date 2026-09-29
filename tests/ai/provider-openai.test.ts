import { beforeEach, describe, expect, it, vi } from 'vitest';
// Plan 09-01 supplies this module; keep the RED scaffold type-checkable in Wave 0.
// @ts-expect-error adapter is intentionally absent until Plan 09-01
import { createOpenAiProvider, mapOpenAiResponse } from '@/lib/ai/providers/openai';
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
    expect(sdk.ctorOptions).toEqual([{ apiKey: 'k' }]);
    const result = await provider.generateContent(params);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith({
      model: 'gpt-4o-mini', instructions: 'S', input: 'C', max_output_tokens: 512, temperature: 0.9,
    });
    expect(result).toEqual(mapOpenAiResponse(response));
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
});
