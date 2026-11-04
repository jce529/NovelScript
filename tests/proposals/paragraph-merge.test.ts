import { describe, expect, it } from 'vitest';
import { applySelectedHunks, computeHunks, tokenize } from '@/lib/proposals/paragraph-merge';

const all = (hs: ReturnType<typeof computeHunks>) => hs.map((h) => ({ index: h.index }));

describe('tokenize', () => {
  it('round-trips including blank lines, CRLF, empty', () => {
    for (const s of ['', 'a', 'a\n', 'a\n\nb\n', '\n\na', 'a\r\nb\r\n\r\nc', '한글\n😀']) {
      expect(tokenize(s).join('')).toBe(s);
    }
  });
  it('absorbs blank lines into the previous paragraph', () => {
    expect(tokenize('a\n\nb\n')).toEqual(['a\n\n', 'b\n']);
  });
});

describe('computeHunks / applySelectedHunks', () => {
  const base = 'A\nB\nC\n';
  const draft = 'A\nB2\nC\nD\n';

  it('classifies 바뀜 and 추가, and is deterministic', () => {
    const h1 = computeHunks(base, draft, base);
    const h2 = computeHunks(base, draft, base);
    expect(h1).toEqual(h2);
    expect(h1.map((h) => h.kind)).toEqual(['바뀜', '추가']);
    expect(h1.map((h) => h.index)).toEqual([0, 1]);
  });

  it('classifies 삭제', () => {
    const hs = computeHunks('A\nB\nC\n', 'A\nC\n', 'A\nB\nC\n');
    expect(hs.map((h) => h.kind)).toEqual(['삭제']);
  });

  it('no selection keeps current bytes (unchanged)', () => {
    const cur = 'A\r\nX\nC';
    const hs = computeHunks(base, draft, cur);
    expect(applySelectedHunks(cur, hs, [])).toBe(cur);
  });

  it('select all with base===current yields the draft', () => {
    const hs = computeHunks(base, draft, base);
    expect(applySelectedHunks(base, hs, all(hs))).toBe(draft);
  });

  it('applies a single selected hunk only', () => {
    const hs = computeHunks(base, draft, base);
    expect(applySelectedHunks(base, hs, [{ index: 1 }])).toBe('A\nB\nC\nD\n');
    expect(applySelectedHunks(base, hs, [{ index: 0 }])).toBe('A\nB2\nC\n');
  });

  it('uses edited text instead of proposal; rejects for deletions', () => {
    const hs = computeHunks(base, draft, base);
    expect(applySelectedHunks(base, hs, [{ index: 0, editedText: 'BB\n' }])).toBe('A\nBB\nC\n');
    const del = computeHunks('A\nB\nC\n', 'A\nC\n', 'A\nB\nC\n');
    expect(() => applySelectedHunks('A\nB\nC\n', del, [{ index: 0, editedText: 'x' }])).toThrow();
    expect(applySelectedHunks('A\nB\nC\n', del, [{ index: 0 }])).toBe('A\nC\n');
  });

  it('re-anchors on changed current via common paragraphs', () => {
    const cur = 'NEW\nA\nB\nC\nTAIL\n';
    const hs = computeHunks(base, draft, cur);
    expect(hs.every((h) => h.applicable)).toBe(true);
    expect(applySelectedHunks(cur, hs, all(hs))).toBe('NEW\nA\nB2\nC\nD\nTAIL\n');
  });

  it('marks hunk not applicable when current edited the replaced paragraph', () => {
    const cur = 'A\nBx\nC\nD0\n';
    const hs = computeHunks(base, draft, cur);
    expect(hs[0].applicable).toBe(false);
    expect(hs[0].anchor).toBeNull();
    expect(() => applySelectedHunks(cur, hs, [{ index: 0 }])).toThrow();
    expect(hs[1].applicable).toBe(true);
  });

  it('not applicable when range is not contiguous in current', () => {
    const cur = 'A\nB\nINS\nC\n';
    const hs = computeHunks('A\nB\nC\n', 'A\nZ\n', cur);
    expect(hs[0].applicable).toBe(false);
  });

  it('handles duplicate paragraphs deterministically', () => {
    const b = 'x\nx\nx\n';
    const d = 'x\ny\nx\n';
    const hs = computeHunks(b, d, b);
    expect(applySelectedHunks(b, hs, all(hs))).toBe(d);
  });

  it('handles moved paragraphs as delete+add', () => {
    const b = 'A\nB\nC\n';
    const d = 'B\nC\nA\n';
    const hs = computeHunks(b, d, b);
    expect(applySelectedHunks(b, hs, all(hs))).toBe(d);
  });

  it('delete everything', () => {
    const hs = computeHunks('A\nB\n', '', 'A\nB\n');
    expect(applySelectedHunks('A\nB\n', hs, all(hs))).toBe('');
  });

  it('empty current: insertion not applicable unless base is empty too', () => {
    const hs = computeHunks('A\n', 'A\nB\n', '');
    expect(hs[0].applicable).toBe(false);
    const fresh = computeHunks('', 'Hello\n', '');
    expect(fresh[0].applicable).toBe(true);
    expect(applySelectedHunks('', fresh, all(fresh))).toBe('Hello\n');
  });

  it('CRLF input: trailing CR does not create fake changes and bytes are preserved', () => {
    const cur = 'A\r\nB\r\nC\r\n';
    const hs = computeHunks('A\nB\nC\n', 'A\nB\nC\nD\n', cur);
    expect(hs).toHaveLength(1);
    expect(applySelectedHunks(cur, hs, [])).toBe(cur);
    expect(applySelectedHunks(cur, hs, [{ index: 0 }])).toBe('A\r\nB\r\nC\r\nD\n');
  });

  it('inserting at end of file without trailing newline adds one', () => {
    const hs = computeHunks('A\nB', 'A\nB\nC', 'A\nB');
    expect(applySelectedHunks('A\nB', hs, all(hs))).toBe('A\nB\nC');
  });

  it('replacing last paragraph keeps its trailing newline run', () => {
    const hs = computeHunks('A\nB\n\n', 'A\nZ', 'A\nB\n\n');
    expect(applySelectedHunks('A\nB\n\n', hs, all(hs))).toBe('A\nZ\n\n');
  });

  it('rejects unknown and duplicate indexes', () => {
    const hs = computeHunks(base, draft, base);
    expect(() => applySelectedHunks(base, hs, [{ index: 9 }])).toThrow();
    expect(() => applySelectedHunks(base, hs, [{ index: 0 }, { index: 0 }])).toThrow();
  });
});
