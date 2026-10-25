import { describe, expect, it } from 'vitest';
import {
  MOVE_COPY, chapterMoveTargets, kbMoveTargets, kbMoveVerdict, nodeMapOf, normalizeChapterFolder, type MoveNode,
} from '../../lib/kb/move-rules';
import { MAX_FOLDER_DEPTH } from '../../lib/kb/actions';
import type { TreeNode } from '../../lib/kb/tree';

const n = (id: string, parent_id: string | null, overrides: Partial<MoveNode> = {}): MoveNode => ({
  id, parent_id, node_type: 'folder', category: '인물', scope: 'work', is_locked: false, ...overrides,
});

// 인물(root, locked) > 주요(a) > 핵심(b) > 문서(doc) ; 인물 > 조연(c) ; 장소(root) > 도시(p)
const nodes = [
  n('person', null, { is_locked: true }),
  n('a', 'person'),
  n('b', 'a'),
  n('doc', 'b', { node_type: 'file' }),
  n('c', 'person'),
  n('place', null, { category: '장소', is_locked: true }),
  n('p', 'place', { category: '장소' }),
  n('custom1', null, { category: 'custom' }),
  n('custom2', null, { category: 'custom' }),
  n('tpl', null, { category: 'template', is_locked: true }),
  n('tpl-person', 'tpl', { category: 'template', is_locked: true }),
  n('ch-root', null, { category: '회차', is_locked: true }),
  n('ch-1', 'ch-root', { category: '회차' }),
  n('shared', null, { category: 'custom', scope: 'account_template' }),
];
const map = nodeMapOf(nodes);
const verdict = (sourceId: string, targetId: string | null) => kbMoveVerdict(map.get(sourceId)!, targetId, map);

