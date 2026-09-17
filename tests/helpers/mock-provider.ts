import { vi } from 'vitest';
import type { GenerateResult, ProviderClient } from '@/lib/ai/providers/types';

export function okResult(text = '[REPLY]\n(mock) 응답', inputTokens = 10, outputTokens = 10): GenerateResult {
  return {
    text,
    finishReason: 'stop',
    refusal: null,
    usage: { inputTokens, outputTokens, thoughtsTokens: null, reported: { input: true, output: true } },
  };
}

export function createMockProvider(
  overrides: Partial<Pick<ProviderClient, 'generateContent' | 'estimateInputTokens'>> = {},
) {
  return {
    provider: 'gemini' as const,
    generateContent: vi.fn(overrides.generateContent ?? (async () => okResult())),
    estimateInputTokens: vi.fn(overrides.estimateInputTokens ?? (() => 10)),
  };
}
