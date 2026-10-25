import type { ChapterLeaf, TreeNode } from './tree';

/** Pure + client-safe (no server imports): the same rules drive drag-over highlighting, the
 * "이동…" dialog and the server actions (moveKbNode / moveChapter), so a target the UI offers is
 * exactly a target the server accepts. The DB triggers (0004/0023/0034) stay the final word. */

export const MAX_FOLDER_DEPTH = 32;

export const MOVE_COPY = {
  self: '자기 자신 안으로는 옮길 수 없어요',
  descendant: '자기 하위 폴더로는 옮길 수 없어요',
  other_category: '카테고리는 바꿀 수 없어요',
  other_scope: '작품과 계정 사이는 옮길 수 없어요',
  locked: '기본 폴더는 옮길 수 없어요',
  excluded: '템플릿과 회차 폴더는 이 방법으로 옮길 수 없어요',
  not_folder: '폴더 안으로만 옮길 수 있어요',
  missing: '옮길 폴더를 찾을 수 없어요. 새로고침 후 다시 시도해주세요.',
  depth: `폴더는 ${MAX_FOLDER_DEPTH}단계보다 깊게 넣을 수 없어요`,
  chapter_only: '회차는 회차 폴더로만 옮길 수 있어요',
  settings_only: '설정 문서는 같은 카테고리 폴더로만 옮길 수 있어요',
  chapter_missing: '회차를 찾을 수 없어요.',
  branch_confirmed: '확정된 가지의 설정은 옮길 수 없어요.',
  branch_inherited: '이어받은 설정은 옮길 수 없어요.',
  failed: '옮기지 못했어요. 잠시 후 다시 시도해주세요.',
} as const;

export const nameConflictMessage = (targetName: string, name: string) =>
  `‘${targetName}’ 폴더에 같은 이름의 ‘${name}’이 이미 있어요. 이름을 바꾼 뒤 옮겨 주세요.`;

export interface MoveNode {
  id: string;
  parent_id: string | null;
  node_type: 'folder' | 'file' | string;
  category: string;
  scope: 'work' | 'account_template' | string;
  is_locked: boolean;
  /** Present on server rows; the client tree only holds one work, so scope is enough there. */
  work_id?: string | null;
}

export type KbMoveReason =
  | 'self' | 'descendant' | 'other_category' | 'other_scope' | 'locked' | 'excluded' | 'not_folder' | 'missing' | 'depth';

export type KbMoveVerdict = { ok: true; noop: boolean } | { ok: false; reason: KbMoveReason; message: string };

const fail = (reason: KbMoveReason): KbMoveVerdict => ({ ok: false, reason, message: MOVE_COPY[reason] });

/** Areas the generic move never touches: templates keep their own "카테고리 폴더로 이동", chapters move as chapters. */
export const isMoveExcludedCategory = (category: string) => category === 'template' || category === '회차';

export function nodeMapOf<T extends MoveNode>(nodes: Iterable<T>): Map<string, T> {
  const map = new Map<string, T>();
  for (const node of nodes) map.set(node.id, node);
  return map;
}

export function flattenTree(roots: TreeNode[], out: MoveNode[] = []): MoveNode[] {
  for (const node of roots) {
    out.push(node);
    flattenTree(node.children, out);
  }
  return out;
}

/** Ancestor chain of `id` (self first). null = broken chain (missing parent or cycle). */
function chainOf(id: string, nodes: ReadonlyMap<string, MoveNode>): MoveNode[] | null {
  const chain: MoveNode[] = [];
  const seen = new Set<string>();
  let current = nodes.get(id);
  while (current) {
    if (seen.has(current.id) || chain.length > MAX_FOLDER_DEPTH * 4) return null;
    seen.add(current.id);
    chain.push(current);
    if (current.parent_id === null) return chain;
    current = nodes.get(current.parent_id);
  }
  return null;
}

/** Folder levels below `id` (0 = no sub-folders). */
function folderHeight(id: string, nodes: ReadonlyMap<string, MoveNode>): number {
  const children = new Map<string, MoveNode[]>();
  for (const node of nodes.values()) {
    if (node.parent_id === null || node.node_type !== 'folder') continue;
    (children.get(node.parent_id) ?? children.set(node.parent_id, []).get(node.parent_id)!).push(node);
  }
  const walk = (at: string, seen: Set<string>): number => {
    let best = 0;
    for (const child of children.get(at) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      best = Math.max(best, 1 + walk(child.id, seen));
    }
    return best;
  };
  return walk(id, new Set([id]));
}