describe('kbMoveVerdict (shared by drag-over, the move dialog and the server action)', () => {
  it('allows a move into another folder of the same category', () => {
    expect(verdict('doc', 'c')).toEqual({ ok: true, noop: false });
    expect(verdict('b', 'c')).toEqual({ ok: true, noop: false });
    expect(verdict('doc', 'person')).toEqual({ ok: true, noop: false });
  });

  it('treats the current parent as a successful no-op', () => {
    expect(verdict('doc', 'b')).toEqual({ ok: true, noop: true });
  });

  it('rejects moving a folder into itself or into its own descendants', () => {
    expect(verdict('a', 'a')).toEqual({ ok: false, reason: 'self', message: MOVE_COPY.self });
    expect(verdict('a', 'b')).toEqual({ ok: false, reason: 'descendant', message: MOVE_COPY.descendant });
  });

  it('rejects a target in another category area', () => {
    expect(verdict('doc', 'p')).toEqual({ ok: false, reason: 'other_category', message: MOVE_COPY.other_category });
    expect(verdict('b', 'place')).toMatchObject({ ok: false, reason: 'other_category' });
    expect(verdict('doc', 'tpl-person')).toMatchObject({ ok: false, reason: 'other_category' });
    expect(verdict('doc', 'ch-1')).toMatchObject({ ok: false, reason: 'other_category' });
  });

  it('rejects moving between the work and the account area', () => {
    expect(verdict('custom1', 'shared')).toEqual({ ok: false, reason: 'other_scope', message: MOVE_COPY.other_scope });
    expect(verdict('shared', 'custom1')).toMatchObject({ ok: false, reason: 'other_scope' });
  });

  it('compares work ids when both rows carry one (server rows)', () => {
    const local = nodeMapOf([n('x', 'person', { work_id: 'w1' }), n('y', null, { work_id: 'w2' })]);
    expect(kbMoveVerdict(local.get('x')!, 'y', local)).toMatchObject({ ok: false, reason: 'other_scope' });
  });

  it('never moves locked, template or 회차 nodes', () => {
    expect(verdict('person', 'c')).toEqual({ ok: false, reason: 'locked', message: MOVE_COPY.locked });
    expect(verdict('tpl-person', 'tpl')).toMatchObject({ ok: false, reason: 'excluded' });
    expect(verdict('ch-1', 'ch-root')).toMatchObject({ ok: false, reason: 'excluded' });
  });

  it('rejects a file target and a missing target', () => {
    expect(verdict('c', 'doc')).toMatchObject({ ok: false, reason: 'not_folder' });
    expect(verdict('doc', 'nope')).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('allows a custom folder to go to (and stay at) the area top level only', () => {
    const local = nodeMapOf([...nodes, n('custom-sub', 'custom1', { category: 'custom' })]);
    expect(kbMoveVerdict(local.get('custom-sub')!, null, local)).toEqual({ ok: true, noop: false });
    expect(kbMoveVerdict(local.get('custom1')!, null, local)).toEqual({ ok: true, noop: true });
    expect(verdict('custom1', 'custom2')).toEqual({ ok: true, noop: false });
    expect(verdict('b', null)).toMatchObject({ ok: false, reason: 'other_category' });
    expect(verdict('doc', null)).toMatchObject({ ok: false });
  });

  it('enforces MAX_FOLDER_DEPTH for the deepest folder of the moved subtree', () => {
    const chain: MoveNode[] = [n('d0', null)];
    for (let i = 1; i < MAX_FOLDER_DEPTH; i++) chain.push(n(`d${i}`, `d${i - 1}`));
    const deep = nodeMapOf([...chain, n('m', 'd0'), n('m-child', 'm'), n('f', 'd0', { node_type: 'file' })]);
    // d31 is at depth 32: a folder below it would be depth 33.
    expect(kbMoveVerdict(deep.get('m')!, `d${MAX_FOLDER_DEPTH - 1}`, deep)).toEqual({ ok: false, reason: 'depth', message: MOVE_COPY.depth });
    // m + m-child need two more levels: d30 (depth 31) is too deep, d29 (depth 30) fits.
    expect(kbMoveVerdict(deep.get('m')!, `d${MAX_FOLDER_DEPTH - 2}`, deep)).toMatchObject({ ok: false, reason: 'depth' });
    expect(kbMoveVerdict(deep.get('m')!, `d${MAX_FOLDER_DEPTH - 3}`, deep)).toEqual({ ok: true, noop: false });
    // A file adds no folder depth.
    expect(kbMoveVerdict(deep.get('f')!, `d${MAX_FOLDER_DEPTH - 1}`, deep)).toEqual({ ok: true, noop: false });
  });

  it('does not loop on a corrupt parent cycle', () => {
    const cyclic = nodeMapOf([n('x', 'y'), n('y', 'x'), n('z', null)]);
    expect(kbMoveVerdict(cyclic.get('z')!, 'x', cyclic).ok).toBe(false);
  });
});

const tree = (id: string, name: string, children: TreeNode[] = [], overrides: Partial<TreeNode> = {}): TreeNode => ({
  id, name, parent_id: null, node_type: 'folder', category: '인물', scope: 'work', is_locked: false, children, ...overrides,
});

describe('kbMoveTargets (dialog list)', () => {
  const core = tree('b', '핵심', [], { parent_id: 'a' });
  const main = tree('a', '주요', [core], { parent_id: 'person' });
  const side = tree('c', '조연', [], { parent_id: 'person' });
  const person = tree('person', '인물', [main, side], { is_locked: true });
  const place = tree('place', '장소', [tree('p', '도시', [], { parent_id: 'place', category: '장소' })], { category: '장소', is_locked: true });
  const shared = tree('shared', '공용', [], { category: 'custom', scope: 'account_template' });

  it('lists same-area folders by depth with the current location and disabled reasons', () => {
    const targets = kbMoveTargets(main, [person, place], [shared]);
    const byId = Object.fromEntries(targets.map((t) => [t.id, t]));
    expect(targets.filter((t) => t.group === 'same').map((t) => [t.id, t.depth])).toEqual([['person', 0], ['a', 1], ['b', 2], ['c', 1]]);
    expect(byId.person).toMatchObject({ current: true, enabled: false });
    expect(byId.a).toMatchObject({ enabled: false, reason: MOVE_COPY.self });
    expect(byId.b).toMatchObject({ enabled: false, reason: MOVE_COPY.descendant });
    expect(byId.c).toMatchObject({ enabled: true, reason: null });
    expect(byId.place).toMatchObject({ group: 'other', enabled: false, reason: MOVE_COPY.other_category });
    expect(byId.shared).toMatchObject({ group: 'other', enabled: false, reason: MOVE_COPY.other_scope });
  });

  it('offers the area top level for a custom folder and lists custom roots one level below it', () => {
    const sub = tree('sub', '하위', [], { parent_id: 'shared', category: 'custom', scope: 'account_template' });
    const sharedRoot = { ...shared, children: [sub] };
    const other = tree('shared2', '공용2', [], { category: 'custom', scope: 'account_template' });
    const targets = kbMoveTargets(sub, [sharedRoot, other], [person]);
    expect(targets.map((t) => [t.id, t.name, t.depth, t.enabled, t.group])).toEqual([
      [null, '계정 설정 (최상위)', 0, true, 'same'],
      ['shared', '공용', 1, false, 'same'],
      ['sub', '하위', 2, false, 'same'],
      ['shared2', '공용2', 1, true, 'same'],
      ['person', '인물', 0, false, 'other'],
    ]);
    expect(targets[1].current).toBe(true);
  });
});

describe('chapter move helpers', () => {
  it('normalizes the 회차 root id to null', () => {
    expect(normalizeChapterFolder('root', 'root')).toBeNull();
    expect(normalizeChapterFolder(null, 'root')).toBeNull();
    expect(normalizeChapterFolder('arc', 'root')).toBe('arc');
  });

  it('lists the root and nested 회차 folders with counts; the current folder is disabled', () => {
    const part2 = tree('p2', '2부', [], { parent_id: 'root', category: '회차' });
    const part1 = tree('p1', '1부', [tree('p1a', '1장', [], { parent_id: 'p1', category: '회차' })], { parent_id: 'root', category: '회차' });
    const root = tree('root', '회차', [part1, part2], { category: '회차', is_locked: true });
    const counts = { root: [{ id: 'c0', title: '0', isPublished: false }], p1: [{ id: 'c1', title: '1', isPublished: true }, { id: 'c2', title: '2', isPublished: false }] };
    const targets = chapterMoveTargets(root, counts, 'p1');
    expect(targets.map((t) => [t.id, t.name, t.depth, t.count, t.current])).toEqual([
      [null, '회차 (최상위)', 0, 1, false],
      ['p1', '1부', 1, 2, true],
      ['p1a', '1장', 2, 0, false],
      ['p2', '2부', 1, 0, false],
    ]);
    expect(chapterMoveTargets(root, counts, 'root')[0].current).toBe(true);
  });
});
