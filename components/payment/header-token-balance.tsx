'use client';

import { Coins, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTokenTopup } from './token-topup-provider';

export function HeaderTokenBalance({ balance, loggedIn }: { balance: number; loggedIn: boolean }) {
  const { openTopup } = useTokenTopup();
  if (!loggedIn) return null;
  return (
    <div className="flex items-center gap-1 text-sm">
      <Coins aria-hidden className="size-4 text-muted-foreground" />
      <span className="font-medium">{balance.toLocaleString('ko-KR')}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="토큰 충전하기"
        onClick={() => openTopup({ source: 'header' })}
      >
        <Plus />
      </Button>
    </div>
  );
}
