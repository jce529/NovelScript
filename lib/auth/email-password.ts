/** 이메일·비밀번호 인증의 순수 로직(검증·에러 문구·중복 가입 판별). 서버 액션이 사용한다. */

export const MIN_PASSWORD_LENGTH = 8;

export interface AuthFormState {
  error?: string;
  notice?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return String(value ?? '').trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  return EMAIL_PATTERN.test(email) ? null : '이메일 형식이 올바르지 않아요.';
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`;
  if (password !== confirm) return '비밀번호 확인이 일치하지 않아요.';
  return null;
}

export interface AuthErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
}

/** Supabase Auth 에러를 사용자 문구로 바꾼다. 로그인은 계정 존재 여부를 드러내지 않도록
 * 잘못된 이메일·비밀번호를 한 문구로 합친다. */
export function mapAuthError(error: AuthErrorLike): string {
  switch (error.code) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호가 올바르지 않아요.';
    case 'email_not_confirmed':
      return '이메일 인증이 아직 끝나지 않았어요. 받은 메일의 링크를 눌러 주세요.';
    case 'user_already_exists':
    case 'email_exists':
      return '이미 가입된 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.';
    case 'weak_password':
      return '비밀번호가 너무 약해요. 더 길고 복잡하게 만들어 주세요.';
    case 'same_password':
      return '이전과 다른 비밀번호를 입력해 주세요.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.';
    case 'email_provider_disabled':
    case 'signup_disabled':
      return '지금은 이메일 가입을 받지 않아요.';
    default:
      return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

/** 이메일 확인이 켜진 프로젝트에서 이미 가입된 이메일로 signUp하면 에러 대신
 * identities가 빈 가짜 사용자가 돌아온다(계정 존재 노출 방지). 소셜로 가입한 이메일도
 * 같다 — 자동 연결하지 않는다는 정책에 따라 "이미 가입" 안내만 한다. */
export function isDuplicateSignup(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
