'use client';

import Link from 'next/link';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Settings, X, Coins } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { signOutAction } from '@/lib/auth/actions';

export function AccountPanel({
  displayName, isWriter, balance,
}: { displayName: string; isWriter: boolean; balance: number }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="계정 메뉴"
        className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium hover:bg-muted/70"
      >
        {displayName.slice(0, 1)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {displayName.slice(0, 1)}
            </div>
            <span className="font-medium">{displayName}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/account"
              aria-label="계정 설정"
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
            >
              <Settings className="size-4" />
            </Link>
            <PopoverPrimitive.Close
              aria-label="닫기"
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="size-4" />
            </PopoverPrimitive.Close>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Coins className="size-4" /> 보유 토큰
          </span>
          <span className="font-medium">{balance.toLocaleString()}</span>
        </div>

        <Link
          href={isWriter ? '/studio' : '/write/start'}
          className="flex h-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          {isWriter ? '작품 관리하기' : '작가 시작하기'}
        </Link>

        <form action={signOutAction}>
          <button type="submit" className="w-full text-center text-xs text-muted-foreground hover:underline">
            로그아웃
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
