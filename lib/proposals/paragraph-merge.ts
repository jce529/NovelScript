// Pure paragraph-level 3-way merge (base -> draft intent, re-anchored on current).
// No I/O. Used by proposal review (server recomputes hunks; client sends only indexes).
import { diffArrays } from 'diff';

export type HunkKind = '바뀜' | '추가' | '삭제';

export interface Hunk {
  /** Deterministic index: order of change in base -> draft diff. */
  index: number;
  kind: HunkKind;
  /** Base paragraphs replaced/removed (joined). */
  before: string;
  /** Draft paragraphs proposed (joined). */
  after: string;
  /** False when the hunk cannot be safely placed on the current text. */
  applicable: boolean;
  /** Token range [start, end) in current; start === end for pure insertion. null if not applicable. */
  anchor: { start: number; end: number } | null;
}

export interface HunkSelection {
  index: number;
  editedText?: string;
}

/** Paragraph plus its trailing newline run. join('') === text always. */
export function tokenize(text: string): string[] {
  return (text.match(/[^\n]*\n*/g) ?? []).filter((t) => t !== '');
}

const stripTail = (s: string) => s.replace(/\s+$/, '');
const comparator = (a: string, b: string) => stripTail(a) === stripTail(b);

interface RawHunk {
  baseStart: number;
  baseEnd: number;
  removed: string[];
  added: string[];
}

function diffHunks(base: string[], draft: string[]): RawHunk[] {
  const parts = diffArrays(base, draft, { comparator });
  const out: RawHunk[] = [];
  let b = 0;
  let cur: RawHunk | null = null;
  for (const p of parts) {
    const n = p.value.length;
    if (!p.added && !p.removed) {
      if (cur) out.push(cur);
      cur = null;
      b += n;
      continue;
    }
    if (!cur) cur = { baseStart: b, baseEnd: b, removed: [], added: [] };
    if (p.removed) {
      cur.removed.push(...p.value);
      cur.baseEnd += n;
      b += n;
    } else {
      cur.added.push(...p.value);
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** base token index -> current token index (undefined when not common). */
function mapBaseToCurrent(base: string[], current: string[]): Array<number | undefined> {
  const map: Array<number | undefined> = new Array(base.length).fill(undefined);
  const parts = diffArrays(base, current, { comparator });
  let b = 0;
  let c = 0;
  for (const p of parts) {
    const n = p.value.length;
    if (p.added) c += n;
    else if (p.removed) b += n;
    else {
      for (let k = 0; k < n; k++) map[b + k] = c + k;
      b += n;
      c += n;
    }
  }
  return map;
}

function anchorFor(
  h: RawHunk,
  map: Array<number | undefined>,
  baseLen: number,
  currentLen: number,
): { start: number; end: number } | null {
  if (h.baseEnd > h.baseStart) {
    for (let i = h.baseStart; i < h.baseEnd; i++) {
      const m = map[i];
      if (m === undefined) return null;
      if (i > h.baseStart && m !== (map[i - 1] as number) + 1) return null;
    }
    return { start: map[h.baseStart] as number, end: (map[h.baseEnd - 1] as number) + 1 };
  }
  // pure insertion
  if (h.baseStart > 0) {
    const prev = map[h.baseStart - 1];
    if (prev !== undefined) return { start: prev + 1, end: prev + 1 };
  }
  if (h.baseStart < baseLen) {
    const next = map[h.baseStart];
    if (next !== undefined) return { start: next, end: next };
  }
  if (baseLen === 0 && currentLen === 0) return { start: 0, end: 0 };
  return null;
}

export function computeHunks(base: string, draft: string, current: string): Hunk[] {
  const bt = tokenize(base);
  const dt = tokenize(draft);
  const ct = tokenize(current);
  const map = mapBaseToCurrent(bt, ct);
  return diffHunks(bt, dt).map((h, index) => {
    const kind: HunkKind =
      h.removed.length && h.added.length ? '바뀜' : h.added.length ? '추가' : '삭제';
    const anchor = anchorFor(h, map, bt.length, ct.length);
    return {
      index,
      kind,
      before: h.removed.join(''),
      after: h.added.join(''),
      applicable: anchor !== null,
      anchor,
    };
  });
}

/**
 * Apply only the selected hunks onto current. No selection -> current unchanged (same bytes).
 * Throws on unknown index, non-applicable hunk, or editedText on a deletion.
 */
export function applySelectedHunks(
  current: string,
  hunks: Hunk[],
  selections: HunkSelection[],
): string {
  if (selections.length === 0) return current;
  const seen = new Set<number>();
  const chosen = selections.map((s) => {
    const h = hunks.find((x) => x.index === s.index);
    if (!h) throw new Error(`unknown hunk index ${s.index}`);
    if (seen.has(s.index)) throw new Error(`duplicate hunk index ${s.index}`);
    seen.add(s.index);
    if (!h.applicable || !h.anchor) throw new Error(`hunk ${s.index} is not applicable`);
    if (s.editedText !== undefined && h.kind === '삭제') {
      throw new Error(`hunk ${s.index} is a deletion and cannot be edited`);
    }
    return { h, anchor: h.anchor, edited: s.editedText };
  });
  chosen.sort((a, b) => b.anchor.start - a.anchor.start || b.h.index - a.h.index);

  const tokens = tokenize(current);
  for (const { h, anchor, edited } of chosen) {
    let replacement = h.kind === '삭제' ? '' : (edited ?? h.after);
    const old = tokens.slice(anchor.start, anchor.end);
    if (replacement !== '') {
      if (old.length > 0) {
        const lastOld = old[old.length - 1];
        const tail = lastOld.match(/\n*$/)?.[0] ?? '';
        if (!replacement.endsWith('\n') && tail) replacement += tail;
      } else if (anchor.start < tokens.length && !replacement.endsWith('\n')) {
        replacement += '\n';
      }
      if (old.length === 0 && anchor.start === tokens.length && anchor.start > 0) {
        const prevTok = tokens[anchor.start - 1];
        if (!prevTok.endsWith('\n')) tokens[anchor.start - 1] = prevTok + '\n';
      }
    }
    tokens.splice(anchor.start, anchor.end - anchor.start, ...tokenize(replacement));
  }
  return tokens.join('');
}
