import { describe, expect, it, vi, afterEach } from 'vitest';
import { REFUSAL_REASON_CODES } from '@/lib/ai/providers/types';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { toSanitizedProviderError, ProviderCallError, logProviderFailure } from '@/lib/ai/providers/errors';
import type { SanitizedProviderError } from '@/lib/ai/providers/types';

describe('contracts', () => {
  it('REFUSAL_REASON_CODES covers the safety-family finish reasons', () => {
    expect([...REFUSAL_REASON_CODES].sort()).toEqual(
      ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION', 'OTHER'].sort(),
    );
  });

  it('MODEL_TIER_TO_ID maps both tiers to gemini-3.5-flash', () => {
    expect(MODEL_TIER_TO_ID).toEqual({ lite: 'gemini-3.5-flash', pro: 'gemini-3.5-flash' });
  });

  it('CHAT_COPY matches UI-SPEC copy verbatim', () => {
    expect(CHAT_COPY.rate_limited).toBe('지금 요청이 몰려 있어요. 1분 뒤 다시 시도해주세요.');
    expect(CHAT_COPY.unavailable).toBe('AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.');
    expect(CHAT_COPY.config).toBe('AI 기능에 문제가 생겼어요. 계속되면 문의해주세요.');
    expect(CHAT_COPY.settlement).toBe('토큰 차감에 실패해 응답을 표시하지 못했어요. 잠시 후 다시 시도해주세요.');
    expect(CHAT_COPY.insufficient_balance).toBe('보유 토큰을 모두 사용해서 대화할 수 없어요.');
    expect(CHAT_COPY.unauthenticated).toBe('로그인이 필요해요.');
    expect(CHAT_COPY.invalid_input).toBe('요청 형식이 올바르지 않아요. 새로고침 후 다시 시도해주세요.');
    expect(CHAT_COPY.unknown).toBe('응답을 받지 못했어요. 잠시 후 다시 시도해주세요.');
    expect(CHAT_COPY.walletMissing).toBe('지갑을 찾을 수 없어요.');
    expect(CHAT_COPY.refusedTitle).toBe('안전 정책에 따라 답할 수 없는 요청이에요');
    expect(CHAT_COPY.refusedBody).toBe('표현을 바꿔 다시 시도해보세요.');
    expect(CHAT_COPY.processedTitle).toBe('이미 처리된 요청이에요');
    expect(CHAT_COPY.processedBody).toBe(
      '같은 요청이 두 번 전송돼 한 번만 처리했어요. 이전 응답은 다시 불러올 수 없으니, 필요하면 새로 요청해주세요.',
    );
  });
});

describe('toSanitizedProviderError', () => {
  it.each([
    [429, 'rate_limited', 'RESOURCE_EXHAUSTED'],
    [500, 'unavailable', 'INTERNAL'],
    [503, 'unavailable', 'UNAVAILABLE'],
    [504, 'unavailable', 'DEADLINE_EXCEEDED'],
    [502, 'unavailable', null],
    [400, 'config', 'INVALID_ARGUMENT'],
    [401, 'config', 'UNAUTHENTICATED'],
    [403, 'config', 'PERMISSION_DENIED'],
    [404, 'config', 'NOT_FOUND'],
    [409, 'config', null],
  ])('status %i -> %s / %s', (status, kind, code) => {
    const err = Object.assign(new Error('boom'), { status });
    expect(toSanitizedProviderError('gemini', err)).toEqual({
      provider: 'gemini',
      status,
      kind,
      providerErrorCode: code,
    });
  });

  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  it.each([
    ['TypeError', new TypeError('fetch failed')],
    ['AbortError', abort],
    ['string', 'oops'],
    ['null', null],
    ['undefined', undefined],
    ['string status', { status: '429' }],
    ['NaN status', { status: NaN }],
    ['status 42', { status: 42 }],
    ['status 700', { status: 700 }],
    ['status 429.5', { status: 429.5 }],
  ])('no usable status (%s) -> unavailable/null', (_label, err) => {
    expect(toSanitizedProviderError('gemini', err)).toEqual({
      provider: 'gemini',
      status: null,
      kind: 'unavailable',
      providerErrorCode: null,
    });
  });

  const SENTINEL = 'sk-SENTINEL-abc123';
  function sentinelError() {
    const err = new Error(`request failed key=${SENTINEL}`, { cause: new Error(SENTINEL) });
    err.stack = `Error: ${SENTINEL}\n at x`;
    return Object.assign(err, {
      status: 401,
      config: { headers: { Authorization: `Bearer ${SENTINEL}` } },
      request: { body: `prompt ${SENTINEL}` },
      headers: { 'x-goog-api-key': SENTINEL },
      code: SENTINEL,
      providerErrorCode: SENTINEL,
      details: [{ reason: SENTINEL }],
    });
  }

  it('never leaks secrets from the raw error (SENTINEL)', () => {
    const result = toSanitizedProviderError('gemini', sentinelError());
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(Object.keys(result).sort()).toEqual(['kind', 'provider', 'providerErrorCode', 'status']);
    expect(result).toEqual({ provider: 'gemini', status: 401, kind: 'config', providerErrorCode: 'UNAUTHENTICATED' });
  });

  describe('ProviderCallError', () => {
    it('carries only sanitized info', () => {
      const info: SanitizedProviderError = toSanitizedProviderError('gemini', sentinelError());
      const e = new ProviderCallError(info);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('ProviderCallError');
      expect(e.message).toBe('provider_call_failed:gemini:config');
      expect(e.info).toEqual(info);
      expect(e.cause).toBeUndefined();
      expect(Object.keys(JSON.parse(JSON.stringify(e.info))).sort()).toEqual([
        'kind',
        'provider',
        'providerErrorCode',
        'status',
      ]);
      expect(JSON.stringify(e.info)).not.toContain(SENTINEL);
    });
  });

  describe('logProviderFailure', () => {
    afterEach(() => vi.restoreAllMocks());
    it('logs once with allowlisted fields', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const info = toSanitizedProviderError('gemini', sentinelError());
      logProviderFailure(info, 'k-uuid');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('[ai] provider call failed', {
        provider: 'gemini',
        status: 401,
        kind: 'config',
        idempotencyKey: 'k-uuid',
      });
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SENTINEL);
    });
  });
});
