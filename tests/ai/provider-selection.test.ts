import { describe, expect, it } from 'vitest';
import { buildModelChoices, decodeSelection, encodeSelection, intersectWithCatalog, resolveDeleteReplacement } from '@/lib/ai/providers/selection';

describe('provider selection codec and picker', () => {
  it('encodes a BYOK selection with its source', () => {
    expect(encodeSelection({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' })).toBe('openai:gpt-4o-mini:byok');
  });
  it('decodes legacy two-part values as service selections', () => {
    expect(decodeSelection('openai:gpt-4o-mini')).toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' });
  });
  it.each(['unknown:gpt-4o-mini:service', 'openai:unknown:service', 'openai:gpt-4o-mini:other', 'openai:gpt-4o-mini:byok:extra'])('rejects unsafe selection %s', (value) => {
    expect(decodeSelection(value)).toBeNull();
  });
  it('lists only service models in catalog order when there are no BYOK keys', () => {
    const choices = buildModelChoices({});
    expect(choices.map((choice: { providerId: string }) => choice.providerId)).toEqual(['gemini', 'openai', 'openai', 'anthropic', 'anthropic']);
    expect(choices.every((choice: { keySource: string; badge: string }) => choice.keySource === 'service' && choice.badge === '서비스 키')).toBe(true);
  });
  it('places a verified BYOK variant immediately after its service model', () => {
    const choices = buildModelChoices({ openai: ['gpt-4o-mini'] });
    const index = choices.findIndex((choice: { model: string }) => choice.model === 'gpt-4o-mini');
    expect(choices[index + 1]).toMatchObject({ model: 'gpt-4o-mini', keySource: 'byok', badge: 'BYOK', displayName: choices[index].displayName });
    expect(choices[index].value).not.toBe(choices[index + 1].value);
  });
  it('filters unknown ids and intersects in catalog order', () => {
    expect(intersectWithCatalog('openai', ['unknown', 'gpt-5.6-terra', 'gpt-4o-mini'])).toEqual(['gpt-4o-mini', 'gpt-5.6-terra']);
    expect(buildModelChoices({ openai: ['unknown'] }).filter((choice: { keySource: string }) => choice.keySource === 'byok')).toHaveLength(0);
  });
  it('replaces a deleted default with the same service model', () => {
    expect(resolveDeleteReplacement({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }, 'openai')).toEqual({ replaced: true, next: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' } });
  });
  it('falls back to the Gemini service default if the selected model is no longer catalogued', () => {
    expect(resolveDeleteReplacement({ providerId: 'openai', model: 'removed-model', keySource: 'byok' }, 'openai').next).toEqual({ providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' });
  });
  it('does not replace a service default or another provider BYOK default', () => {
    expect(resolveDeleteReplacement({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' }, 'openai').replaced).toBe(false);
    expect(resolveDeleteReplacement({ providerId: 'anthropic', model: 'claude-haiku-4-5', keySource: 'byok' }, 'openai').replaced).toBe(false);
  });
});
