'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Lock } from 'lucide-react';
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
                  {chapter.locked && <Lock className="size-3 text-muted-foreground" aria-label="유료 회차" />}
                </a>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
