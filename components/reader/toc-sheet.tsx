'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EyeOff, Lock } from 'lucide-react';
import { REVIEW_BADGE, tocRowBadge } from '@/lib/moderation/user-actions';
import type { PublicChapterListItem } from '@/lib/chapters/actions';

export function TocSheet({
  open, onOpenChange, workId, toc, currentChapterId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  workId: string;
  toc: PublicChapterListItem[];
  currentChapterId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader><SheetTitle>회차 목록</SheetTitle></SheetHeader>
        <ul className="flex flex-col overflow-y-auto">
          {toc.map((chapter) => {
            const isCurrent = chapter.id === currentChapterId;
            return (
              <li key={chapter.id}>
                <a
                  href={`/works/${workId}/chapters/${chapter.id}`}
                  className={`flex h-11 items-center gap-2 border-l-2 px-3 text-sm ${isCurrent ? 'border-primary font-semibold' : 'border-transparent font-normal text-foreground'}`}
                >
                  <span>{chapter.orderIndex + 1}화 {chapter.title}</span>
                  <TocBadge chapter={chapter} />
                </a>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/** D-14: blinded rows keep their number with a review badge; paid rows keep the price lock. */
export function TocBadge({ chapter }: { chapter: PublicChapterListItem }) {
  const badge = tocRowBadge(chapter);
  if (badge === 'review') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <EyeOff className="size-3" aria-hidden /> {REVIEW_BADGE}
      </span>
    );
  }
  if (badge === 'paid') return <Lock className="size-3 text-muted-foreground" aria-label="유료 회차" />;
  return null;
}
