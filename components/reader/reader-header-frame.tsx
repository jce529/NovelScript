'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Coins } from 'lucide-react';
import {
  READER_MAIN_TABS,
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

const TOUCH = 'inline-flex min-h-11 items-center px-3 text-sm';

export function ReaderHeaderFrame({ brand, account, loggedIn, balance, balanceSlot }: ReaderHeaderFrameProps) {
  const pathname = usePathname();
  const variant = getHeaderVariant(pathname);
  const [tab, setTab] = useState<ReaderMainTab>('free');

  if (variant === 'viewer') return null;

  if (variant === 'compact') {
    return (
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4">
        {brand}
        {account}
      </header>
    );
  }

  const subRow = getSubRow(tab);

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
      <nav aria-label="메인 탭" className="flex overflow-x-auto px-2" data-row="main">
        {READER_MAIN_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={`${TOUCH} shrink-0 whitespace-nowrap border-b-2 ${
              tab === t.key ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <nav aria-label="서브 메뉴" className="flex overflow-x-auto px-2" data-row="sub">
        {subRow.map((s) =>
          s.href ? (
            <Link
              key={s.key}
              href={s.href}
              className={`${TOUCH} shrink-0 whitespace-nowrap text-muted-foreground hover:text-foreground`}
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
          ),
        )}
      </nav>
    </header>
  );
}
