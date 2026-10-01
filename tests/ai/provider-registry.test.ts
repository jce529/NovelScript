import { describe, expect, it } from 'vitest';
import { createPlatformProvider } from '@/lib/ai/providers/registry';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import type { ProviderId } from '@/lib/ai/providers/types';

const cases: { provider: ProviderId; key: string }[] = [
  { provider: 'gemini', key: 'GEMINI_API_KEY' },
  { provider: 'openai', key: 'OPENAI_API_KEY' },
  { provider: 'anthropic', key: 'ANTHROPIC_API_KEY' },
];

describe('platform provider registry', () => {
  it.each(cases)('requires $key for $provider', ({ provider, key }) => {
    expect(() => createPlatformProvider(provider, {})).toThrow(ProviderCallError);
    try {
      createPlatformProvider(provider, { [key]: 'test-key' });
    } catch (error) {
      throw new Error(`The ${provider} adapter should accept its own key`, { cause: error });
    }
  });

  it.each(cases)('selects $provider with its own key only', ({ provider, key }) => {
    expect(createPlatformProvider(provider, { [key]: 'test-key' }).provider).toBe(provider);
    for (const other of cases.filter((entry) => entry.provider !== provider)) {
      expect(() => createPlatformProvider(provider, { [other.key]: 'test-key' })).toThrow(ProviderCallError);
    }
  });
});
