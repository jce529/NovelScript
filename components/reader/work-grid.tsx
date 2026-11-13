'use client';

import React, { type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export interface WorkGridEmptyStateObject {
  title: string;
  description?: string;
}

export type WorkGridEmptyState = ReactNode | WorkGridEmptyStateObject;

export interface WorkGridError {
  retry?: (() => void) | string;
}

export interface WorkGridProps {
  children?: ReactNode;
  total: number;
  shown: number;
  loadMoreHref?: string | null;
  emptyState?: WorkGridEmptyState;
  resetHref?: string;
  loading?: boolean;
  error?: WorkGridError | null;
}

export const ALL_GENRE_CHIP_SELECTOR = '[data-genre-chip="전체"]' as const;
export const FILTER_RESET_FOCUS_EVENT = 'reader:filter-reset-focus' as const;

interface FilterResetBridgeGlobal {
  __readerFilterResetPending?: boolean;
  __readerFocusAllGenreChip?: (() => void) | null;
}

export function requestFilterResetFocus(): void {
  const g = globalThis as unknown as FilterResetBridgeGlobal;
  g.__readerFilterResetPending = true;
  if (typeof g.__readerFocusAllGenreChip === 'function') {
    g.__readerFocusAllGenreChip();
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(FILTER_RESET_FOCUS_EVENT));
  }
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    const chip = document.querySelector<HTMLElement>(ALL_GENRE_CHIP_SELECTOR);
    chip?.focus();
  }
}

const SKELETON_COUNT = 12;

const gridListClass =
  'grid grid-cols-3 gap-x-2 gap-y-4 px-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-4 sm:px-0';

const actionButtonClass =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm leading-[1.5] font-semibold text-foreground transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50';

function isEmptyStateObject(value: WorkGridEmptyState): value is WorkGridEmptyStateObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !React.isValidElement(value) &&
    !Array.isArray(value) &&
    'title' in value &&
    typeof (value as WorkGridEmptyStateObject).title === 'string'
  );
}

