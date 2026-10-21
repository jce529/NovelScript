import { describe, expect, it } from 'vitest';
import { buildModelChoices, decodeSelection, encodeSelection, intersectWithCatalog, resolveDeleteReplacement, type ServiceAvailability } from '@/lib/ai/providers/selection';

const ALL_ON: ServiceAvailability = { gemini: true, openai: true, anthropic: true };
const ALL_OFF: ServiceAvailability = { gemini: false, openai: false, anthropic: false };
const UNAVAILABLE = '서비스 키가 설정되지 않았어요. 내 API 키를 등록하면 사용 가능해요.';

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
    const choices = buildModelChoices({}, ALL_ON);
    expect(choices.map((choice: { providerId: string }) => choice.providerId)).toEqual(['gemini', 'openai', 'openai', 'anthropic', 'anthropic']);
    expect(choices.every((choice: { keySource: string; badge: string }) => choice.keySource === 'service' && choice.badge === '서비스 키')).toBe(true);
    expect(choices.every((choice) => choice.disabled === false && choice.unavailableReason === null)).toBe(true);
  });
  it('places a verified BYOK variant immediately after its service model', () => {
    const choices = buildModelChoices({ openai: ['gpt-4o-mini'] }, ALL_ON);
    const index = choices.findIndex((choice: { model: string }) => choice.model === 'gpt-4o-mini');
    expect(choices[index + 1]).toMatchObject({ model: 'gpt-4o-mini', keySource: 'byok', badge: 'BYOK', displayName: choices[index].displayName });
    expect(choices[index].value).not.toBe(choices[index + 1].value);
  });
  it('filters unknown ids and intersects in catalog order', () => {
    expect(intersectWithCatalog('openai', ['unknown', 'gpt-5.6-terra', 'gpt-4o-mini'])).toEqual(['gpt-4o-mini', 'gpt-5.6-terra']);
    expect(buildModelChoices({ openai: ['unknown'] }, ALL_ON).filter((choice: { keySource: string }) => choice.keySource === 'byok')).toHaveLength(0);
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

describe('service availability in the picker (BUG-03)', () => {
  it.each([['missing', undefined], ['all false', ALL_OFF]] as const)('keeps all five service rows disabled with a reason when availability is %s', (_label, availability) => {
    const choices = buildModelChoices({}, availability);
    expect(choices).toHaveLength(5);
    expect(choices.map((c) => c.providerId)).toEqual(['gemini', 'openai', 'openai', 'anthropic', 'anthropic']);
    for (const c of choices) {
      expect(c).toMatchObject({ keySource: 'service', badge: '서비스 키', disabled: true, unavailableReason: UNAVAILABLE });
    }
  });
  it('enables only the providers whose service key is available', () => {
    const choices = buildModelChoices({}, { gemini: false, openai: true, anthropic: false });
    expect(choices.filter((c) => !c.disabled).map((c) => c.providerId)).toEqual(['openai', 'openai']);
    expect(choices.filter((c) => !c.disabled).every((c) => c.unavailableReason === null)).toBe(true);
    expect(choices.filter((c) => c.disabled).every((c) => c.unavailableReason === UNAVAILABLE)).toBe(true);
  });
  it('keeps a connected BYOK variant enabled right after a disabled service row', () => {
    const choices = buildModelChoices({ openai: ['gpt-4o-mini'] }, ALL_OFF);
    const index = choices.findIndex((c) => c.model === 'gpt-4o-mini');
    expect(choices[index]).toMatchObject({ keySource: 'service', disabled: true, unavailableReason: UNAVAILABLE });
    expect(choices[index + 1]).toMatchObject({ model: 'gpt-4o-mini', keySource: 'byok', badge: 'BYOK', disabled: false, unavailableReason: null });
    expect(choices[index + 1].value).toBe('openai:gpt-4o-mini:byok');
    expect(choices[index].value).not.toBe(choices[index + 1].value);
  });
  it('still excludes BYOK ids outside the catalog when service keys are missing', () => {
    expect(buildModelChoices({ openai: ['unknown'], anthropic: ['nope'] }, ALL_OFF).filter((c) => c.keySource === 'byok')).toHaveLength(0);
  });
  it('does not carry key material in choices', () => {
    const json = JSON.stringify(buildModelChoices({ openai: ['gpt-4o-mini'] }, ALL_ON));
    expect(json).not.toMatch(/API_KEY|sk-|vault/i);
  });
});
