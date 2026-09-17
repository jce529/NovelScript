/** Chat result contract + Korean copy shared by the server action and AiPanel (client-safe). */
import type { DocumentProposal } from '@/lib/ai/prompt';
import type { WriteDenialCode } from '@/lib/auth/write-access';
import type { RefusalReasonCode } from '@/lib/ai/providers/types';

export type ChatStatus = 'completed' | 'refused' | 'already_processed' | 'failed';

export type ChatFailureKind =
  | 'rate_limited'
  | 'unavailable'
  | 'config'
  | 'settlement'
  | 'insufficient_balance'
  | 'write_denied'
  | 'unauthenticated'
  | 'invalid_input'
  | 'unknown';

export interface ChatRefusalInfo {
  stage: 'input' | 'output';
  reasonCode: RefusalReasonCode;
  /** wallet tokens actually debited for this refused call */
  debitAmount: number;
}

export interface ChatResult {
  ok: boolean;
  status?: ChatStatus;
  failureKind?: ChatFailureKind;
  error?: string;
  reply?: string;
  draft?: string | null;
  proposal?: DocumentProposal | null;
  wasCapped?: boolean;
  remainingBalance?: number;
  code?: WriteDenialCode;
  refusal?: ChatRefusalInfo;
}

export const CHAT_COPY = {
  rate_limited: '지금 요청이 몰려 있어요. 1분 뒤 다시 시도해주세요.',
  unavailable: 'AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.',
  config: 'AI 기능에 문제가 생겼어요. 계속되면 문의해주세요.',
  settlement: '토큰 차감에 실패해 응답을 표시하지 못했어요. 잠시 후 다시 시도해주세요.',
  insufficient_balance: '보유 토큰을 모두 사용해서 대화할 수 없어요.',
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