/** May `source` move under `targetId`? `null` = the area's top level (custom folders only). */
export function kbMoveVerdict(source: MoveNode, targetId: string | null, nodes: ReadonlyMap<string, MoveNode>): KbMoveVerdict {
  if (isMoveExcludedCategory(source.category)) return fail('excluded');
  if (source.is_locked) return fail('locked');

  if (targetId === null) {
    if (source.category !== 'custom' || source.node_type !== 'folder') return fail('other_category');
    return { ok: true, noop: source.parent_id === null };
  }

  const target = nodes.get(targetId);
  if (!target) return fail('missing');
  if (target.node_type !== 'folder') return fail('not_folder');
  const sameWork = source.work_id === undefined || target.work_id === undefined || source.work_id === target.work_id;
  if (target.scope !== source.scope || !sameWork) return fail('other_scope');
  if (target.id === source.id) return fail('self');
  if (target.id === source.parent_id) return { ok: true, noop: true };
  if (target.category !== source.category) return fail('other_category');

  const chain = chainOf(target.id, nodes);
  if (!chain) return fail('missing');
  if (chain.some((node) => node.id === source.id)) return fail('descendant');
  if (source.node_type === 'folder' && chain.length + 1 + folderHeight(source.id, nodes) > MAX_FOLDER_DEPTH) {
    return fail('depth');
  }
  return { ok: true, noop: false };
}

export interface KbMoveTarget {
  /** null = area top level. */
  id: string | null;
  name: string;
  depth: number;
  /** 'same' = selectable area; 'other' = 다른 영역, always disabled with a reason. */
  group: 'same' | 'other';
  current: boolean;
  enabled: boolean;
  reason: string | null;
}

export const categoryLabel = (category: string) => (category === 'custom' ? '내 폴더' : category);

export const topLevelLabel = (scope: string) => (scope === 'account_template' ? '계정 설정 (최상위)' : '설정 (최상위)');

/** Destination list for the settings "이동…" dialog. `sameScopeRoots` are the roots of the source's
 * own scope (work or account), `otherScopeRoots` the other one (listed as 다른 영역 only). */
export function kbMoveTargets(source: TreeNode, sameScopeRoots: TreeNode[], otherScopeRoots: TreeNode[]): KbMoveTarget[] {
  const nodes = nodeMapOf([...flattenTree(sameScopeRoots), ...flattenTree(otherScopeRoots), source]);
  const targets: KbMoveTarget[] = [];
  const entry = (node: TreeNode, depth: number, group: 'same' | 'other'): KbMoveTarget => {
    const verdict = kbMoveVerdict(source, node.id, nodes);
    const current = node.id === source.parent_id;
    return {
      id: node.id, name: node.name, depth, group, current,
      enabled: verdict.ok && !verdict.noop,
      reason: verdict.ok ? null : verdict.message,
    };
  };
  const walk = (node: TreeNode, depth: number) => {
    if (node.node_type !== 'folder') return;
    targets.push(entry(node, depth, 'same'));
    node.children.forEach((child) => walk(child, depth + 1));
  };

  const sameArea = sameScopeRoots.filter((root) => root.node_type === 'folder' && root.category === source.category);
  let rootDepth = 0;
  if (source.category === 'custom' && source.node_type === 'folder') {
    const verdict = kbMoveVerdict(source, null, nodes);
    targets.push({
      id: null, name: topLevelLabel(source.scope), depth: 0, group: 'same', current: source.parent_id === null,
      enabled: verdict.ok && !verdict.noop, reason: verdict.ok ? null : verdict.message,
    });
    rootDepth = 1;
  }
  sameArea.forEach((root) => walk(root, rootDepth));

  const listable = (root: TreeNode) => root.node_type === 'folder' && !isMoveExcludedCategory(root.category);
  sameScopeRoots.filter((root) => listable(root) && root.category !== source.category)
    .forEach((root) => targets.push(entry(root, 0, 'other')));
  otherScopeRoots.filter(listable).forEach((root) => targets.push(entry(root, 0, 'other')));
  return targets;
}

/** Drop target ids used by the tree's dnd-kit droppables. */
export const DROP = {
  kbFolder: (id: string) => `kb:${id}`,
  kbTop: (scope: string) => `kb-top:${scope}`,
  chapterFolder: (id: string) => `ch:${id}`,
  chapterRoot: 'ch-root',
} as const;

