// 14-08 (D-P14-11) per-chunk `AI와 다듬기`: limits, result contract and copy shared by the
// server module (lib/proposals/refine.ts), the Server Action and the client panel.
// Client-safe: no I/O, no server-only imports.
import type { CappedReason, ChatResult } from '@/lib/ai/chat-result';
import type { ProviderId } from '@/lib/ai/providers/types';
import type { KeySource } from '@/lib/ai/providers/selection';
import type { ChatTurn } from '@/lib/ai/prompt';

export const REFINE_LIMITS = {
  /** Writer's message per send. */
  messageChars: 1000,
  /** Earlier turns the client may resend (context size cap). */
  historyTurns: 6,
  /** Each earlier turn. */
  turnChars: 2000,
  /** Screen-only cap on sends per chunk; the server relies on wallet balance + the generation lock. */
  sendsPerChunk: 6,
} as const;

/** Same caps as the 직접 고침 text the accept action re-validates (0042). */
export const REFINE_CANDIDATE_MAX = { chapter_draft: 100_000, kb_edit: 50_000 } as const;

export interface RefineChunkInput {
  proposalId: string;
  hunkIndex: number;
  /** Opaque detail.seenHash: the chunk is refused as stale when the original changed. */
  seenHash: string;
  message: string;
  /** Earlier turns of this chunk's screen-only conversation, oldest first (never stored). */
  history: ChatTurn[];
  providerId: ProviderId;
  model: string;
  keySource: KeySource;
  /** One per writer send; a retry resends the same key. */
  idempotencyKey: string;
}

export type RefineFailureCode = 'unauthenticated' | 'invalid_input' | 'not_found' | 'not_refinable' | 'stale' | 'failed' | 'chat';

export type RefineChunkResult =
  | {
    ok: true;
    /** The AI's explanation, shown as the bubble. */
    reply: string;
    /** `draft ?? reply`: a candidate for the 직접 고치기 field only. Never applied by the server. */
    candidate: string;
    wasCapped: boolean;
    cappedReason?: CappedReason;
    remainingBalance?: number;
  }
  | {
    ok: false;
    code: RefineFailureCode;
    error: string;
    /** code 'chat' only: the gateway outcome (no text), mapped on the client with resolveChatOutcome. */
    chat?: ChatResult;
  };

export const REFINE_ERROR_COPY: Record<Exclude<RefineFailureCode, 'chat'>, string> = {
  unauthenticated: '로그인이 필요해요.',
  invalid_input: '요청을 보낼 수 없어요. 요청은 1000자 이하로 써 주세요.',
  not_found: '이 제안을 찾을 수 없어요. 리뷰 큐에서 다시 열어 주세요.',
  not_refinable: '이 변경은 지금 AI와 다듬을 수 없어요. 제안이 이미 처리됐거나 반영할 수 없는 상태예요. 새로고침해 주세요.',
  stale: '원본이 바뀌었어요. 새로고침해서 바뀐 내용을 확인한 뒤 다시 요청해 주세요.',
  failed: '응답을 받지 못했어요. 잠시 후 다시 시도해주세요.',
};
