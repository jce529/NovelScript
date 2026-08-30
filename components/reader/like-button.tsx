'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { toggleLikeAction } from '@/app/works/[workId]/actions';

export function LikeButton({ workId, initialLiked, initialCount, loggedIn }: { workId: string; initialLiked: boolean; initialCount: number; loggedIn: boolean }) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  function onClick() {
    if (!loggedIn) {
      toast.error('로그인이 필요해요.', { action: { label: '로그인하기', onClick: () => { window.location.href = '/login'; } } });
      return;
    }
    startTransition(async () => {
      const result = await toggleLikeAction(workId);
      if (result.ok) {
        setLiked(result.liked!);
        setCount((c) => c + (result.liked ? 1 : -1));
      } else {
        toast.error(result.error ?? '좋아요를 반영하지 못했어요.');
      }
    });
  }

  return (
    <Button variant={liked ? 'default' : 'outline'} size="sm" onClick={onClick}>
      <Heart className={liked ? 'fill-current' : ''} />좋아요 {count}
    </Button>
  );
}
