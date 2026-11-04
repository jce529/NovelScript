import { describe, expect, it } from 'vitest';
import { hashContent } from '@/lib/proposals/hash';

describe('hashContent', () => {
  it('matches known SHA-256 vectors', () => {
    expect(hashContent('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hashContent('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('is deterministic 64-char lowercase hex for 한글·이모지·개행', () => {
    for (const s of ['안녕하세요', '😀🎉', 'a\nb\n\n', '한글\n😀\r\n끝']) {
      const h = hashContent(s);
      expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(hashContent(s)).toBe(h);
    }
  });
  it('distinguishes CRLF from LF and trailing newline', () => {
    expect(hashContent('a\r\nb')).not.toBe(hashContent('a\nb'));
    expect(hashContent('a\n')).not.toBe(hashContent('a'));
  });
});
