'use client';

import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ArrowLeft, List, Settings, Lock } from 'lucide-react';
import type { PublicChapter, PublicChapterListItem } from '@/lib/chapters/actions';
import { TocSheet } from '@/components/reader/toc-sheet';
import { ViewerSettingsSheet } from '@/components/reader/viewer-settings-sheet';
import { ViewTracker } from '@/components/reader/view-tracker';
import { purchaseChapterAction, trackChapterOpenAction } from '@/app/works/[workId]/chapters/[chapterId]/actions';

export type ViewerTheme = 'light' | 'sepia' | 'dark';

const THEME_CLASS: Record<ViewerTheme, string> = { light: '', sepia: 'reader-theme-sepia', dark: 'dark' };

export function ViewerShell({
  workId, chapter, prev, next, toc, loggedIn, onSubmitReport,
}: {
  workId: string;
  chapter: PublicChapter;
  prev: PublicChapterListItem | null;
  next: PublicChapterListItem | null;
  toc: PublicChapterListItem[];
  loggedIn: boolean;
  onSubmitReport: (input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(19);
  const [theme, setTheme] = useState<ViewerTheme>('light');
  const [purchasing, startPurchase] = useTransition();
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const purchaseKey = useRef<{ chapterId: string; key: string } | null>(null);
  const router = useRouter();

  function purchase() {
    if (!purchaseKey.current || purchaseKey.current.chapterId !== chapter.id) {
      purchaseKey.current = { chapterId: chapter.id, key: crypto.randomUUID() };
    }
    const key = purchaseKey.current.key;
    startPurchase(async () => {
      setPurchaseError(null);
      try {
        const result = await purchaseChapterAction(chapter.id, key);
        if (result.ok) router.refresh();
        else setPurchaseError(result.error ?? '구매를 완료하지 못했어요.');
      } catch {
        setPurchaseError('연결을 확인하고 다시 시도해주세요.');
      }
    });
  }

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
              <h3 className="text-xl font-semibold">유료 회차</h3>
              <p className="text-muted-foreground">{chapter.priceTier} 토큰으로 이 회차를 소장할 수 있어요.</p>
              {loggedIn ? (
                <Button disabled={purchasing} onClick={purchase}>{purchasing ? '구매 처리 중…' : `${chapter.priceTier} 토큰으로 소장`}</Button>
              ) : <Link href="/login" className="underline">로그인하고 구매하기</Link>}
              {purchaseError && <p role="alert" className="text-sm text-destructive">{purchaseError}</p>}
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
      <TocSheet open={tocOpen} onOpenChange={setTocOpen} workId={workId} toc={toc} currentChapterId={chapter.id} />
      <ViewerSettingsSheet
        open={settingsOpen} onOpenChange={setSettingsOpen}
        fontSize={fontSize} onFontSizeChange={setFontSize}
        theme={theme} onThemeChange={setTheme}
        workId={workId} chapterId={chapter.id} loggedIn={loggedIn} onSubmitReport={onSubmitReport}
      />
      <ViewTracker onOpen={() => trackChapterOpenAction(workId, chapter.id, chapter.locked)} />
    </div>
  );
}
