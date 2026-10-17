import 'server-only';
import type { ProviderId } from './types';
import type { ServiceAvailability } from './selection';
import { ProviderCallError } from './errors';

/**
 * Service-key availability is decided ONLY by the real server env var for each provider.
 * NODE_ENV / AI_PROVIDER_FIXTURE never influence it (BUG-03: fixture does not bypass the key rule).
 * Key values and env var names never leave this module.
 */
const SERVICE_KEY_ENV: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

type Env = Record<string, string | undefined>;

function hasServiceKey(providerId: ProviderId, env: Env): boolean {
  const value = env[SERVICE_KEY_ENV[providerId]];
  return typeof value === 'string' && value.trim().length > 0;
}

export function getServiceAvailability(env: Env = process.env): ServiceAvailability {
  return {
    gemini: hasServiceKey('gemini', env),
    openai: hasServiceKey('openai', env),
    anthropic: hasServiceKey('anthropic', env),
  };
}

export function assertServiceKeyAvailable(providerId: ProviderId, env: Env = process.env): void {
  if (!hasServiceKey(providerId, env)) {
    throw new ProviderCallError({ provider: providerId, status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
  }
}
