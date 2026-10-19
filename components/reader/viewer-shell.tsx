'use client';

import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState, useTransition, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, EyeOff, List, Settings, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { PublicChapter, PublicChapterListItem } from '@/lib/chapters/actions';
import { ChapterPurchaseEntry } from '@/components/reader/chapter-purchase-entry';
import { TocSheet } from '@/components/reader/toc-sheet';
import { ViewerSettingsPopover } from '@/components/reader/viewer-settings-sheet';
import { ViewTracker, chapterVisitKey } from '@/components/reader/view-tracker';
import { useReadingProgress } from '@/components/reader/use-reading-progress';
import styles from '@/components/reader/viewer.module.css';
import { trackChapterOpenAction } from '@/app/works/[workId]/chapters/[chapterId]/actions';
import { toggleSubscriptionAction } from '@/app/works/[workId]/actions';
import { UNAVAILABLE_CONTENT_MESSAGE } from '@/lib/access/actions';
import { viewerLockModel } from '@/lib/moderation/user-actions';
import type { ChapterReadingState } from '@/lib/reader/chapter-reading';
import type { ViewerPreferences } from '@/lib/reader/viewer-preferences';
import {
  END_DIALOG_COPY,
  INITIAL_CHROME,
  chromeReducer,
  hiddenBarAttrs,
  isInteractiveTarget,
  nextControl,
  prevControl,
  shouldCallToggleSubscription,
} from '@/lib/reader/viewer-chrome';

const END_SENTINEL_MS = 1000;
const BAR_TRANSITION = 'transition-transform duration-200 motion-reduce:transition-none';

