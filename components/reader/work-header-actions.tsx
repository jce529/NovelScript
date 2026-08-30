'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Bell, Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { toggleSubscriptionAction, toggleBookmarkAction } from '@/app/works/[workId]/actions';

export function WorkHeaderActions({
  workId, initialSubscribed, initialBookmarked, loggedIn,
}: { workId: string; initialSubscribed: boolean; initialBookmarked: boolean; loggedIn: boolean }) {
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [, startTransition] = useTransition();

  function requireLogin() {
    toast.error('로그인이 필요해요.', { action: { label: '로그인하기', onClick: () => { window.location.href = '/login'; } } });
  }

  function onToggleSubscription() {
    if (!loggedIn) return requireLogin();
    startTransition(async () => {
      const result = await toggleSubscriptionAction(workId);
      if (result.ok) setSubscribed(result.subscribed!);
      else toast.error(result.error ?? '알림 설정을 변경하지 못했어요.');
    });
  }

  function onToggleBookmark() {
    if (!loggedIn) return requireLogin();
    startTransition(async () => {
      const result = await toggleBookmarkAction(workId);
      if (result.ok) setBookmarked(result.bookmarked!);
      else toast.error(result.error ?? '선호작 설정을 변경하지 못했어요.');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" onClick={onToggleSubscription} aria-label={subscribed ? '알림 해제하기' : '알림 받기'}>
              <Bell className={subscribed ? 'fill-primary text-primary' : ''} />
            </Button>
          }
        />
        <TooltipContent>{subscribed ? '알림 해제하기' : '알림 받기'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" onClick={onToggleBookmark} aria-label={bookmarked ? '선호작 해제' : '선호작 등록'}>
              <Bookmark className={bookmarked ? 'fill-primary text-primary' : ''} />
            </Button>
          }
        />
        <TooltipContent>{bookmarked ? '선호작 해제' : '선호작 등록'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
