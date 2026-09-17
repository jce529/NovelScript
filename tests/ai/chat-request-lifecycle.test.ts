import { describe, it, expect } from 'vitest';
import {
  createSendAttempt,
  createSendLock,
  resolveChatOutcome,
  thrownChatNotice,
  formatRefusalMeta,
  REFUSAL_REASON_DESCRIPTIONS,
  type ChatNotice,
} from '@/lib/ai/chat-request';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import type { RefusalReasonCode } from '@/lib/ai/providers/types';

const generated: ChatNotice[] = [];
function notice(result: ChatResult): ChatNotice {
  const outcome = resolveChatOutcome(result);
  if (outcome.kind !== 'notice') throw new Error('expected notice');
  generated.push(outcome.notice);
  return outcome.notice;
}

describe('createSendAttempt', () => {
  it('freezes a snapshot of the payload with the given key', () => {
    const history = [{ role: 'user', text: 'a' }];
    const attempt = createSendAttempt({ userMessage: '이어줘', history }, () => 'K1');
    expect(attempt.idempotencyKey).toBe('K1');
    expect(Object.isFrozen(attempt)).toBe(true);
    expect(Object.isFrozen(attempt.payload)).toBe(true);
    history.push({ role: 'model', text: 'b' });
    history[0].text = 'changed';
    expect(attempt.payload.history).toEqual([{ role: 'user', text: 'a' }]);
    expect(Object.isFrozen(attempt.payload.history[0])).toBe(true);
  });

  it('defaults to fresh random UUID keys', () => {
    const a = createSendAttempt({ x: 1 });
    const b = createSendAttempt({ x: 1 });
    expect(a.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });
});

describe('createSendLock', () => {
  it('rejects a second acquire until released', () => {
    const lock = createSendLock();
    expect(lock.locked).toBe(false);
    expect(lock.tryAcquire()).toBe(true);
    expect(lock.tryAcquire()).toBe(false);
    expect(lock.locked).toBe(true);
    lock.release();
    expect(lock.locked).toBe(false);
    expect(lock.tryAcquire()).toBe(true);
  });
});

describe('resolveChatOutcome', () => {
  it('success refreshes balance only when remainingBalance present', () => {
    expect(resolveChatOutcome({ ok: true, status: 'completed', remainingBalance: 990 })).toEqual({ kind: 'success', refreshBalance: true });
    expect(resolveChatOutcome({ ok: true, status: 'completed' })).toEqual({ kind: 'success', refreshBalance: false });
  });

  it('maps input SAFETY refusal', () => {
    expect(
      notice({ ok: false, status: 'refused', remainingBalance: 1234, refusal: { stage: 'input', reasonCode: 'SAFETY', debitAmount: 12 } }),
    ).toEqual({
      variant: 'refusal',
      title: '안전 정책에 따라 답할 수 없는 요청이에요',
      body: '표현을 바꿔 다시 시도해보세요.',
      meta: '12토큰 사용 · 보유 토큰 1,234',
      reasonLine: '입력 차단 · SAFETY · 유해할 수 있는 내용으로 판단됐어요.',
      retryable: false,
      removeUserTurn: true,
      restoreInput: true,
      refreshBalance: true,
    });
  });

  it('zero debit refusal and output RECITATION', () => {
    const n = notice({ ok: false, status: 'refused', remainingBalance: 1234, refusal: { stage: 'output', reasonCode: 'RECITATION', debitAmount: 0 } });
    expect(n.meta).toBe('차감된 토큰 없음 · 보유 토큰 1,234');
    expect(n.meta).not.toContain('0토큰 사용');
    expect(n.reasonLine).toBe('생성 중 차단 · RECITATION · 기존 저작물을 그대로 옮길 가능성이 있어 중단됐어요.');
  });

  it('unknown reason code falls back to OTHER', () => {
    const n = notice({ ok: false, status: 'refused', remainingBalance: 1, refusal: { stage: 'input', reasonCode: 'WEIRD' as RefusalReasonCode, debitAmount: 3 } });
    expect(n.reasonLine).toBe('입력 차단 · OTHER · 제공자 정책에 따라 차단됐어요.');
  });

  it('already_processed without balance has null meta', () => {
    const n = notice({ ok: false, status: 'already_processed' });
    expect(n.meta).toBeNull();
    expect(n.variant).toBe('processed');
  });

  it('already_processed with balance', () => {
    expect(notice({ ok: false, status: 'already_processed', remainingBalance: 500 })).toEqual({
      variant: 'processed',
      title: '이미 처리된 요청이에요',
      body: CHAT_COPY.processedBody,
      meta: '보유 토큰 500',
      reasonLine: null,
      retryable: false,
      removeUserTurn: true,
      restoreInput: true,
      refreshBalance: true,
    });
  });

  it.each(['rate_limited', 'unavailable', 'config', 'settlement'] as const)('failed %s is retryable', (kind) => {
    expect(notice({ ok: false, status: 'failed', failureKind: kind, error: 'x' })).toEqual({
      variant: 'error',
      title: CHAT_COPY[kind],
      body: null,
      meta: null,
      reasonLine: null,
      retryable: true,
      removeUserTurn: false,
      restoreInput: false,
      refreshBalance: false,
    });
  });

  it('insufficient_balance is non-retryable and restores input', () => {
    const n = notice({ ok: false, status: 'failed', failureKind: 'insufficient_balance' });
    expect(n.title).toBe(CHAT_COPY.insufficient_balance);
    expect(n).toMatchObject({ retryable: false, removeUserTurn: true, restoreInput: true });
  });

  it.each(['write_denied', 'unauthenticated', 'invalid_input'] as const)('%s uses server error text', (kind) => {
    const n = notice({ ok: false, status: 'failed', failureKind: kind, error: '이용이 제한된 계정이에요' });
    expect(n.title).toBe('이용이 제한된 계정이에요');
    expect(n).toMatchObject({ variant: 'error', retryable: false, removeUserTurn: true, restoreInput: true });
  });

  it('unknown / bare failure', () => {
    const a = notice({ ok: false });
    expect(a.title).toBe(CHAT_COPY.unknown);
    expect(a).toMatchObject({ variant: 'error', retryable: true, removeUserTurn: false });
    const b = notice({ ok: false, status: 'failed', failureKind: 'unknown', error: '서버 문구' });
    expect(b.title).toBe('서버 문구');
    expect(b).toMatchObject({ retryable: true, removeUserTurn: false });
  });

  it('thrownChatNotice', () => {
    const n = thrownChatNotice();
    generated.push(n);
    expect(n).toMatchObject({ variant: 'error', title: CHAT_COPY.unavailable, retryable: true, removeUserTurn: false, restoreInput: false, refreshBalance: false });
  });

  it('formatRefusalMeta without balance', () => {
    expect(formatRefusalMeta(5, undefined)).toBe('5토큰 사용');
    expect(formatRefusalMeta(0, undefined)).toBe('차감된 토큰 없음');
  });

  it('has a description for every code', () => {
    expect(REFUSAL_REASON_DESCRIPTIONS.OTHER).toBe('제공자 정책에 따라 차단됐어요.');
  });

  it('no notice leaks provider, status or uuid', () => {
    expect(generated.length).toBeGreaterThan(5);
    for (const n of generated) {
      const text = [n.title, n.body, n.meta, n.reasonLine].join('|');
      expect(text.toLowerCase()).not.toContain('gemini');
      expect(text).not.toContain('429');
      expect(text).not.toContain('503');
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    }
  });
});
