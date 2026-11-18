'use client';

import { useRef, useTransition, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { toggleAuthorSubscriptionAction } from '@/app/author/[authorId]/actions';
import type { ToggleAuthorSubscriptionResult } from '@/lib/author/types';

export const AUTHOR_LOGIN_MESSAGE = '로그인하면 작가의 새 작품과 새 회차 알림을 받을 수 있어요';
const ERROR = '구독 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요';
const SUSPENDED = '계정이 정지되어 알림 구독을 바꿀 수 없어요. 문의가 필요하면 고객센터를 이용해 주세요';
type Snapshot = { notify: boolean; subscriberCount: number };
export type AuthorSubscriptionState = Snapshot & {
  pending: boolean; previous: Snapshot | null; error: string | null; loginRequired: boolean;
};

/** These transitions have no React, DOM, action or clock dependencies. */
export function authorSubscriptionState(notify: boolean, subscriberCount: number): AuthorSubscriptionState {
  return { notify, subscriberCount, pending: false, previous: null, error: null, loginRequired: false };
}

export function beginAuthorSubscription(state: AuthorSubscriptionState): AuthorSubscriptionState {
  if (state.pending) return state;
  return { ...state, previous: { notify: state.notify, subscriberCount: state.subscriberCount },
    notify: !state.notify, subscriberCount: Math.max(0, state.subscriberCount + (state.notify ? -1 : 1)),
    pending: true, error: null, loginRequired: false };
}

export function settleAuthorSubscription(state: AuthorSubscriptionState, result: ToggleAuthorSubscriptionResult): AuthorSubscriptionState {
  if (result.ok) return authorSubscriptionState(result.notify, result.subscriberCount);
  return { ...authorSubscriptionState((state.previous ?? state).notify, (state.previous ?? state).subscriberCount),
    loginRequired: result.code === 'auth_required',
    error: result.code === 'auth_required' ? null
      : result.code === 'write_suspended' || result.code === 'write_forbidden' ? SUSPENDED : ERROR };
}

export function AuthorSubscribeButton({ authorId, loggedIn, isSelf, state, setState }: {
  authorId: string; loggedIn: boolean; isSelf: boolean; state: AuthorSubscriptionState;
  setState: Dispatch<SetStateAction<AuthorSubscriptionState>>;
}) {
  const [transitionPending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const loginHref = `/login?next=${encodeURIComponent(`/author/${authorId}`)}`;

  function requireLogin() {
    setState((previous) => ({ ...previous, loginRequired: true, error: null }));
    toast(AUTHOR_LOGIN_MESSAGE);
  }

  function toggle() {
    if (isSelf || inFlight.current || state.pending || transitionPending) return;
    if (!loggedIn) return requireLogin();
    inFlight.current = true;
    const optimistic = beginAuthorSubscription(state);
    setState(optimistic);
    startTransition(async () => {
      let result: ToggleAuthorSubscriptionResult;
      try { result = await toggleAuthorSubscriptionAction(authorId); }
      catch { result = { ok: false, code: 'unavailable', error: ERROR }; }
      setState(settleAuthorSubscription(optimistic, result));
      inFlight.current = false;
      if (result.ok) toast.success(result.notify ? '작가 알림을 켰어요' : '작가 알림을 껐어요');
      else if (result.code === 'auth_required') toast(AUTHOR_LOGIN_MESSAGE);
    });
  }

  if (isSelf) return (
    <div className="flex flex-col gap-2 text-xs">
      <p>내 작가 페이지예요</p>
      <Link href="/studio" className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">스튜디오로 이동</Link>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button type="button" variant={state.notify ? 'outline' : 'default'}
        className="min-h-11 w-full gap-2 px-4 text-sm font-semibold transition-none focus-visible:ring-2 active:translate-y-0"
        aria-pressed={loggedIn ? state.notify : undefined} aria-busy={state.pending || transitionPending}
        disabled={state.pending || transitionPending} onClick={toggle}>
        {state.notify && <Check className="size-4" aria-hidden />}
        {state.notify ? '구독 중' : '작가 알림 구독'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">새 작품·새 회차 알림</p>
      {state.loginRequired && <p className="text-xs" role="status">{AUTHOR_LOGIN_MESSAGE}{' '}
        <Link href={loginHref} className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-ring">로그인</Link>
      </p>}
      {state.error && <p role="alert" className="text-xs leading-normal">{state.error}</p>}
    </div>
  );
}
