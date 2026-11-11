'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccountActive, softDeleteAccount } from '@/lib/auth/account';
import { safeReturnPath } from '@/lib/auth/redirect';
import {
  isDuplicateSignup,
  mapAuthError,
  normalizeEmail,
  validateEmail,
  validateNewPassword,
  type AuthFormState,
} from '@/lib/auth/email-password';

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function callbackUrl(origin: string, next: string): string {
  return `${origin}/auth/callback${next === '/' ? '' : `?${new URLSearchParams({ next })}`}`;
}

export async function signInWithPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const next = safeReturnPath(String(formData.get('next') ?? ''));
  if (validateEmail(email) || !password) return { error: '이메일과 비밀번호를 입력해 주세요.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { error: mapAuthError(error ?? {}) };

  // 소셜 콜백과 같은 정책: 탈퇴 표시만 남은 계정이면 마무리하고 세션을 버린다.
  const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).maybeSingle();
  if (profile && !isAccountActive(profile)) {
    await softDeleteAccount(createAdminClient(), data.user.id).catch(() => {});
    await supabase.auth.signOut();
    redirect('/login?error=account_deleted');
  }

  redirect(next);
}

export async function signUpWithPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const next = safeReturnPath(String(formData.get('next') ?? ''));
  const invalid = validateEmail(email) ?? validateNewPassword(password, confirm);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl(await requestOrigin(), next) },
  });
  if (error) return { error: mapAuthError(error) };
  if (isDuplicateSignup(data.user)) return { error: mapAuthError({ code: 'user_already_exists' }) };

  // 프로젝트가 이메일 확인을 끈 경우 세션이 바로 온다.
  if (data.session) redirect(next);
  return { notice: `${email}로 인증 메일을 보냈어요. 메일의 링크를 누르면 가입이 끝나요.` };
}

export async function requestPasswordResetAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normalizeEmail(formData.get('email'));
  const invalid = validateEmail(email);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(await requestOrigin(), '/auth/reset-password'),
  });
  if (error && (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit')) {
    return { error: mapAuthError(error) };
  }
  // 가입 여부는 알려 주지 않는다.
  return { notice: '가입된 이메일이면 재설정 메일을 보냈어요. 메일함을 확인해 주세요.' };
}

export async function updatePasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  const invalid = validateNewPassword(password, confirm);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: '재설정 링크가 만료됐어요. 메일을 다시 요청해 주세요.' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: mapAuthError(error) };
  redirect('/');
}
