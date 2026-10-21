import { describe, expect, it } from 'vitest';
import { INSUFFICIENT_BALANCE_MESSAGE, toReaderTopupRequest } from '@/lib/reader/topup-request';

const base = { source: 'viewer' as const, returnPath: '/works/w1/chapters/c1?page=3', chapterId: 'c1' };

describe('toReaderTopupRequest', () => {
  it('maps the exact insufficient message, preserving source/path/query/chapter', () => {
    const r = toReaderTopupRequest({ ...base, result: { ok: false, error: INSUFFICIENT_BALANCE_MESSAGE } });
    expect(r).toEqual({ source: 'viewer', returnPath: '/works/w1/chapters/c1?page=3', chapterId: 'c1' });
    expect(r).not.toHaveProperty('shortage');
    const d = toReaderTopupRequest({ ...base, source: 'work-detail', returnPath: '/works/w1?p=2', result: { ok: false, error: INSUFFICIENT_BALANCE_MESSAGE } });
    expect(d?.source).toBe('work-detail');
  });

  it('returns null for other failures and success', () => {
    for (const result of [
      { ok: true, orderId: 'o' },
      { ok: false, error: '로그인이 필요해요.' },
      { ok: false, error: '네트워크', code: 'content_blinded' as const },
      { ok: false, error: INSUFFICIENT_BALANCE_MESSAGE, code: 'content_unavailable' as const },
      { ok: false, error: '현재 구매할 수 없는 회차예요. 새로고침해주세요.', code: 'content_unavailable' as const },
      { ok: false, error: 'x', code: 'write_suspended' as const },
    ]) expect(toReaderTopupRequest({ ...base, result })).toBeNull();
  });

  it('rejects external or non-works return paths', () => {
    const result = { ok: false, error: INSUFFICIENT_BALANCE_MESSAGE };
    for (const returnPath of ['https://evil.com/works/x', '//evil.com/works/x', '/studio', '/works/x\\y', '/works/x#h'])
      expect(toReaderTopupRequest({ ...base, returnPath, result })).toBeNull();
  });
});
