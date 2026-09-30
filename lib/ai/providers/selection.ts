import type { ProviderId } from './types';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';

export type KeySource = 'service' | 'byok';
export interface Selection { providerId: ProviderId; model: string; keySource: KeySource }
export type ByokModelMap = Partial<Record<ProviderId, string[]>>;
export interface ModelChoice { value: string; providerId: ProviderId; model: string; keySource: KeySource; displayName: string; description: string; badge: 'BYOK' | '서비스 키' }
export const KEY_SOURCE_LABEL: Record<KeySource, '서비스 키' | 'BYOK'> = { service: '서비스 키', byok: 'BYOK' };
export function encodeSelection(s: Selection): string { return `${s.providerId}:${s.model}:${s.keySource}`; }
export function decodeSelection(value: string): Selection | null {
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const [provider, model, source = 'service'] = parts;
  if (!Object.hasOwn(PROVIDER_MODELS, provider) || !isKnownModel(provider as ProviderId, model)) return null;
  if (source !== 'service' && source !== 'byok') return null;
  return { providerId: provider as ProviderId, model, keySource: source };
}
export function buildModelChoices(byok: ByokModelMap): ModelChoice[] {
  const choices: ModelChoice[] = [];
  for (const providerId of Object.keys(PROVIDER_MODELS) as ProviderId[]) {
    for (const info of PROVIDER_MODELS[providerId]) {
      const service: Selection = { providerId, model: info.id, keySource: 'service' };
      choices.push({ value: encodeSelection(service), ...service, displayName: info.displayName, description: info.description, badge: KEY_SOURCE_LABEL.service });
      if (intersectWithCatalog(providerId, byok[providerId] ?? []).includes(info.id)) {
        const selection: Selection = { ...service, keySource: 'byok' };
        choices.push({ value: encodeSelection(selection), ...selection, displayName: info.displayName, description: info.description, badge: KEY_SOURCE_LABEL.byok });
      }
    }
  }
  return choices;
}
export function intersectWithCatalog(providerId: ProviderId, ids: readonly string[]): string[] {
  const allowed = new Set(ids);
  return PROVIDER_MODELS[providerId].filter(({ id }) => allowed.has(id)).map(({ id }) => id);
}
export function resolveDeleteReplacement(current: Selection, deletedProvider: ProviderId): { replaced: boolean; next: Selection } {
  if (current.providerId !== deletedProvider || current.keySource !== 'byok') return { replaced: false, next: current };
  const next: Selection = isKnownModel(current.providerId, current.model)
    ? { ...current, keySource: 'service' }
    : { providerId: 'gemini', model: defaultModelFor('gemini'), keySource: 'service' };
  return { replaced: true, next };
}
