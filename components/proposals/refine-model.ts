// 14-08 (D-P14-11) pure helpers for the per-chunk `AI와 다듬기` side chat on the review
// screen. No I/O, no React. The conversation lives only in component state (never stored);
// an answer only fills the 직접 고치기 field and never changes the accept checks.
import { resolveChatOutcome, thrownChatNotice } from '@/lib/ai/chat-request';
import { chatHistoryTurnContent, type ChatTurn } from '@/lib/ai/prompt';
import type { ProviderId } from '@/lib/ai/providers/types';
import type { KeySource } from '@/lib/ai/providers/selection';
import { REFINE_LIMITS, type RefineChunkResult } from '@/lib/proposals/refine-shared';
import { canEditChunk, type ChunkLike } from './review-model';

export const REFINE_USER_LABEL = '나';
export const REFINE_ASSISTANT_LABEL = 'AI';
export const AI_PROVIDER_SETTINGS_HREF = '/studio/settings/ai-providers';

export interface RefineMessage {
  role: 'user' | 'assistant';
  text: string;
  /** Assistant only: `draft ?? reply` from the server, offered for 직접 고치기. */
  candidate?: string;
  /** Assistant only: capped-output note (CAPPED_COPY body). */
  note?: string | null;
}

export interface RefineChat {
  messages: RefineMessage[];
  /** Writer sends on this chunk (refused/removed turns do not count). */
  sends: number;
}

export const EMPTY_REFINE_CHAT: RefineChat = { messages: [], sends: 0 };

/** Same set as 직접 고치기: applicable 바뀜/추가 chunks. */
export function canRefineChunk(h: ChunkLike): boolean {
  return canEditChunk(h);
}

export function appendRefineTurn(chat: RefineChat, message: RefineMessage): RefineChat {
  return { messages: [...chat.messages, message], sends: chat.sends + (message.role === 'user' ? 1 : 0) };
}

/** Drops the trailing user turn (refused / already processed send) and gives the send back. */
export function removeLastUserTurn(chat: RefineChat): RefineChat {
  const last = chat.messages.at(-1);
  if (!last || last.role !== 'user') return chat;
  return { messages: chat.messages.slice(0, -1), sends: Math.max(0, chat.sends - 1) };
}

/** Earlier turns to resend: the last 6, each cut to 2000 characters (server rejects more). */
export function refineHistory(chat: RefineChat): ChatTurn[] {
  return chat.messages.slice(-REFINE_LIMITS.historyTurns).map((m) => ({
    role: m.role,
    content: chatHistoryTurnContent({
      role: m.role, text: m.text, draft: m.role === 'assistant' && m.candidate !== m.text ? m.candidate ?? null : null,
    }).slice(0, REFINE_LIMITS.turnChars),
  })).filter((t) => t.content.length > 0);
}

export function canSendRefine(chat: RefineChat, message: string, busy: boolean): boolean {
  const trimmed = message.trim();
  return !busy && chat.sends < REFINE_LIMITS.sendsPerChunk && trimmed.length > 0 && message.length <= REFINE_LIMITS.messageChars;
}

/** The candidate with the chunk's own trailing newline run, like the 직접 고치기 pre-fill (hunk.after). */
export function candidateForEdit(hunkAfter: string, candidate: string): string {
  const tail = hunkAfter.match(/\n*$/)?.[0] ?? '';
  return candidate.replace(/\n+$/, '') + tail;
}

/**
 * Puts a candidate into the chunk's 직접 고치기 field and opens it. Pure: every other key of
 * the state (in particular the accept selection) is returned by reference, unchanged.
 */
export function injectCandidate<S extends { editing: Record<number, boolean>; edits: Record<number, string> }>(
  state: S, hunk: { index: number; after: string }, candidate: string,
): S {
  return {
    ...state,
    editing: { ...state.editing, [hunk.index]: true },
    edits: { ...state.edits, [hunk.index]: candidateForEdit(hunk.after, candidate) },
  };
}

export interface RefineNotice {
  title: string;
  body: string | null;
  meta: string | null;
  reasonLine: string | null;
  /** Retry resends the frozen attempt with the same idempotency key. */
  retryable: boolean;
  /** Take the writer's turn back out and restore the input. */
  removeUserTurn: boolean;
  settingsHref?: string;
  /** The proposal changed state: the screen must be reloaded. */
  refresh: boolean;
}

/** Failure -> notice. Gateway outcomes go through the AI panel's resolveChatOutcome / CHAT_COPY. */
export function refineNotice(result: RefineChunkResult | null, keySource: KeySource, providerId: ProviderId): RefineNotice {
  if (result === null) {
    const n = thrownChatNotice();
    return { title: n.title, body: n.body, meta: n.meta, reasonLine: n.reasonLine, retryable: n.retryable, removeUserTurn: n.removeUserTurn, refresh: false };
  }
  if (result.ok) throw new Error('refineNotice called with a success result');
  if (result.code === 'chat' && result.chat) {
    const outcome = resolveChatOutcome(result.chat, keySource === 'byok' ? providerId : undefined);
    if (outcome.kind === 'success') return { title: result.error, body: null, meta: null, reasonLine: null, retryable: false, removeUserTurn: true, refresh: false };
    const n = outcome.notice;
    const action = n.byokAction?.kind;
    if (action === 'replacement') {
      // This screen sends with the account default model; there is no in-panel model switch.
      return {
        title: n.title, body: '설정에서 기본 모델이나 API 키를 확인한 뒤 다시 보내 주세요.', meta: null, reasonLine: null,
        retryable: false, removeUserTurn: true, settingsHref: AI_PROVIDER_SETTINGS_HREF, refresh: false,
      };
    }
    return {
      title: n.title, body: n.body, meta: n.meta, reasonLine: n.reasonLine, retryable: n.retryable, removeUserTurn: n.removeUserTurn,
      ...(action === 'invalid_key' ? { settingsHref: AI_PROVIDER_SETTINGS_HREF } : {}), refresh: false,
    };
  }
  const refresh = result.code === 'stale' || result.code === 'not_refinable' || result.code === 'not_found';
  return { title: result.error, body: null, meta: null, reasonLine: null, retryable: result.code === 'failed', removeUserTurn: result.code !== 'failed', refresh };
}
