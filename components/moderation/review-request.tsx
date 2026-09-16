'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getReviewPanelStateAction, requestReviewAction, type ReviewPanelState } from '@/lib/moderation/actions';
import {
  REVIEW_BADGE, REVIEW_ERRORS, REVIEW_REQUEST_LABEL, REVIEW_REQUESTED_LABEL,
} from '@/lib/moderation/user-actions';

/*
 * D-15/D-16 writer command. Shown only while the target is blinded (or a request is pending).
 * The writer can only request; saving or re-publishing never clears the blind, and the
 * resolution is an operator decision in the separate admin review tab.
 */

export function ReviewRequestPanel({
  workId, chapterId, initialState,
}: {
  workId: string;
  chapterId: string | null;
  /** Server-rendered state (studio work page). When omitted the panel loads it itself. */
  initialState?: ReviewPanelState;
}) {
  const router = useRouter();
  const [state, setState] = useState<ReviewPanelState | null>(initialState ?? null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (initialState) return;
    let cancelled = false;
    getReviewPanelStateAction(workId, chapterId)
      .then((next) => { if (!cancelled) setState(next); })
      .catch(() => { if (!cancelled) setError(REVIEW_ERRORS.unavailable); });
    return () => { cancelled = true; };
  }, [workId, chapterId, initialState]);

  if (!state || !state.target.ok) {
    return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
  }
  const { blinded, blindReason, latestRequest } = state.target.state;
  const open = latestRequest?.status === 'open';
  if (!blinded && !open) return null;

  const target = chapterId ? '이 회차' : '이 작품';

  function submit() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await requestReviewAction({ workId, chapterId, message: message.trim() || null });
        if (result.ok || result.code === 'duplicate') {
          if (!result.ok) setError(result.error);
          const refreshed = await getReviewPanelStateAction(workId, chapterId);
          setState(refreshed);
          setMessage('');
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError(REVIEW_ERRORS.unavailable);
      }
    });
  }

  return (
    <section aria-label="재검토" className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary"><EyeOff aria-hidden /> {REVIEW_BADGE}</Badge>
        <span className="text-sm text-muted-foreground">{target}은 운영 검토로 독자에게 보이지 않아요.</span>
      </div>
      {blindReason && <p className="text-sm whitespace-pre-wrap break-words">사유: {blindReason}</p>}
      <p className="text-xs text-muted-foreground">
        내용을 수정해 저장해도 자동으로 해제되지 않아요. 수정한 뒤 재검토를 요청하면 운영자가 확인해요.
      </p>
      {latestRequest?.status === 'maintained' && !open && (
        <p className="text-sm text-muted-foreground">이전 재검토 요청은 유지로 결정됐어요. 추가 수정 후 다시 요청할 수 있어요.</p>
      )}
      {open ? (
        <Button variant="outline" disabled className="w-fit">{REVIEW_REQUESTED_LABEL}</Button>
      ) : (
        <>
          <Textarea
            aria-label="재검토 요청 메모 (선택)"
            placeholder="수정한 내용을 간단히 적어주세요 (선택)"
            maxLength={2000}
            value={message}
            disabled={pending || state.writeDenied !== null}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            className="w-fit"
            disabled={pending || state.writeDenied !== null}
            onClick={submit}
          >
            {pending ? '요청 중…' : REVIEW_REQUEST_LABEL}
          </Button>
          {state.writeDenied && <p className="text-sm text-muted-foreground">{state.writeDenied}</p>}
        </>
      )}
      {error && <p role="alert" aria-live="polite" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
