/** Chat result contract + Korean copy shared by the server action and AiPanel (client-safe). */
import type { DocumentProposal } from '@/lib/ai/prompt';
import type { WriteDenialCode } from '@/lib/auth/write-access';
import type { RefusalReasonCode, UsageReport } from '@/lib/ai/providers/types';
import { PER_REQUEST_MAX_OUTPUT_TOKENS } from '@/lib/ai/cost';
import { BYOK_COPY } from '@/lib/ai/providers/byok-copy';

export type ChatStatus = 'completed' | 'refused' | 'already_processed' | 'failed';

export type ChatFailureKind =
  | 'rate_limited'
  | 'unavailable'
  | 'config'
  | 'settlement'
  | 'insufficient_balance'
  | 'generation_in_progress'
  | 'write_denied'
  | 'unauthenticated'
  | 'invalid_input'
  | 'rejected_output'
  | 'unknown';

export interface ChatRefusalInfo {
  stage: 'input' | 'output';
  reasonCode: RefusalReasonCode;
  /** wallet tokens actually debited for this refused call */
  debitAmount: number;
}

/** Why a completed reply stopped at the output limit (BUG-04 단계 A-1). */
export type CappedReason = 'balance' | 'thinking' | 'request_limit';

/**
 * `ctx.maxOutputTokens` is min(balance budget, PER_REQUEST_MAX_OUTPUT_TOKENS): below the
 * per-request limit means the balance set it. `thinking` is a heuristic for copy only
 * (reasoning at least as long as the visible reply); it never affects debit or limits.
 */
export function classifyCappedReason(
  call: { maxOutputTokens: number; usage: Pick<UsageReport, 'outputTokens' | 'thoughtsTokens'> },
): CappedReason {
  if (call.maxOutputTokens < PER_REQUEST_MAX_OUTPUT_TOKENS) return 'balance';
  const { thoughtsTokens, outputTokens } = call.usage;
  if (thoughtsTokens != null && thoughtsTokens >= outputTokens) return 'thinking';
  return 'request_limit';
}

export const CAPPED_COPY: Record<CappedReason, { title: string; body: string; toast: string }> = {
  balance: {
    title: '토큰이 모두 소진됐어요',
    body: '남은 토큰 범위까지만 응답했어요.',
    toast: '보유 토큰을 모두 사용해서 여기까지만 응답했어요.',
  },
  thinking: {
    title: '답변을 준비하다 길이 제한에 닿았어요',
    body: '토큰은 충분해요. 같은 요청을 다시 보내거나, 요청을 나눠서 보내보세요.',
    toast: '답변을 준비하다 길이 제한에 닿아 여기까지만 응답했어요. 토큰은 충분해요.',
  },
  request_limit: {
    title: '한 번에 낼 수 있는 길이에 닿았어요',
    body: '토큰은 충분해요. "이어서 써줘"라고 보내면 이어서 쓸 수 있어요.',
    toast: '한 번에 낼 수 있는 길이에 닿아 여기까지만 응답했어요. 토큰은 충분해요.',
  },
};

export interface ChatResult {
  ok: boolean;
  status?: ChatStatus;
  failureKind?: ChatFailureKind;
  error?: string;
  reply?: string;
  draft?: string | null;
  proposal?: DocumentProposal | null;
  wasCapped?: boolean;
  /** Set only when wasCapped came from a provider max_tokens stop; absent → balance copy. */
  cappedReason?: CappedReason;
  remainingBalance?: number;
  code?: WriteDenialCode;
  refusal?: ChatRefusalInfo;
}

export const CHAT_COPY = {
  byokPending: BYOK_COPY.sendBoundary,
  rate_limited: '지금 요청이 몰려 있어요. 1분 뒤 다시 시도해주세요.',
  unavailable: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.',
  config: 'AI 기능에 문제가 생겼어요. 계속되면 문의해주세요.',
  settlement: '토큰 차감에 실패해 응답을 표시하지 못했어요. 잠시 후 다시 시도해주세요.',
  insufficient_balance: '보유 토큰을 모두 사용해서 대화할 수 없어요.',
  generation_in_progress: '이미 생성 중이에요. 현재 생성이 끝난 뒤 다시 시도해주세요.',
  unauthenticated: '로그인이 필요해요.',
  invalid_input: '요청 형식이 올바르지 않아요. 새로고침 후 다시 시도해주세요.',
  unknown: '응답을 받지 못했어요. 잠시 후 다시 시도해주세요.',
  walletMissing: '지갑을 찾을 수 없어요.',
  refusedTitle: '안전 정책에 따라 답할 수 없는 요청이에요',
  refusedBody: '표현을 바꿔 다시 시도해보세요.',
  processedTitle: '이미 처리된 요청이에요',
  processedBody:
    '같은 요청이 두 번 전송돼 한 번만 처리했어요. 이전 응답은 다시 불러올 수 없으니, 필요하면 새로 요청해주세요.',
} as const;
