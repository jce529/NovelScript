'use client';

import { AlertCircle } from 'lucide-react';
import type { DocumentProposal } from '@/lib/ai/prompt';

export interface ChatMessageBubbleProps {
  text: string;
  /** Chapter-prose draft this turn offered, if any. */
  draft: string | null;
  /** KB(설정집) document this turn proposed, if any. */
  proposal: DocumentProposal | null;
  /** Set once the proposal has been saved — disables the save button. */
  savedNodeId?: string;
  wasCapped: boolean;
  /** Only the latest assistant message is interactive (다시 생성하기/거부하고
   * 지우기) — older turns are read-only history, but 삽입하기/저장하기 stay
   * available on every turn that carries a draft/proposal. */
  interactive: boolean;
  isBusy: boolean;
  onInsertDraft: () => void;
  onSaveProposal: () => void;
  onRegenerate: () => void;
  onReject: () => void;
}

/** One assistant turn in the unified AI 패널 chat (this session's redesign —
 * no separate "생성하기" button, no separate 기획 대화 lane). Replaces the old
 * GenerationPreview (본문-only) and PlanChat (문서-only) components: a single
 * turn may carry a plain reply, a 본문 draft, a 문서 proposal, or nothing
 * actionable at all — the AI decides per RESPONSE_PROTOCOL_INSTRUCTIONS. */
export function ChatMessageBubble({
  text, draft, proposal, savedNodeId, wasCapped, interactive, isBusy,
  onInsertDraft, onSaveProposal, onRegenerate, onReject,
}: ChatMessageBubbleProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-secondary px-3 py-2 text-sm whitespace-pre-wrap">
      {text}

      {wasCapped && (
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">토큰이 모두 소진됐어요</p>
            <p className="text-xs">남은 토큰 범위까지만 응답했어요.</p>
          </div>
        </div>
      )}

      {draft && (
        <div className="rounded-md border border-border bg-background p-2">
          <p className="mb-2 text-xs font-medium text-muted-foreground">본문 초안</p>
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">{draft}</p>
          <button
            type="button"
            onClick={onInsertDraft}
            disabled={isBusy}
            className="mt-2 rounded border border-border px-2 py-1 text-xs font-medium text-primary disabled:opacity-50"
          >
            본문에 삽입하기
          </button>
        </div>
      )}

      {proposal && (
        <div className="rounded-md border border-border bg-background p-2">
          <p className="text-xs font-medium">[{proposal.category}] {proposal.name}</p>
          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-muted-foreground">{proposal.content}</p>
          <button
            type="button"
            onClick={onSaveProposal}
            disabled={isBusy || Boolean(savedNodeId)}
            className="mt-2 rounded border border-border px-2 py-1 text-xs font-medium text-primary disabled:opacity-50"
          >
            {savedNodeId ? '문서로 저장됨 ✓' : '문서로 저장하기'}
          </button>
        </div>
      )}

      {interactive && (
        <div className="flex gap-3 border-t border-border pt-2 text-xs">
          <button type="button" onClick={onRegenerate} disabled={isBusy} className="font-medium text-muted-foreground disabled:opacity-50">
            다시 생성하기
          </button>
          <button type="button" onClick={onReject} disabled={isBusy} className="font-medium text-muted-foreground disabled:opacity-50">
            거부하고 지우기
          </button>
        </div>
      )}
    </div>
  );
}
