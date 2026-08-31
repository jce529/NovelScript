import { describe, it, expect } from 'vitest';
import { createGeminiClient, createMockGeminiClient, MODEL_TIER_TO_ID } from '../../lib/ai/gemini';

describe('lib/ai/gemini.ts', () => {
  it('MODEL_TIER_TO_ID maps exactly the two Gemini-family tiers this phase supports', () => {
    expect(MODEL_TIER_TO_ID).toEqual({ lite: 'gemini-3.5-flash', pro: 'gemini-3.5-flash' });
  });

  it('createGeminiClient throws a clear error when GEMINI_API_KEY is missing', () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    expect(() => createGeminiClient()).toThrow('GEMINI_API_KEY');
    if (original) process.env.GEMINI_API_KEY = original;
  });

  it('createMockGeminiClient returns safe defaults', async () => {
    const client = createMockGeminiClient();
    const tokens = await client.countTokens({ model: 'gemini-2.5-flash', contents: 'hi' });
    expect(tokens.totalTokens).toBe(10);
    const generated = await client.generateContent({ model: 'gemini-2.5-flash', systemInstruction: 's', contents: 'c', maxOutputTokens: 100 });
    expect(generated).toEqual({
      text: '(mock) 생성된 본문', finishReason: 'STOP', promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20,
    });
  });

  it('createMockGeminiClient accepts per-field overrides', async () => {
    const overridden = createMockGeminiClient({ countTokens: async () => ({ totalTokens: 999 }) });
    expect((await overridden.countTokens({ model: 'x', contents: 'y' })).totalTokens).toBe(999);
  });
});
