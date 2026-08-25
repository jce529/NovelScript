import { describe, it, expect } from 'vitest';
import { needsEmailCompletion } from '../../lib/auth/email-guard';

describe('needsEmailCompletion', () => {
  it('returns true for null email', () => {
    expect(needsEmailCompletion({ email: null })).toBe(true);
  });

  it('returns true for undefined email', () => {
    expect(needsEmailCompletion({ email: undefined })).toBe(true);
  });

  it('returns true for empty string email', () => {
    expect(needsEmailCompletion({ email: '' })).toBe(true);
  });

  it('returns true for whitespace-only email', () => {
    expect(needsEmailCompletion({ email: '  ' })).toBe(true);
  });

  it('returns false for valid email', () => {
    expect(needsEmailCompletion({ email: 'user@example.com' })).toBe(false);
  });
});
