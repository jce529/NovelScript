import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJevClient } from '@/lib/ai/decision/jev';
import { DecisionCallError } from '@/lib/ai/decision/errors';

const env = { TYPESAFE_API_KEY: 'test-key', JEV_MODEL_VERSION: 'jev-1.13.0' };
const request = {
  decisionType: 'task' as const,
  requestId: '00000000-0000-4000-8000-000000000000',
  instructions: 'Choose the task the writer most likely intends next.',
  state: { chapter: 'synthetic' },
  candidates: [
    { key: 'task-a', label: 'A' },
    { key: 'task-b', label: 'B' },
  ],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function answerBody(answer: Record<string, unknown>, model = env.JEV_MODEL_VERSION) {
  return { model, answers: { decision: answer } };
}

async function caught(call: () => Promise<unknown> | unknown): Promise<DecisionCallError> {
  const error = await Promise.resolve()
    .then(call)
    .then(
      () => null,
      (reason: unknown) => reason,
    );
  expect(error).toBeInstanceOf(DecisionCallError);
  return error as DecisionCallError;
}

describe('createJevClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects missing API key or model version with sanitized config errors', async () => {
    const noKey = await caught(() => createJevClient({ JEV_MODEL_VERSION: env.JEV_MODEL_VERSION }));
    expect(noKey.info).toEqual({ provider: 'jev', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
    const noModel = await caught(() => createJevClient({ TYPESAFE_API_KEY: env.TYPESAFE_API_KEY }));
    expect(noModel.info).toEqual({ provider: 'jev', status: null, kind: 'config', providerErrorCode: 'MODEL_VERSION_MISSING' });
  });

  it('sends a choice question with criteria built from candidate labels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(answerBody({ choice: 'task-a', confidence: 0.9, probabilities: { 'task-a': 0.9, foreign: 0.1 } })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createJevClient(env).decide(request);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: env.JEV_MODEL_VERSION,
      state: request.state,
      questions: { decision: { type: 'choice', instructions: request.instructions, criteria: { 'task-a': 'A', 'task-b': 'B' } } },
    });

    expect(result).toMatchObject({ key: 'task-a', confidence: 0.9, probabilities: { 'task-a': 0.9 }, modelVersion: env.JEV_MODEL_VERSION });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('falls back to describing candidates from non-label fields, then the key, when label is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(answerBody({ choice: 'reply', confidence: 0.9 })));
    vi.stubGlobal('fetch', fetchMock);
    await createJevClient(env).decide({
      decisionType: 'task',
      requestId: request.requestId,
      state: {},
      candidates: [{ key: 'reply' }, { key: 'document', purpose: '설정 문서 생성' }],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.questions.decision.criteria).toEqual({ reply: 'reply', document: 'purpose: 설정 문서 생성' });
    expect(body.questions.decision.instructions).toBe('Choose which task the writer is asking for, given the chapter state.');
  });

  it('prefers the response model field over the requested model when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(answerBody({ choice: 'task-a', confidence: 0.9 }, 'jev-1.13.1'))));
    const result = await createJevClient(env).decide(request);
    expect(result.modelVersion).toBe('jev-1.13.1');
  });

  it('normalizes HTTP 429 and exposes no raw response fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 429)));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 429, kind: 'rate_limited', providerErrorCode: 'HTTP_429' });
    expect(Object.keys(error.info)).toEqual(['provider', 'status', 'kind', 'providerErrorCode']);
  });

  it('normalizes HTTP 422 (request validation failed) as config', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 422)));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 422, kind: 'config', providerErrorCode: 'HTTP_422' });
  });

  it.each([
    ['529 overloaded', () => Promise.resolve(response({}, 529))],
    ['network', () => Promise.reject(new TypeError('network test-key'))],
  ])('normalizes %s failures as unavailable', async (_name, makeFetch) => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(makeFetch));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info.kind).toBe('unavailable');
  });

  it('normalizes invalid JSON without leaking SyntaxError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new SyntaxError('raw JSON failure')) }));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 200, kind: 'invalid_response', providerErrorCode: 'BAD_JSON' });
  });

  it('rejects a returned choice outside the request candidates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(answerBody({ choice: '인물; DROP', confidence: 0.9 }))));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 200, kind: 'invalid_response', providerErrorCode: 'UNKNOWN_KEY' });
  });

  it.each([1.5, -0.1, Number.NaN, '0.9'])('rejects invalid confidence %s as a schema mismatch', async (confidence) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(answerBody({ choice: 'task-a', confidence }))));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 200, kind: 'invalid_response', providerErrorCode: 'SCHEMA_MISMATCH' });
  });

  it('rejects a response missing the decision answer entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ model: env.JEV_MODEL_VERSION, answers: {} })));
    const error = await caught(() => createJevClient(env).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: 200, kind: 'invalid_response', providerErrorCode: 'SCHEMA_MISMATCH' });
  });

  it('normalizes an AbortSignal timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })));
      })),
    );
    const error = await caught(() => createJevClient({ ...env, JEV_TIMEOUT_MS: '10' }).decide(request));
    expect(error.info).toEqual({ provider: 'jev', status: null, kind: 'unavailable', providerErrorCode: 'TIMEOUT' });
  });
});
