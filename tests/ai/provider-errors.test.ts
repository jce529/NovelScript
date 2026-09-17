import { describe, expect, it } from 'vitest';
import { REFUSAL_REASON_CODES } from '@/lib/ai/providers/types';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import { CHAT_COPY } from '@/lib/ai/chat-result';

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
