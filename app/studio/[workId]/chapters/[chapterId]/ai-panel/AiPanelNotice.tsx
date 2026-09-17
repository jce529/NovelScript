'use client';

import { useState, type Ref } from 'react';
import { AlertCircle, ChevronDown, Info, RotateCw, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatNotice } from '@/lib/ai/chat-request';
import { cn } from '@/lib/utils';

export interface AiPanelNoticeProps {
  id: string;
  notice: ChatNotice;
  disabled: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
  retryButtonRef?: Ref<HTMLButtonElement>;
  /** test/SSR hook only; runtime starts collapsed (UI-SPEC §3) */
  defaultExpanded?: boolean;
}

/** Refusal / already-processed / error notice above the AI panel input (UI-SPEC Layout & Placement).
 * Renders only notice fields — never provider name, HTTP status or idempotency key. */
export function AiPanelNotice({
  id, notice, disabled, onDismiss, onRetry, retryButtonRef, defaultExpanded,
}: AiPanelNoticeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const isError = notice.variant === 'error';
  const isRefusal = notice.variant === 'refusal';
  // UI-SPEC §2: refusal/processed keys are already recorded in the ledger — never retry them.
  const showRetry = isError && notice.retryable && Boolean(onRetry);
  const Icon = isRefusal ? ShieldAlert : notice.variant === 'processed' ? Info : AlertCircle;
  const reasonId = `${id}-reason`;
  const reasonParts = notice.reasonLine?.split(' · ') ?? [];

  return (
    <div
      className={cn(
        'max-h-48 overflow-y-auto rounded-lg bg-muted p-3 border',
        isError ? 'border-destructive/40' : 'border-border',
      )}
    >
      <div className="flex items-start gap-2">
        <Icon
          aria-hidden
          className={cn('mt-0.5 size-4 shrink-0', isError ? 'text-destructive' : 'text-muted-foreground')}
        />
        <div className="flex flex-1 flex-col gap-1">
          <p className={cn('text-sm font-medium break-keep', isError ? 'text-destructive' : 'text-foreground')}>
            {notice.title}
          </p>
          {notice.body !== null && <p className="text-sm break-keep">{notice.body}</p>}
          {notice.meta !== null && <p className="text-xs text-muted-foreground tabular-nums">{notice.meta}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="알림 닫기"
          onClick={onDismiss}
        >
          <X aria-hidden />
        </Button>
      </div>

      {(showRetry || isRefusal) && (
        <div className="flex gap-2 pt-2">
          {showRetry && (
            <Button variant="outline" size="sm" ref={retryButtonRef} disabled={disabled} onClick={onRetry}>
              <RotateCw aria-hidden />
              다시 시도
            </Button>
          )}
          {isRefusal && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={reasonId}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? '거절 사유 접기' : '거절 사유 보기'}
              <ChevronDown
                aria-hidden
                className={cn('transition-transform motion-reduce:transition-none', expanded && 'rotate-180')}
              />
            </Button>
          )}
        </div>
      )}

      {isRefusal && expanded && notice.reasonLine !== null && (
        <div id={reasonId} className="border-t border-border pt-2">
          {reasonParts.length === 3 ? (
            <p className="text-xs">
              {reasonParts[0]}
              {' · '}
              <span className="font-mono">{reasonParts[1]}</span>
              {' · '}
              <span className="text-muted-foreground">{reasonParts[2]}</span>
            </p>
          ) : (
            <p className="text-xs">{notice.reasonLine}</p>
          )}
        </div>
      )}
    </div>
  );
}
