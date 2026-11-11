import { describe, expect, it } from 'vitest';
import {
  isDuplicateSignup,
  mapAuthError,
  normalizeEmail,
  validateEmail,
  validateNewPassword,
} from '@/lib/auth/email-password';

describe('email-password helpers', () => {
  it('normalizes email casing and whitespace', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(normalizeEmail(null)).toBe('');
  });

  it('validates email shape', () => {
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
    expect(validateEmail('')).not.toBeNull();
  });

  it('validates new password length and confirmation', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/8자/);
    expect(validateNewPassword('longenough', 'different')).toMatch(/일치/);
    expect(validateNewPassword('longenough', 'longenough')).toBeNull();
  });

  it('maps auth errors without leaking account existence on login', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toMatch(/이메일 또는 비밀번호/);
    expect(mapAuthError({ code: 'email_not_confirmed' })).toMatch(/인증/);
    expect(mapAuthError({ code: 'user_already_exists' })).toMatch(/이미 가입/);
    expect(mapAuthError({ code: 'weak_password' })).toMatch(/약해요/);
    expect(mapAuthError({ code: 'something_else' })).toMatch(/다시 시도/);
  });

  it('detects the obfuscated duplicate-signup user', () => {
    expect(isDuplicateSignup({ identities: [] })).toBe(true);
    expect(isDuplicateSignup({ identities: [{}] })).toBe(false);
    expect(isDuplicateSignup({})).toBe(false);
    expect(isDuplicateSignup(null)).toBe(false);
  });
});
