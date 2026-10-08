import { describe, expect, it, vi } from 'vitest';

const captured: Array<{ provider: string; errorContext: unknown }> = [];
vi.mock('@/lib/ai/providers/openai', () => ({ createOpenAiProvider: (o: { errorContext?: unknown }) => { captured.push({ provider: 'openai', errorContext: o.errorContext }); return { provider: 'openai' }; } }));
vi.mock('@/lib/ai/providers/anthropic', () => ({ createAnthropicProvider: (o: { errorContext?: unknown }) => { captured.push({ provider: 'anthropic', errorContext: o.errorContext }); return { provider: 'anthropic' }; } }));
vi.mock('@/lib/ai/providers/gemini', () => ({ createGeminiProvider: (o: { errorContext?: unknown }) => { captured.push({ provider: 'gemini', errorContext: o.errorContext }); return { provider: 'gemini' }; } }));

import { createProviderWithApiKey } from '@/lib/ai/providers/registry';

describe('createProviderWithApiKey', () => {
  it.each(['openai', 'anthropic', 'gemini'] as const)('passes the BYOK key source to the %s adapter so auth failures classify as invalid_key', (providerId) => {
    captured.length = 0;
    createProviderWithApiKey(providerId, 'sk-test', { keySource: 'byok' });
    expect(captured).toEqual([{ provider: providerId, errorContext: { keySource: 'byok' } }]);
  });
});
