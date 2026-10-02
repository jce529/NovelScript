import 'server-only';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import type { ProviderId } from './types';
import { PROVIDER_MODELS } from './catalog';
import { toSanitizedProviderError } from './errors';

export type ByokFailureReason = 'format' | 'invalid' | 'forbidden' | 'rate_limited' | 'unavailable';
export type ByokValidationResult = { ok: true; modelIds: string[] } | { ok: false; reason: ByokFailureReason };
export function checkKeyFormat(raw: string): { ok: true; key: string } | { ok: false } {
  const key = raw.trim();
  return key.length >= 16 && key.length <= 512 && /^[\x21-\x7e]+$/.test(key) ? { ok: true, key } : { ok: false };
}
export type ListModelIds = (apiKey: string, opts: { signal: AbortSignal }) => AsyncIterable<string>;
const TIMEOUT_MS = 10_000;
async function* openAiModels(apiKey: string, { signal }: { signal: AbortSignal }): AsyncIterable<string> {
  // Model listing validates access without invoking generation.
  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
  for await (const model of client.models.list({ signal })) yield model.id;
}
async function* anthropicModels(apiKey: string): AsyncIterable<string> {
  // Model listing validates access without invoking generation.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: TIMEOUT_MS });
  for await (const model of client.models.list()) yield model.id;
}
async function* geminiModels(apiKey: string, { signal }: { signal: AbortSignal }): AsyncIterable<string> {
  // Model listing validates access without invoking generation.
  const client = new GoogleGenAI({ apiKey });
  const pager = await client.models.list({ config: { httpOptions: { timeout: TIMEOUT_MS }, abortSignal: signal } });
  for await (const model of pager) {
    if (model.name && (!model.supportedActions || model.supportedActions.includes('generateContent'))) {
      yield model.name.replace(/^models\//, '');
    }
  }
}
const DEFAULT_LISTERS: Record<ProviderId, ListModelIds> = { openai: openAiModels, anthropic: anthropicModels, gemini: geminiModels };
function failureReason(providerId: ProviderId, error: unknown): ByokFailureReason {
  const status = toSanitizedProviderError(providerId, error).status;
  if (status === 400 || status === 401) return 'invalid';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}
export async function validateByokKey(providerId: ProviderId, apiKey: string, deps: { lister?: ListModelIds; timeoutMs?: number; maxModels?: number } = {}): Promise<ByokValidationResult> {
  const checked = checkKeyFormat(apiKey);
  if (!checked.ok) return { ok: false, reason: 'format' };
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const maxModels = deps.maxModels ?? 2000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const candidates = new Set(PROVIDER_MODELS[providerId].map(({ id }) => id));
  const found = new Set<string>();
  const lister = deps.lister ?? DEFAULT_LISTERS[providerId];
  let timedOut = false;
  try {
    const iterable = lister(providerId === 'gemini' ? checked.key : checked.key, { signal: controller.signal });
    const iterator = iterable[Symbol.asyncIterator]();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Object.assign(new Error('timeout'), { name: 'AbortError' })); }, timeoutMs);
    });
    for (let count = 0; count <= maxModels; count++) {
      const next = await Promise.race([iterator.next(), deadline]);
      if (timedOut) return { ok: false, reason: 'unavailable' };
      if (next.done) return { ok: true, modelIds: [...found].sort((a, b) => [...candidates].indexOf(a) - [...candidates].indexOf(b)) };
      if (count === maxModels) { void iterator.return?.().catch(() => undefined); return { ok: false, reason: 'unavailable' }; }
      const id = providerId === 'gemini' ? next.value.replace(/^models\//, '') : next.value;
      if (candidates.has(id)) found.add(id);
      if (found.size === candidates.size) { void iterator.return?.().catch(() => undefined); return { ok: true, modelIds: [...candidates] }; }
    }
    void iterator.return?.().catch(() => undefined);
    return { ok: false, reason: 'unavailable' };
  } catch (error) {
    return { ok: false, reason: failureReason(providerId, error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