export function ViewerShell({
  workId, chapter, prev, next, toc, loggedIn, onSubmitReport,
  initialPreferences, initialReadingState, initialSubscribed,
}: {
  workId: string;
  chapter: PublicChapter;
  prev: PublicChapterListItem | null;
  next: PublicChapterListItem | null;
  toc: PublicChapterListItem[];
  loggedIn: boolean;
  onSubmitReport: (input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) => Promise<{ ok: boolean; error?: string }>;
  initialPreferences: ViewerPreferences;
  initialReadingState: ChapterReadingState | null;
  initialSubscribed: boolean;
}) {
  const [chrome, dispatch] = useReducer(chromeReducer, INITIAL_CHROME);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [subscribing, startSubscribe] = useTransition();
  // undefined = open snapshot not back yet; null = opened without a snapshot.
  const [openState, setOpenState] = useState<ChapterReadingState | null | undefined>(undefined);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const interacted = useRef(false);
  // D-13: blind wins over entitlement and payment; only purchase_required may show a purchase CTA.
  const lock = viewerLockModel(chapter);
  const readable = lock.kind === 'content';
  const isLast = next === null;
  // One session id per visit (the page keys this shell by chapter id): shared by open + save.
  const [sessionId] = useState(() => crypto.randomUUID());

  const progress = useReadingProgress({
    chapterId: chapter.id,
    workId,
    readable,
    loggedIn,
    bodyRef,
    sentinelRef,
    sessionId,
    initialState: openState === undefined ? undefined : (openState ?? initialReadingState),
  });
  const flush = progress.flush;

  // Link scroll={false} keeps the old scroll offset: start a new visit at the top; the hook
  // restores the saved ratio afterwards when there is one.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'hide' });
    };
    const mark = () => { interacted.current = true; };
    window.addEventListener('keydown', onKey);
    for (const ev of ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const) window.addEventListener(ev, mark, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      for (const ev of ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const) window.removeEventListener(ev, mark);
    };
  }, []);

  // Last chapter: sentinel fully visible for 1s after a real user interaction opens the end dialog once.
  // Restoration and settings reflow are programmatic, so they never arm it.
  const showEnd = isLast && readable;
  useEffect(() => {
    if (!showEnd || !sentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    let timer: number | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        const full = !!last && last.isIntersecting && last.intersectionRatio >= 1;
        if (timer !== null) { window.clearTimeout(timer); timer = null; }
        if (full) {
          timer = window.setTimeout(() => {
            timer = null;
            if (interacted.current) dispatch({ type: 'sentinel-end', isLast: true });
          }, END_SENTINEL_MS);
        }
      },
      { threshold: 1 },
    );
    io.observe(sentinelRef.current);
    return () => {
      io.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [showEnd, chapter.id]);

  function onBodyPointerDown(e: React.PointerEvent) {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  }

  function onBodyClick(e: React.MouseEvent) {
    const start = pointerStart.current;
    const movedPx = start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) : 0;
    pointerStart.current = null;
    dispatch({
      type: 'tap',
      tap: {
        movedPx,
        hasSelection: (window.getSelection()?.toString() ?? '').length > 0,
        interactive: isInteractiveTarget(e.target as Element | null),
      },
    });
  }

  const onOverlay = useCallback(
    (overlay: 'toc' | 'settings') => (open: boolean) =>
      dispatch(open ? { type: 'open-overlay', overlay } : { type: 'close-overlay' }),
    [],
  );

  function enableSubscription() {
    if (!shouldCallToggleSubscription({ loggedIn, subscribed })) {
      if (!loggedIn) toast.error('로그인이 필요해요.');
      return;
    }
    startSubscribe(async () => {
      try {
        const result = await toggleSubscriptionAction(workId);
        if (result.ok && 'subscribed' in result && result.subscribed) {
          setSubscribed(true);
          dispatch({ type: 'close-end' });
        } else {
          toast.error(('error' in result && result.error) || '알림 설정을 변경하지 못했어요.');
        }
      } catch {
        toast.error('연결을 확인하고 다시 시도해주세요.');
      }
    });
  }

  const prevState = prevControl(prev);
  const nextState = nextControl(next);
  const barClass = `fixed inset-x-0 z-20 bg-background text-foreground ${BAR_TRANSITION}`;
  const rootStyle = {
    '--viewer-size': `${preferences.fontSize}px`,
    '--viewer-lh': preferences.lineHeight,
    '--viewer-pad': `${preferences.padding}px`,
  } as CSSProperties;
  const visitKey = chapterVisitKey({ chapterId: chapter.id, sessionId, readable });

  return (
    <div
      className={`${styles.viewer} flex min-h-screen flex-col ${preferences.mode === 'dark' ? 'dark' : ''}`}
      data-viewer-theme={preferences.mode}
      data-viewer-font={preferences.font}
      style={rootStyle}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'show' })}
        className="sr-only z-30 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-foreground"
      >
        읽기 메뉴 열기
      </button>

      <header
        className={`${barClass} top-0 border-b border-border ${chrome.visible ? 'translate-y-0' : '-translate-y-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingInline: 'max(0.5rem, env(safe-area-inset-left))' }}
        {...hiddenBarAttrs(chrome.visible)}
      >
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-1">
            <Link
              href={`/works/${workId}`}
              aria-label="홈"
              onClick={() => flush()}
              className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Button variant="ghost" size="icon-sm" aria-label="목차" onClick={() => dispatch({ type: 'open-overlay', overlay: 'toc' })}>
              <List className="size-4" />
            </Button>
          </div>
          <span className="line-clamp-1 flex-1 px-2 text-center text-sm font-medium">{chapter.title}</span>
          <ViewerSettingsPopover
            open={chrome.overlay === 'settings'}
            onOpenChange={onOverlay('settings')}
            preferences={preferences}
            onPreferencesChange={setPreferences}
            trigger={<Button variant="ghost" size="icon-sm" aria-label="보기 설정"><Settings className="size-4" /></Button>}
            workId={workId}
            chapterId={chapter.id}
            loggedIn={loggedIn}
            onSubmitReport={onSubmitReport}
          />
        </div>
      </header>

      <main className="flex-1 py-8" onPointerDown={onBodyPointerDown} onClick={onBodyClick}>
        <div
          ref={bodyRef}
          data-viewer-body=""
          className="mx-auto max-w-[720px] whitespace-pre-wrap font-normal"
          style={{ transition: progress.restoring ? 'opacity 0.1s' : undefined, opacity: progress.restoring ? 0 : 1 }}
        >
          {lock.kind === 'content' ? (
            chapter.content
          ) : lock.kind === 'blinded' ? (
            <div role="status" className="flex flex-col items-center gap-2 py-24 text-center">
              <EyeOff className="size-6 text-muted-foreground" aria-hidden />
              <h3 className="text-xl font-semibold">{lock.title}</h3>
              {lock.reason && <p className="text-muted-foreground">{lock.reason}</p>}
              {lock.entitledNote && <p className="text-sm text-muted-foreground">{lock.entitledNote}</p>}
              <Link href={`/works/${workId}`} className="inline-flex h-11 items-center underline">회차 목록</Link>
            </div>
          ) : lock.kind === 'unavailable' ? (
            <div role="status" className="flex flex-col items-center gap-2 py-24 text-center">
              <Lock className="size-6 text-muted-foreground" aria-hidden />
              <h3 className="text-xl font-semibold">{UNAVAILABLE_CONTENT_MESSAGE}</h3>
              <Link href={`/works/${workId}`} className="inline-flex h-11 items-center underline">회차 목록</Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-24 text-center">
              <Lock className="size-6 text-muted-foreground" />
              <h3 className="text-xl font-semibold">유료 회차</h3>
              <p className="text-muted-foreground">{chapter.priceTier} 토큰으로 이 회차를 소장할 수 있어요.</p>
              {loggedIn ? (
                <ChapterPurchaseEntry chapterId={chapter.id} priceTier={chapter.priceTier} source="viewer" />
              ) : <Link href="/login" className="underline">로그인하고 구매하기</Link>}
            </div>
          )}
        </div>
        {readable && <div ref={sentinelRef} data-reading-sentinel="" aria-hidden className="h-px" />}
      </main>

      <footer
        className={`${barClass} bottom-0 border-t border-border ${chrome.visible ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', paddingInline: 'max(0.5rem, env(safe-area-inset-left))' }}
        {...hiddenBarAttrs(chrome.visible)}
      >
        <div className="flex h-14 items-center justify-between">
          {prevState.disabled ? (
            <span aria-disabled="true" className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium opacity-40">이전화</span>
          ) : (
            <Link
              href={`/works/${workId}/chapters/${prev!.id}`}
              scroll={false}
              onClick={() => flush()}
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium hover:bg-muted"
            >
              이전화
            </Link>
          )}
          <button type="button" disabled aria-disabled="true" className="text-sm text-muted-foreground opacity-60">
            댓글 (준비 중)
          </button>
          {nextState.kind === 'navigate' ? (
            <Link
              href={`/works/${workId}/chapters/${next!.id}`}
              scroll={false}
              onClick={() => flush()}
              className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              다음화
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => dispatch({ type: 'next-click', isLast: true })}
              className="inline-flex h-11 items-center rounded-lg bg-muted px-4 text-sm font-medium text-muted-foreground blur-[0.5px]"
            >
              다음화
            </button>
          )}
        </div>
      </footer>

      <TocSheet
        open={chrome.overlay === 'toc'}
        onOpenChange={onOverlay('toc')}
        workId={workId}
        toc={toc}
        currentChapterId={chapter.id}
        onNavigate={() => flush()}
      />

      <Dialog open={chrome.endDialogOpen} onOpenChange={(open) => { if (!open) dispatch({ type: 'close-end' }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{END_DIALOG_COPY.title}</DialogTitle>
            <DialogDescription>
              {subscribed ? '새 회차 알림을 받고 있어요.' : '새 회차가 올라오면 알려드릴게요.'}
            </DialogDescription>
          </DialogHeader>
          {!subscribed && (
            loggedIn ? (
              <Button disabled={subscribing} onClick={enableSubscription}>{END_DIALOG_COPY.action}</Button>
            ) : (
              <Link href="/login" className="inline-flex h-9 items-center justify-center underline">로그인하고 알림 켜기</Link>
            )
          )}
        </DialogContent>
      </Dialog>

      <ViewTracker
        visitKey={visitKey}
        onOpen={async () => {
          try {
            setOpenState(await trackChapterOpenAction(workId, chapter.id, !readable, sessionId));
          } catch {
            setOpenState(null);
          }
        }}
      />
    </div>
  );
}
