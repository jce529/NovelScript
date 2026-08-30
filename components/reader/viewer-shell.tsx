'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ArrowLeft, List, Settings, Lock } from 'lucide-react';
import type { PublicChapter, PublicChapterListItem } from '@/lib/chapters/actions';

export type ViewerTheme = 'light' | 'sepia' | 'dark';

const THEME_CLASS: Record<ViewerTheme, string> = { light: '', sepia: 'reader-theme-sepia', dark: 'dark' };

export function ViewerShell({
  workId, chapter, prev, next,
}: {
  workId: string;
  chapter: PublicChapter;
  prev: PublicChapterListItem | null;
  next: PublicChapterListItem | null;
}) {
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<ViewerTheme>('light');

  return (
    <div className={`flex min-h-screen flex-col bg-background text-foreground ${THEME_CLASS[theme]}`}>
      <header className="sticky top-0 z-10 flex h-12 items-center justify-between border-b border-border bg-background px-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Link href={`/works/${workId}`} aria-label="뒤로가기" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
                <ArrowLeft className="size-4" />
              </Link>
            }
          />
          <TooltipContent>뒤로가기</TooltipContent>
        </Tooltip>
        <span className="line-clamp-1 flex-1 px-2 text-center text-sm font-medium">{chapter.title}</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="목차" onClick={() => setTocOpen(true)}><List className="size-4" /></Button>}
            />
            <TooltipContent>목차</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="보기 설정" onClick={() => setSettingsOpen(true)}><Settings className="size-4" /></Button>}
            />
            <TooltipContent>보기 설정</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-8">
        <div
          className="mx-auto max-w-[720px] whitespace-pre-wrap font-normal"
          style={{
            fontSize,
            lineHeight: 1.9,
            fontFamily: 'var(--font-geist-sans), -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
          }}
        >
          {chapter.locked ? (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <Lock className="size-6 text-muted-foreground" />
              <h3 className="text-xl font-semibold">결제 기능 준비중</h3>
              <p className="text-muted-foreground">곧 유료 회차를 만나보실 수 있어요.</p>
            </div>
          ) : (
            chapter.content
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 flex h-14 items-center justify-between border-t border-border bg-background px-2">
        <Link
          href={prev ? `/works/${workId}/chapters/${prev.id}` : '#'}
          aria-disabled={!prev}
          className={`inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium ${prev ? 'text-foreground hover:bg-muted' : 'pointer-events-none text-muted-foreground'}`}
        >
          이전화
        </Link>
        <button type="button" onClick={() => setTocOpen(true)} className="text-sm text-muted-foreground">
          {chapter.orderIndex + 1}화
        </button>
        <Link
          href={next ? `/works/${workId}/chapters/${next.id}` : '#'}
          aria-disabled={!next}
          className={`inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium ${next ? 'bg-primary text-primary-foreground' : 'pointer-events-none bg-muted text-muted-foreground'}`}
        >
          다음화
        </Link>
      </footer>
      {/* Task 2 wires <TocSheet>/<ViewerSettingsSheet> here, controlled by tocOpen/settingsOpen/fontSize/theme above */}
      {/* Task 3 wires <ViewTracker> here */}
    </div>
  );
}
