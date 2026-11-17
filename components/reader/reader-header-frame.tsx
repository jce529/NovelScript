'use client';

import { Suspense, type FocusEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, Coins } from 'lucide-react';
import {
  READER_MAIN_TABS,
  buildSubRowHref,
  getActiveMainTab,
  getActiveSubKey,
  getHeaderVariant,
  getSubRow,
  type ReaderMainTab,
} from '@/lib/reader/navigation';

export interface ReaderHeaderFrameProps {
  /** Logo/brand link (server-rendered). */
  brand: ReactNode;
  /** Account panel or login link (server-rendered). */
  account: ReactNode;
  loggedIn: boolean;
  balance: number;
  /**
   * Injection point for the Phase 5 HeaderTokenBalance (03-17). When omitted, a formatted
   * balance and a disabled charge control are rendered for logged-in readers.
   */
  balanceSlot?: ReactNode;
}

const TOUCH =
  'inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-sm transition-colors motion-reduce:transition-none';
const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const SCROLL_ROW =
  'flex overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

function handleItemFocus(event: FocusEvent<HTMLElement>) {
  event.currentTarget?.scrollIntoView?.({
    block: 'nearest',
    inline: 'nearest',
  });
}

function ReaderHeaderSubRowNav({
  activeTab,
  searchParams,
}: {
  activeTab: ReaderMainTab;
  searchParams: Pick<URLSearchParams, 'get'> | null;
}) {
  const subRow = getSubRow(activeTab);
  const activeSub = getActiveSubKey(searchParams?.get('sub'));

  return (
    <nav aria-label="서브 구분" className={SCROLL_ROW} data-row="sub">
      {subRow.map((s) => {
        const href = buildSubRowHref(s, searchParams);
        const isActive = s.sub ? activeSub === s.sub : false;
        return href ? (
          <Link
            key={s.key}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            onFocus={handleItemFocus}
            className={`${TOUCH} ${FOCUS_RING} shrink-0 whitespace-nowrap ${
              isActive
                ? 'font-semibold text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </Link>
        ) : (
          <span
            key={s.key}
            aria-disabled="true"
            title="준비 중"
            className={`${TOUCH} shrink-0 whitespace-nowrap text-muted-foreground opacity-50`}
          >
            {s.label}
          </span>
        );
      })}
    </nav>
  );
}

function ReaderHeaderSubRow({ activeTab }: { activeTab: ReaderMainTab }) {
  const searchParams = useSearchParams();

  return <ReaderHeaderSubRowNav activeTab={activeTab} searchParams={searchParams} />;
}

export function ReaderHeaderFrame({
  brand,
  account,
  loggedIn,
  balance,
  balanceSlot,
}: ReaderHeaderFrameProps) {
  const pathname = usePathname();
  const variant = getHeaderVariant(pathname);

  if (variant === 'viewer') return null;

  if (variant === 'compact') {
    return (
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        {brand}
        {account}
      </header>
    );
  }

  const activeTab = getActiveMainTab(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background" data-header="reader">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        {brand}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            aria-label="검색 (준비 중)"
            title="검색은 준비 중입니다"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground disabled:opacity-60"
          >
            <Search className="size-4" aria-hidden />
          </button>
          {loggedIn
            ? (balanceSlot ?? (
                <div className="flex items-center gap-1 text-sm" data-balance="1">
                  <Coins className="size-4" aria-hidden />
                  <span>{balance.toLocaleString('ko-KR')}</span>
                  <button
                    type="button"
                    disabled
                    title="충전은 준비 중입니다"
                    className="min-h-11 rounded-md px-2 text-xs text-muted-foreground disabled:opacity-60"
                  >
                    충전 (준비 중)
                  </button>
                </div>
              ))
            : null}
          {account}
        </div>
      </div>
      <nav aria-label="연재 구분" className={SCROLL_ROW} data-row="main">
        {READER_MAIN_TABS.map((t) => {
          const isActive = activeTab === t.key;
          return t.href ? (
            <Link
              key={t.key}
              href={t.href}
              aria-current={isActive ? 'page' : undefined}
              onFocus={handleItemFocus}
              className={`${TOUCH} ${FOCUS_RING} shrink-0 whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.key}
              aria-disabled="true"
              title="준비 중"
              className={`${TOUCH} shrink-0 whitespace-nowrap border-b-2 border-transparent text-muted-foreground opacity-50`}
            >
              {t.label}
            </span>
          );
        })}
      </nav>
      {activeTab !== null ? (
        <Suspense
          fallback={<ReaderHeaderSubRowNav activeTab={activeTab} searchParams={null} />}
        >
          <ReaderHeaderSubRow activeTab={activeTab} />
        </Suspense>
      ) : null}
    </header>
  );
}
