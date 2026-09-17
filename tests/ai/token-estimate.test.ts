import { describe, expect, it } from 'vitest';
import { estimateTokens, estimateGeminiInputTokens, GEMINI_TOKEN_ESTIMATE as G } from '@/lib/ai/token-estimate';

describe('estimateTokens (Gemini constants)', () => {
  it('empty string is overhead only', () => expect(estimateTokens('', G)).toBe(32));
  it('ascii', () => expect(estimateTokens('abcd', G)).toBe(34));
  it('hangul', () => expect(estimateTokens('가나다', G)).toBe(40));
  it('emoji counts as one code point', () => expect(estimateTokens('😀', G)).toBe(35));
  it('mixed', () => expect(estimateTokens('a가😀', G)).toBe(32 + Math.ceil((0.25 + 2 + 2) * 1.25)));
  it('mixed equals 38', () => expect(estimateTokens('a가😀', G)).toBe(38));

  it('is monotonic when appending characters', () => {
    const fixture = '그녀는 창문을 열었다. The wind came in, 차갑고 날카롭게. 42번째 밤이었다! '.repeat(4).slice(0, 200);
    expect([...fixture].length).toBeGreaterThanOrEqual(200);
    let prev = estimateTokens('', G);
    let acc = '';
    for (const ch of fixture) {
      acc += ch;
      const next = estimateTokens(acc, G);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });

  it('never under 1 token per Hangul syllable', () => {
    const passage = '가'.repeat(10_000);
    expect(estimateTokens(passage, G)).toBeGreaterThanOrEqual(10_000);
  });

  it('gemini input estimate joins system instruction and contents', () => {
    expect(estimateGeminiInputTokens('SYS', 'BODY')).toBe(estimateTokens('SYS\n\nBODY', G));
  });
});
