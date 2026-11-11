'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import {
  requestPasswordResetAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
  updatePasswordAction,
} from '@/lib/auth/password-actions';
import type { AuthFormState } from '@/lib/auth/email-password';

const inputClass = 'rounded border px-3 py-2';
const buttonClass = 'rounded bg-black px-4 py-2 text-white disabled:opacity-60';

function Messages({ state }: { state: AuthFormState }) {
  return (
    <>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state.notice && <p role="status" className="text-sm text-muted-foreground">{state.notice}</p>}
    </>
  );
}

const initial: AuthFormState = {};

export function PasswordLoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithPasswordAction, initial);
  return (
    <form action={action} className="flex w-72 flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <input type="email" name="email" required autoComplete="email" placeholder="이메일" aria-label="이메일" className={inputClass} />
      <input type="password" name="password" required autoComplete="current-password" placeholder="비밀번호" aria-label="비밀번호" className={inputClass} />
      <Messages state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>이메일로 로그인</button>
      <div className="flex justify-between text-sm">
        <Link href={`/signup${next === '/' ? '' : `?${new URLSearchParams({ next })}`}`} className="underline">이메일로 가입</Link>
        <Link href="/auth/forgot-password" className="underline">비밀번호 찾기</Link>
      </div>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpWithPasswordAction, initial);
  return (
    <form action={action} className="flex w-72 flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      <input type="email" name="email" required autoComplete="email" placeholder="이메일" aria-label="이메일" className={inputClass} />
      <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="비밀번호 (8자 이상)" aria-label="비밀번호" className={inputClass} />
      <input type="password" name="confirm" required minLength={8} autoComplete="new-password" placeholder="비밀번호 확인" aria-label="비밀번호 확인" className={inputClass} />
      <Messages state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>가입하기</button>
      <Link href="/login" className="text-center text-sm underline">이미 계정이 있어요</Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, initial);
  return (
    <form action={action} className="flex w-72 flex-col gap-2">
      <input type="email" name="email" required autoComplete="email" placeholder="가입한 이메일" aria-label="이메일" className={inputClass} />
      <Messages state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>재설정 메일 보내기</button>
      <Link href="/login" className="text-center text-sm underline">로그인으로 돌아가기</Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, initial);
  return (
    <form action={action} className="flex w-72 flex-col gap-2">
      <input type="password" name="password" required minLength={8} autoComplete="new-password" placeholder="새 비밀번호 (8자 이상)" aria-label="새 비밀번호" className={inputClass} />
      <input type="password" name="confirm" required minLength={8} autoComplete="new-password" placeholder="새 비밀번호 확인" aria-label="새 비밀번호 확인" className={inputClass} />
      <Messages state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>비밀번호 변경</button>
    </form>
  );
}
