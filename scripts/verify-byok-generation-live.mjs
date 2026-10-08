import { createAnthropicProvider } from '../lib/ai/providers/anthropic.ts';
import { createGeminiProvider } from '../lib/ai/providers/gemini.ts';
import { ProviderCallError } from '../lib/ai/providers/errors.ts';
import { createOpenAiProvider } from '../lib/ai/providers/openai.ts';
import { PROVIDER_MODELS } from '../lib/ai/providers/catalog.ts';

const PROVIDERS = [
  { id: 'openai', envName: 'OPENAI_API_KEY', create: createOpenAiProvider },
  { id: 'anthropic', envName: 'ANTHROPIC_API_KEY', create: createAnthropicProvider },
  { id: 'gemini', envName: 'GEMINI_API_KEY', create: createGeminiProvider },
];
const MAX_OUTPUT_TOKENS = 8192;
const SAFE_KINDS = new Set(['invalid_key', 'rate_limited', 'credit_exhausted', 'unavailable', 'config']);
const SAFE_CODES = new Set([
  'RESOURCE_EXHAUSTED', 'UNAVAILABLE', 'INTERNAL', 'DEADLINE_EXCEEDED',
  'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'INVALID_ARGUMENT',
  'API_KEY_MISSING', 'PAYMENT_REQUIRED', 'CREDIT_BALANCE_EXHAUSTED',
  'ORGANIZATION_SPEND_LIMIT_EXCEEDED', 'PROJECT_SPEND_LIMIT_EXCEEDED',
  'ORGANIZATION_USAGE_LIMIT_EXCEEDED', 'ENFORCED_SPEND_LIMIT_REACHED',
]);

export function normalizeFailure(error, provider) {
  if (error instanceof ProviderCallError && error.info?.provider === provider
    && SAFE_KINDS.has(error.info.kind)) {
    const status = Number.isInteger(error.info.status) && error.info.status >= 400 && error.info.status <= 599
      ? error.info.status : null;
    const code = SAFE_CODES.has(error.info.providerErrorCode) ? error.info.providerErrorCode : null;
    return { ok: false, provider, kind: error.info.kind, status, providerErrorCode: code };
  }
  return { ok: false, provider, kind: 'unavailable', status: null, providerErrorCode: null };
}

export function formatResult(result, model, maxOutputTokens = MAX_OUTPUT_TOKENS) {
  if (result.ok) {
    const inputTokens = safeCount(result.usage?.inputTokens);
    const outputTokens = safeCount(result.usage?.outputTokens);
    return `provider=${result.provider} model=${model} ok=true kind=success inputTokens=${inputTokens} outputTokens=${outputTokens} maxOutputTokens=${maxOutputTokens}`;
  }
  return `provider=${result.provider} model=${model} ok=false kind=${result.kind} status=${result.status ?? 'unknown'} providerErrorCode=${result.providerErrorCode ?? 'unknown'} maxOutputTokens=${maxOutputTokens}`;
}

function safeCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(`self_test_failed:${message}`);
}

function runSelfTest() {
  const secret = 'TEST_SECRET_DO_NOT_PRINT';
  const raw = `raw body Authorization: Bearer ${secret} ${'prompt response'.repeat(20)}`;
  const unsafe = new Error(raw);
  unsafe.response = { data: raw, headers: { authorization: secret } };
  const normalized = normalizeFailure(unsafe, 'openai');
  const invalid = normalizeFailure(new ProviderCallError({
    provider: 'openai', status: 401, kind: 'invalid_key', providerErrorCode: 'UNAUTHENTICATED',
  }), 'openai');
  const output = [
    formatResult({ ok: true, provider: 'gemini', usage: { inputTokens: 5, outputTokens: 3 } }, 'synthetic-model'),
    formatResult(invalid, 'synthetic-model'),
    formatResult(normalized, 'synthetic-model'),
  ].join('\n');

  assert(invalid.kind === 'invalid_key', 'invalid key classification');
  assert(normalized.kind === 'unavailable', 'raw exception fallback');
  assert(!output.includes(secret), 'key material');
  assert(!/authorization|prompt|response|raw body/i.test(output), 'sensitive payload markers');
  assert(/maxOutputTokens=8192/.test(output), 'output token limit');
  console.log('SELF_TEST=PASS');
}

async function smoke(provider, apiKey, model) {
  const client = provider.create({ apiKey, errorContext: { keySource: 'byok' } });
  try {
    const result = await client.generateContent({
      model,
      systemInstruction: 'Reply with a short greeting.',
      contents: 'Say hello.',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
    });
    return {
      ok: true,
      provider: provider.id,
      usage: { inputTokens: safeCount(result.usage?.inputTokens), outputTokens: safeCount(result.usage?.outputTokens) },
    };
  } catch (error) {
    return normalizeFailure(error, provider.id);
  }
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  let failures = 0;
  for (const provider of PROVIDERS) {
    const model = PROVIDER_MODELS[provider.id][0].id;
    const key = process.env[provider.envName];
    if (!key) {
      console.log(`provider=${provider.id} model=${model} case=valid-key skipped reason=missing_key maxOutputTokens=${MAX_OUTPUT_TOKENS}`);
      continue;
    }

    const success = await smoke(provider, key, model);
    console.log(formatResult(success, model));
    if (!success.ok) failures++;

    const invalidProbe = await smoke(provider, `invalid-${crypto.randomUUID()}`, model);
    console.log(`case=synthetic-invalid-key ${formatResult(invalidProbe, model)}`);
    if (invalidProbe.ok || invalidProbe.kind !== 'invalid_key') failures++;
  }
  console.log(failures === 0 ? 'RESULT=PASS' : 'RESULT=FAIL');
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(() => {
  console.error('RESULT=FAIL reason=unexpected_script_error');
  process.exitCode = 1;
});
