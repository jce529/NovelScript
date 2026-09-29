import { describe, expect, it } from 'vitest';
import { PROVIDER_MODELS, defaultModelFor, isKnownModel } from '@/lib/ai/providers/catalog';

describe('provider model catalog', () => {
  it('lists the enabled models by provider without a shared tier count', () => {
    expect(Object.keys(PROVIDER_MODELS)).toEqual(['gemini', 'openai', 'anthropic']);
    expect(PROVIDER_MODELS.gemini.map((model) => model.id)).toEqual(['gemini-3.5-flash']);
    expect(PROVIDER_MODELS.openai.map((model) => model.id)).toEqual(['gpt-4o-mini', 'gpt-5.6-terra']);
    expect(PROVIDER_MODELS.anthropic.map((model) => model.id)).toEqual(['claude-haiku-4-5', 'claude-sonnet-5']);
  });

  it('checks models within their own provider and picks the first default', () => {
    expect(isKnownModel('openai', 'gpt-4o-mini')).toBe(true);
    expect(isKnownModel('anthropic', 'gpt-4o-mini')).toBe(false);
    expect(defaultModelFor('anthropic')).toBe('claude-haiku-4-5');
  });
});