export type DragItem =
  | { kind: 'kb'; nodeId: string; name: string }
  | { kind: 'chapter'; chapterId: string; name: string; folderId: string | null };

export interface DropDecision {
  ok: boolean;
  noop: boolean;
  /** Server action argument when ok (null = 회차 root / area top level). */
  targetId: string | null;
  targetName: string;
  message: string | null;
}

type NamedNode = MoveNode & { name: string };

/** One decision for drag-over highlighting and the drop itself, built on the same rules the server runs. */
export function resolveDrop(
  item: DragItem, dropId: string, ctx: { nodes: ReadonlyMap<string, NamedNode>; chapterRootId: string | null },
): DropDecision {
  const reject = (targetName: string, message: string): DropDecision => ({ ok: false, noop: false, targetId: null, targetName, message });
  const accept = (targetId: string | null, targetName: string, noop: boolean): DropDecision => ({ ok: true, noop, targetId, targetName, message: null });
  const nameOf = (id: string) => ctx.nodes.get(id)?.name ?? '';
  const topLabel = (scope: string) => (scope === 'account_template' ? '계정 설정' : '설정');

  let target: { kind: 'chapter'; id: string | null; name: string } | { kind: 'kb'; id: string; name: string }
    | { kind: 'top'; scope: string; name: string } | null = null;
  if (dropId === DROP.chapterRoot) target = { kind: 'chapter', id: null, name: '회차' };
  else if (dropId.startsWith('ch:')) {
    const id = dropId.slice(3);
    target = id === ctx.chapterRootId ? { kind: 'chapter', id: null, name: '회차' } : { kind: 'chapter', id, name: nameOf(id) };
  } else if (dropId.startsWith('kb-top:')) {
    const scope = dropId.slice(7);
    target = { kind: 'top', scope, name: topLabel(scope) };
  } else if (dropId.startsWith('kb:')) {
    const id = dropId.slice(3);
    target = { kind: 'kb', id, name: nameOf(id) };
  }
  if (!target) return reject('', MOVE_COPY.missing);

  if (item.kind === 'chapter') {
    if (target.kind !== 'chapter') return reject(target.name, MOVE_COPY.chapter_only);
    if (target.id !== null && !ctx.nodes.has(target.id)) return reject(target.name, MOVE_COPY.chapter_only);
    const noop = normalizeChapterFolder(item.folderId, ctx.chapterRootId) === target.id;
    return accept(target.id, target.name, noop);
  }

  const source = ctx.nodes.get(item.nodeId);
  if (!source) return reject(target.name, MOVE_COPY.missing);
  if (target.kind === 'chapter') return reject(target.name, MOVE_COPY.settings_only);
  if (target.kind === 'top' && target.scope !== source.scope) return reject(target.name, MOVE_COPY.other_scope);
  const targetId = target.kind === 'top' ? null : target.id;
  const verdict = kbMoveVerdict(source, targetId, ctx.nodes);
  if (!verdict.ok) return reject(target.name, verdict.message);
  return accept(targetId, target.name, verdict.noop);
}

/** Chapters store folder_id = null for the 회차 root; older rows may hold the root's own id. */
export const normalizeChapterFolder = (folderId: string | null, chapterRootId: string | null) =>
  folderId === null || folderId === chapterRootId ? null : folderId;

export interface ChapterMoveTarget {
  /** null = 회차 root. */
  id: string | null;
  name: string;
  depth: number;
  count: number;
  current: boolean;
}

/** Destination list for the chapter "이동…" dialog: the 회차 root and every 회차 folder below it. */
export function chapterMoveTargets(
  chapterRoot: TreeNode, chaptersByFolderId: Record<string, ChapterLeaf[]>, currentFolderId: string | null,
): ChapterMoveTarget[] {
  const current = normalizeChapterFolder(currentFolderId, chapterRoot.id);
  const targets: ChapterMoveTarget[] = [{
    id: null, name: '회차 (최상위)', depth: 0, count: chaptersByFolderId[chapterRoot.id]?.length ?? 0, current: current === null,
  }];
  const walk = (node: TreeNode, depth: number) => {
    if (node.node_type !== 'folder') return;
    targets.push({ id: node.id, name: node.name, depth, count: chaptersByFolderId[node.id]?.length ?? 0, current: current === node.id });
    node.children.forEach((child) => walk(child, depth + 1));
  };
  chapterRoot.children.forEach((child) => walk(child, 1));
  return targets;
}
