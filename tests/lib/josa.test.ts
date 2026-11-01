import { describe, expect, it } from 'vitest';
import { josa } from '@/lib/text/josa';

describe('josa', () => {
  it('을/를 follows the final consonant', () => {
    expect(josa('2화', 'eul')).toBe('를');
    expect(josa('프롤로그', 'eul')).toBe('를');
    expect(josa('주요 인물', 'eul')).toBe('을');
    expect(josa('1부', 'eul')).toBe('를');
    expect(josa('조연', 'eul')).toBe('을');
  });

  it('이/가 follows the final consonant', () => {
    expect(josa('주요 인물', 'i')).toBe('이');
    expect(josa('조연', 'i')).toBe('이');
    expect(josa('강진욱', 'i')).toBe('이');
    expect(josa('2화', 'i')).toBe('가');
  });

  it('으로/로: no final consonant or ㄹ takes 로', () => {
    expect(josa('2부', 'euro')).toBe('로');
    expect(josa('주요 인물', 'euro')).toBe('로');
    expect(josa('조연', 'euro')).toBe('으로');
    expect(josa('강진욱', 'euro')).toBe('으로');
  });

  it('digits are read by their Korean names', () => {
    expect(josa('3', 'eul')).toBe('을'); // 삼
    expect(josa('2', 'eul')).toBe('를'); // 이
    expect(josa('1', 'euro')).toBe('로'); // 일 (ㄹ)
  });

  it('falls back to the neutral form when the ending is not Hangul or a digit', () => {
    expect(josa('Book', 'eul')).toBe('을(를)');
    expect(josa('Book', 'i')).toBe('이(가)');
    expect(josa('Book', 'euro')).toBe('(으)로');
    expect(josa('', 'eul')).toBe('을(를)');
  });
});
