import type { ProviderId } from './types';

export interface ProviderModelInfo {
  /** Exact vendor model ID, passed verbatim to the SDK call. */
  id: string;
  /** D-02: real model name shown in the UI, never a tier label. */
  displayName: string;
  /** One-line UI description. */
  description: string;
}

/** D-01: each provider lists the models ops has enabled, without a shared tier count.
 * D-03: model IDs from 09-RESEARCH.md, verified 2026-09-22. */
export const PROVIDER_MODELS: Record<ProviderId, ProviderModelInfo[]> = {
  gemini: [
    { id: 'gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', description: '빠르고 저렴' },
  ],
  openai: [
    { id: 'gpt-4o-mini', displayName: 'GPT-4o mini', description: '빠르고 저렴' },
    // Requires OpenAI Organization Verification. Check STATE.md Blockers before
    // assuming this is callable; denied access surfaces through sanitized errors.
    { id: 'gpt-5.6-terra', displayName: 'GPT-5.6 Terra', description: '강력한 추론' },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5', description: '빠르고 저렴' },
    { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5', description: '속도와 성능의 균형' },
  ],
};

export function isKnownModel(provider: ProviderId, model: string): boolean {
  return PROVIDER_MODELS[provider].some((entry) => entry.id === model);
}

export function defaultModelFor(provider: ProviderId): string {
  return PROVIDER_MODELS[provider][0].id;
}
