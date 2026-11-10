'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { ProposalFilter } from '@/lib/proposals/queries';
import { QUEUE_FILTERS, filterTabLabel, queueHref } from './review-model';

/**
 * Filter tabs kept in the URL (`?status=`). Links with tab semantics: arrow keys move
 * focus between tabs, Enter follows the link (server re-renders the list).
 */
export function QueueFilterTabs({ workId, filter, pendingCount }: { workId: string; filter: ProposalFilter; pendingCount: number }) {
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent<HTMLAnchorElement>, i: number) {
    const last = QUEUE_FILTERS.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = i === last ? 0 : i + 1;
    else if (event.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="상태 필터" className="grid grid-cols-3 border-b border-border sm:flex sm:gap-2">
      {QUEUE_FILTERS.map((f, i) => {
        const active = f === filter;
        return (
          <Link
            key={f}
            ref={(el) => { refs.current[i] = el; }}
            href={queueHref(workId, f)}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px flex min-h-11 min-w-0 items-center justify-center border-b-2 px-4 text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${active ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {filterTabLabel(f, pendingCount)}
          </Link>
        );
      })}
    </div>
  );
}

/** `제안을 거절했어요.` after a reject redirect; focus moves here (UI-SPEC Interaction 9). */
export function QueueStatusNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <p ref={ref} tabIndex={-1} role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm outline-none">{message}</p>;
}

export function ReloadButton() {
  const router = useRouter();
  return <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => router.refresh()}>다시 불러오기</Button>;
}
