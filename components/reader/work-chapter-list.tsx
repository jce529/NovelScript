'use client';

import { useState } from 'react';
import { TocBadge } from '@/components/reader/toc-sheet';
import { paginateChapters } from '@/lib/reader/work-detail';
import type { PublicChapterListItem } from '@/lib/chapters/actions';

/** 10 chapters per page, 5-page button groups, page-number input. Keeps original chapter numbers. */
export function WorkChapterList({ workId, chapters }: { workId: string; chapters: PublicChapterListItem[] }) {
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const view = paginateChapters(chapters, page);

  if (view.empty) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <h3 className="text-xl font-semibold">아직 공개된 회차가 없어요</h3>
        <p className="text-muted-foreground">작가가 회차를 준비하고 있어요.</p>
      </div>
    );
  }

  const go = (next: number) => { setPage(next); setDraft(''); };
  const submitDraft = (event: React.FormEvent) => {
    event.preventDefault();
    const n = Number(draft);
    if (Number.isInteger(n)) go(n);
  };
  const firstButton = view.buttons[0];
  const lastButton = view.buttons[view.buttons.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-border">
        {view.items.map((chapter) => (
          <li key={chapter.id}>
            <a href={`/works/${workId}/chapters/${chapter.id}`} className="flex h-11 items-center gap-2 px-1 text-sm">
              <span>{chapter.orderIndex + 1}화 {chapter.title}</span>
              <TocBadge chapter={chapter} />
            </a>
          </li>
        ))}
      </ul>
      {view.pageCount > 1 && (
        <nav aria-label="회차 페이지" className="flex flex-wrap items-center justify-center gap-1 text-sm">
          <button type="button" aria-label="이전 페이지 묶음" disabled={firstButton === 1}
            onClick={() => go(firstButton - 1)} className="h-8 rounded-lg px-2 disabled:text-muted-foreground">이전</button>
          {view.buttons.map((n) => (
            <button key={n} type="button" aria-current={n === view.page ? 'page' : undefined}
              onClick={() => go(n)}
              className={`h-8 min-w-8 rounded-lg px-2 ${n === view.page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{n}</button>
          ))}
          <button type="button" aria-label="다음 페이지 묶음" disabled={lastButton === view.pageCount}
            onClick={() => go(lastButton + 1)} className="h-8 rounded-lg px-2 disabled:text-muted-foreground">다음</button>
          <form onSubmit={submitDraft} className="ml-2 flex items-center gap-1">
            <input aria-label="페이지 번호" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder={`${view.page}/${view.pageCount}`} className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-center" />
            <button type="submit" className="h-8 rounded-lg px-2 hover:bg-muted">이동</button>
          </form>
        </nav>
      )}
    </div>
  );
}
