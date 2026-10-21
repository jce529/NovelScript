import type { ProviderId } from './types';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';

export type KeySource = 'service' | 'byok';
export interface Selection { providerId: ProviderId; model: string; keySource: KeySource }
export type ByokModelMap = Partial<Record<ProviderId, string[]>>;
/** Client-safe service-key availability: one boolean per provider, never key values or env names. */
export type ServiceAvailability = Record<ProviderId, boolean>;
export interface ModelChoice {
  value: string; providerId: ProviderId; model: string; keySource: KeySource; displayName: string; description: string; badge: 'BYOK' | '서비스 키';
  disabled: boolean; unavailableReason: string | null;
}
export const SERVICE_KEY_UNAVAILABLE_REASON = '서비스 키가 설정되지 않았어요. 내 API 키를 등록하면 사용 가능해요.';
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
/**
 * Service rows are never hidden: without a confirmed service key (missing availability = fail closed)
 * they stay in catalog order but disabled with a fixed reason. BYOK rows come only from the catalog
 * intersection and are independent of service availability.
 */
export function buildModelChoices(byok: ByokModelMap, serviceAvailability?: ServiceAvailability): ModelChoice[] {
  const choices: ModelChoice[] = [];
  for (const providerId of Object.keys(PROVIDER_MODELS) as ProviderId[]) {
    const serviceEnabled = serviceAvailability?.[providerId] === true;
    const byokIds = intersectWithCatalog(providerId, byok[providerId] ?? []);
    for (const info of PROVIDER_MODELS[providerId]) {
      const service: Selection = { providerId, model: info.id, keySource: 'service' };
      choices.push({
        value: encodeSelection(service), ...service, displayName: info.displayName, description: info.description, badge: KEY_SOURCE_LABEL.service,
        disabled: !serviceEnabled, unavailableReason: serviceEnabled ? null : SERVICE_KEY_UNAVAILABLE_REASON,
      });
      if (byokIds.includes(info.id)) {
        const selection: Selection = { ...service, keySource: 'byok' };
        choices.push({
          value: encodeSelection(selection), ...selection, displayName: info.displayName, description: info.description, badge: KEY_SOURCE_LABEL.byok,
          disabled: false, unavailableReason: null,
        });
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
