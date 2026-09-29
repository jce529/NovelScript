import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider, mapAnthropicResponse } from '@/lib/ai/providers/anthropic';
import { ProviderCallError, toSanitizedProviderError } from '@/lib/ai/providers/errors';
import { ANTHROPIC_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/anthropic/cost';

const sdk = vi.hoisted(() => ({ ctorOptions: [] as unknown[], create: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class FakeAnthropic {
    messages = { create: sdk.create };
    constructor(options: unknown) {
      sdk.ctorOptions.push(options);
    }
  },
}));

const fx = (value: unknown) => value as Parameters<typeof mapAnthropicResponse>[0];
const usage = { inputTokens: 120, outputTokens: 30, thoughtsTokens: null, reported: { input: true, output: true } };
const params = { model: 'claude-haiku-4-5', systemInstruction: 'S', contents: 'C', maxOutputTokens: 512, temperature: 0.9 };

describe('Anthropic pricing', () => {
  it('keeps each catalog model at its Anthropic input and output rates', () => {
    expect(ANTHROPIC_PRICING_USD_PER_MILLION['claude-haiku-4-5']).toEqual({ input: 1.00, output: 5.00 });
    expect(ANTHROPIC_PRICING_USD_PER_MILLION['claude-sonnet-5']).toEqual({ input: 2.00, output: 10.00 });
  });
});

describe('mapAnthropicResponse', () => {
  it('maps text blocks and reported usage', () => {
    const result = mapAnthropicResponse(fx({
      stop_reason: 'end_turn', content: [{ type: 'text', text: 'answer' }], usage: { input_tokens: 120, output_tokens: 30 },
    }));
    expect(result).toEqual({ text: 'answer', finishReason: 'stop', refusal: null, usage });
  });

  it('maps structured stop_reason refusal and drops partial text', () => {
    const result = mapAnthropicResponse(fx({ stop_reason: 'refusal', content: [{ type: 'text', text: 'PARTIAL-SENTINEL' }] }));
    expect(result).toMatchObject({ text: '', finishReason: 'refusal', refusal: { stage: 'output', reasonCode: 'OTHER' } });
    expect(JSON.stringify(result)).not.toContain('PARTIAL-SENTINEL');
  });

  it('preserves text when max_tokens stops generation', () => {
    const result = mapAnthropicResponse(fx({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] }));
    expect(result).toMatchObject({ text: 'partial', finishReason: 'max_tokens', refusal: null });
  });
});

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    sdk.ctorOptions.length = 0;
    sdk.create.mockReset();
  });

  it('constructs the SDK, forwards a Messages call without temperature, and maps the result', async () => {
    const response = fx({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'answer' }], usage: { input_tokens: 120, output_tokens: 30 } });
    sdk.create.mockResolvedValue(response);
    const provider = createAnthropicProvider({ apiKey: 'k' });
    expect(provider.provider).toBe('anthropic');
    expect(sdk.ctorOptions).toEqual([{ apiKey: 'k' }]);
    const result = await provider.generateContent(params);
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.create).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5', system: 'S', messages: [{ role: 'user', content: 'C' }], max_tokens: 512,
    });
    const callArgs = sdk.create.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('temperature');
    expect(result).toEqual(mapAnthropicResponse(response));
  });

  it('converts SDK errors to a sanitized ProviderCallError without raw fields', async () => {
    const original = new Error('sk-SENTINEL');
    original.stack = 'Error: sk-SENTINEL\n    at fake';
    Object.assign(original, { status: 429, config: { headers: { 'x-api-key': 'sk-SENTINEL' } }, cause: new Error('sk-SENTINEL') });
    sdk.create.mockRejectedValue(original);
    const provider = createAnthropicProvider({ apiKey: 'k' });
    const err = await provider.generateContent(params).then(() => null, (caught: unknown) => caught);
    expect(err).toBeInstanceOf(ProviderCallError);
    const sanitized = err as ProviderCallError;
    expect(sanitized.info).toEqual(toSanitizedProviderError('anthropic', original));
    expect(JSON.stringify({ message: sanitized.message, info: sanitized.info })).not.toContain('sk-SENTINEL');
    expect(String(sanitized.stack)).not.toContain('sk-SENTINEL');
    expect(sanitized.cause).toBeUndefined();
    expect(sdk.create).toHaveBeenCalledTimes(1);
  });
});