export function WorkGrid({
  children,
  total,
  shown,
  loadMoreHref = null,
  emptyState,
  resetHref,
  loading = false,
  error = null,
}: WorkGridProps) {
  const router = useRouter();
  const [loadMoreBase, setLoadMoreBase] = React.useState<{
    fromShown: number;
    targetHref: string;
  } | null>(null);
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);
  const prevShownRef = React.useRef<number>(shown);

  const isLoadingMore =
    loadMoreBase !== null &&
    shown <= loadMoreBase.fromShown &&
    loadMoreHref === loadMoreBase.targetHref;

  const appendedCount =
    loadMoreBase !== null && shown > loadMoreBase.fromShown
      ? shown - loadMoreBase.fromShown
      : 0;

  const focusTargetIndex =
    loadMoreBase !== null && shown > loadMoreBase.fromShown
      ? loadMoreBase.fromShown
      : null;

  React.useEffect(() => {
    const prevShown = prevShownRef.current;
    prevShownRef.current = shown;
    const targetIdx =
      focusTargetIndex !== null
        ? focusTargetIndex
        : shown > prevShown && prevShown > 0
          ? prevShown
          : null;
    if (targetIdx === null) return;
    const itemEl = itemRefs.current[targetIdx];
    if (!itemEl) return;
    const linkEl =
      typeof itemEl.querySelector === 'function'
        ? itemEl.querySelector<HTMLElement>('a, [href]')
        : null;
    if (linkEl) {
      linkEl.setAttribute?.('tabindex', '-1');
      linkEl.focus();
    } else {
      itemEl.focus();
    }
  }, [shown, focusTargetIndex]);

  function handleLoadMore() {
    if (!loadMoreHref || isLoadingMore) return;
    setLoadMoreBase({ fromShown: shown, targetHref: loadMoreHref });
    router.push(loadMoreHref, { scroll: false });
  }

  function handleResetClick() {
    requestFilterResetFocus();
  }

  function handleRetryClick() {
    if (error && typeof error.retry === 'function') {
      error.retry();
      return;
    }
    router.refresh?.();
  }

  if (loading) {
    return (
      <div aria-busy="true" data-slot="work-grid-loading" className="flex flex-col gap-6">
        <ul aria-busy="true" className={gridListClass}>
          {Array.from({ length: SKELETON_COUNT }, (_, idx) => (
            <li
              key={idx}
              data-slot="work-grid-skeleton"
              className="flex min-w-0 flex-col gap-1 sm:gap-2 sm:rounded-lg sm:border sm:border-border sm:bg-secondary sm:p-2"
            >
              <div className="aspect-[3/4] w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
              <div className="h-4 w-4/5 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        data-slot="work-grid-error"
        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-12 text-center text-foreground"
      >
        <p className="text-lg leading-[1.2] font-semibold text-foreground">
          목록을 불러오지 못했어요
        </p>
        <p className="text-sm leading-[1.5] font-normal text-muted-foreground">
          잠시 후 다시 시도해 주세요.
        </p>
        {typeof error.retry === 'string' ? (
          <Link href={error.retry} className={cn(actionButtonClass, 'mt-2')}>
            다시 불러오기
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleRetryClick}
            className={cn(actionButtonClass, 'mt-2')}
          >
            다시 불러오기
          </button>
        )}
      </div>
    );
  }

  const items = React.Children.toArray(children);
  const isEmpty = shown === 0 || total === 0 || items.length === 0;

  if (isEmpty) {
    const customObject = emptyState !== undefined && isEmptyStateObject(emptyState) ? emptyState : null;
    const hasCustomReactNode =
      emptyState !== undefined && emptyState !== null && emptyState !== false && !customObject;

    return (
      <div className="flex flex-col gap-6" data-slot="work-grid-empty">
        <div aria-live="polite" className="sr-only" data-slot="work-grid-count">
          {`작품 ${total}개`}
        </div>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-12 text-center">
          {hasCustomReactNode ? (
            (emptyState as ReactNode)
          ) : (
            <>
              <p className="text-lg leading-[1.2] font-semibold text-foreground">
                {customObject ? customObject.title : '조건에 맞는 작품이 없어요'}
              </p>
              <p className="text-sm leading-[1.5] font-normal text-muted-foreground">
                {customObject
                  ? (customObject.description ?? '')
                  : '장르나 정렬 조건을 바꿔 보세요.'}
              </p>
            </>
          )}
          {resetHref ? (
            <Link
              href={resetHref}
              onClick={handleResetClick}
              data-slot="work-grid-reset"
              className={cn(actionButtonClass, 'mt-2')}
            >
              필터 초기화
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  const showLoadMore = Boolean(loadMoreHref) && total > shown;

  return (
    <div className="flex flex-col gap-6" data-slot="work-grid">
      <div aria-live="polite" className="sr-only" data-slot="work-grid-count">
        {`작품 ${total}개`}
      </div>
      {appendedCount > 0 ? (
        <div aria-live="polite" className="sr-only" data-slot="work-grid-more-live">
          {`작품 ${appendedCount}개 더 불러왔어요`}
        </div>
      ) : null}

      <ul className={gridListClass} data-slot="work-grid-list">
        {items.map((child, index) => (
          <li
            key={React.isValidElement(child) && child.key !== null ? child.key : index}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            tabIndex={-1}
            data-slot="work-grid-item"
            data-index={index}
            data-focus-target={focusTargetIndex === index ? 'true' : undefined}
            className="min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {child}
          </li>
        ))}
      </ul>

      {showLoadMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="작품 더 보기"
            disabled={isLoadingMore}
            onClick={handleLoadMore}
            data-slot="work-grid-load-more"
            className={actionButtonClass}
          >
            {isLoadingMore ? '불러오는 중…' : '더보기'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
