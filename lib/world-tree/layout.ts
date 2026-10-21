/**
 * Phase 18 world-tree layout (18-06). Pure, dependency-free SVG coordinate computation.
 *
 * Rules:
 *  - x is the era column (past = left, latest = right). Columns come from era.position, so two
 *    eras that merely share a name on different lines are never merged (each line has its own
 *    eraKey; only equal positions share a column).
 *  - Fruits inside one era are ordered by orderIndex. A concurrentWithPrev fruit shares the x of
 *    the unit anchor and sits above/below it on its own lane.
 *  - A broken-branch stub keeps no work data: it is an empty joint placed by positionHint and
 *    parent links only. Published children connect to it. Real private fork positions are never
 *    restored, so a path leaving a stub starts at the stub itself.
 *  - Anything inconsistent (orphan, cycle, duplicate key, concurrent fruit with no previous fruit,
 *    unknown era) fails closed as `status: 'invalid'` with an empty drawing.
 *  - More than WORLD_TREE_LIST_FALLBACK_LIMIT nodes yields `status: 'fallback'` (list view first);
 *    no Canvas renderer or graph library is involved.
 */
import type {
  OwnerWorldTreeProjection,
  ReaderWorldTreeProjection,
  WorldTreeLayout,
  WorldTreeLayoutNode,
  WorldTreeLayoutPath,
  WorldTreeProjection,
} from '@/lib/world-tree/types';

export const WORLD_TREE_FULL_RENDER_LIMIT = 300;
export const WORLD_TREE_LIST_FALLBACK_LIMIT = 1000;

export interface WorldTreeLayoutOptions {
  eraWidth: number;
  nodeGap: number;
}

export type WorldTreeLayoutStatus = 'ok' | 'fallback' | 'invalid';

export interface WorldTreeLayoutResult extends WorldTreeLayout {
  status: WorldTreeLayoutStatus;
  reason?: string;
  /** Left padding of column 0. */
  originX: number;
  columnWidth: number;
  columnCount: number;
  nodeColumns: Record<string, number>;
}

interface NormNode {
  key: string;
  type: 'work' | 'broken';
  parent: string | null;
  hint: number;
  placement: { eraKey: string; orderIndex: number; concurrent: boolean } | null;
  /** Highest inherited-era position on this line (the fork column), if any. */
  forkPosition: number | null;
}

interface Normalized {
  nodes: NormNode[];
  eraPosition: Map<string, number>;
}

interface Unit {
  anchor: NormNode;
  members: NormNode[];
  rank: number;
}

function invalid(reason: string): WorldTreeLayoutResult {
  return {
    status: 'invalid',
    reason,
    extent: { width: 0, height: 0 },
    nodes: [],
    paths: [],
    listOrder: [],
    originX: 0,
    columnWidth: 0,
    columnCount: 0,
    nodeColumns: {},
  };
}

/** Natural, locale-free key order: n2 < n10. */
export function compareKeys(a: string, b: string): number {
  const ma = /^(\D*)(\d+)$/.exec(a);
  const mb = /^(\D*)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) {
    const diff = Number(ma[2]) - Number(mb[2]);
    if (diff !== 0) return diff;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeReader(p: ReaderWorldTreeProjection): Normalized | null {
  const eraPosition = new Map<string, number>();
  const forkByNode = new Map<string, number>();
  for (const era of p.eras) {
    if (eraPosition.has(era.eraKey)) return null;
    eraPosition.set(era.eraKey, era.position);
    if (era.inherited) {
      forkByNode.set(era.nodeKey, Math.max(forkByNode.get(era.nodeKey) ?? -1, era.position));
    }
  }
  const nodes: NormNode[] = p.nodes.map((node) =>
    node.nodeType === 'broken'
      ? { key: node.nodeKey, type: 'broken', parent: node.parentNodeKey, hint: node.positionHint, placement: null, forkPosition: null }
      : {
          key: node.nodeKey,
          type: 'work',
          parent: node.parentNodeKey,
          hint: 0,
          placement: node.placement
            ? { eraKey: node.placement.eraKey, orderIndex: node.placement.orderIndex, concurrent: node.placement.concurrentWithPrev }
            : null,
          forkPosition: forkByNode.get(node.nodeKey) ?? null,
        },
  );
  return { nodes, eraPosition };
}

function normalizeOwner(p: OwnerWorldTreeProjection): Normalized | null {
  const eraPosition = new Map<string, number>();
  const inheritedFork = new Map<string, number>();
  const workByBranch = new Map<string, string>();
  for (const b of p.branches) workByBranch.set(b.branchId, b.workId);
  for (const era of p.eras) {
    if (era.deletedAt !== null) continue;
    eraPosition.set(era.id, era.position);
    if (era.inherited) {
      const work = workByBranch.get(era.branchId);
      if (work) inheritedFork.set(work, Math.max(inheritedFork.get(work) ?? -1, era.position));
    }
  }
  const firstPlacement = new Map<string, { eraKey: string; orderIndex: number; concurrent: boolean }>();
  for (const pl of p.placements) {
    const prev = firstPlacement.get(pl.workId);
    if (!prev || pl.orderIndex < prev.orderIndex) {
      firstPlacement.set(pl.workId, { eraKey: pl.eraId, orderIndex: pl.orderIndex, concurrent: pl.concurrentWithPrev });
    }
  }
  const nodes: NormNode[] = p.branches.map((b) => ({
    key: b.workId,
    type: 'work',
    parent: b.parentBranchId === null ? null : (workByBranch.get(b.parentBranchId) ?? b.parentBranchId),
    hint: 0,
    placement: firstPlacement.get(b.workId) ?? null,
    forkPosition: inheritedFork.get(b.workId) ?? null,
  }));
  return { nodes, eraPosition };
}

function normalize(projection: WorldTreeProjection): Normalized | null {
  if (projection.audience === 'reader') return normalizeReader(projection);
  return normalizeOwner(projection);
}

export function buildWorldTreeLayout(projection: WorldTreeProjection, options: WorldTreeLayoutOptions): WorldTreeLayoutResult {
  const { eraWidth, nodeGap } = options;
  if (!Number.isFinite(eraWidth) || !Number.isFinite(nodeGap) || eraWidth <= 0 || nodeGap <= 0) return invalid('bad_options');
  const norm = normalize(projection);
  if (!norm) return invalid('bad_projection');
  const { nodes, eraPosition } = norm;
  if (nodes.length === 0) return invalid('empty');

  // --- structure checks -----------------------------------------------------
  const byKey = new Map<string, NormNode>();
  for (const node of nodes) {
    if (byKey.has(node.key)) return invalid('duplicate_key');
    byKey.set(node.key, node);
  }
  const children = new Map<string, NormNode[]>();
  const roots: NormNode[] = [];
  for (const node of nodes) {
    if (node.placement && !eraPosition.has(node.placement.eraKey)) return invalid('unknown_era');
    if (node.parent === null) {
      roots.push(node);
    } else {
      if (!byKey.has(node.parent)) return invalid('orphan');
      const list = children.get(node.parent) ?? [];
      list.push(node);
      children.set(node.parent, list);
    }
  }
  if (roots.length === 0) return invalid('cycle');

  // --- columns (parents before children) -----------------------------------
  const column = new Map<string, number>();
  const bfs: NormNode[] = [...roots].sort((a, b) => compareKeys(a.key, b.key));
  for (let i = 0; i < bfs.length; i += 1) {
    const node = bfs[i];
    const parentCol = node.parent === null ? null : (column.get(node.parent) ?? 0);
    let col: number;
    if (node.type === 'broken') {
      col = Math.max(node.hint, parentCol ?? 0);
    } else if (node.placement) {
      col = eraPosition.get(node.placement.eraKey) as number;
    } else if (parentCol === null) {
      col = 0; // unplaced root: explicit initial era column
    } else {
      col = node.forkPosition !== null ? node.forkPosition + 1 : parentCol + 1;
    }
    column.set(node.key, col);
    for (const child of children.get(node.key) ?? []) bfs.push(child);
  }
  if (bfs.length !== nodes.length) return invalid('cycle');

  // --- units (anchor + concurrent members) ----------------------------------
  const unitOf = new Map<string, Unit>();
  const groups = new Map<string, NormNode[]>();
  for (const node of nodes) {
    if (node.type === 'work' && node.placement) {
      const list = groups.get(node.placement.eraKey) ?? [];
      list.push(node);
      groups.set(node.placement.eraKey, list);
    }
  }
  let maxUnitsInEra = 1;
  for (const eraKey of [...groups.keys()].sort(compareKeys)) {
    const list = (groups.get(eraKey) as NormNode[]).slice().sort(
      (a, b) => (a.placement as { orderIndex: number }).orderIndex - (b.placement as { orderIndex: number }).orderIndex || compareKeys(a.key, b.key),
    );
    let current: Unit | null = null;
    let rank = 0;
    for (const node of list) {
      if ((node.placement as { concurrent: boolean }).concurrent) {
        if (!current) return invalid('concurrent_without_previous');
        current.members.push(node);
        unitOf.set(node.key, current);
      } else {
        current = { anchor: node, members: [], rank };
        rank += 1;
        unitOf.set(node.key, current);
      }
    }
    maxUnitsInEra = Math.max(maxUnitsInEra, rank);
  }
  for (const node of nodes) {
    if (!unitOf.has(node.key)) unitOf.set(node.key, { anchor: node, members: [], rank: 0 });
  }

  const pad = nodeGap;
  const columnWidth = Math.max(eraWidth, maxUnitsInEra * nodeGap);
  let maxCol = 0;
  for (const col of column.values()) maxCol = Math.max(maxCol, col);
  const columnCount = maxCol + 1;
  const nodeColumns: Record<string, number> = {};
  for (const node of nodes) nodeColumns[node.key] = column.get(node.key) as number;

  const orderOf = (n: NormNode) => (n.placement ? n.placement.orderIndex : -1);
  const listSorted = nodes.slice().sort(
    (a, b) => (column.get(a.key) as number) - (column.get(b.key) as number) || orderOf(a) - orderOf(b) || compareKeys(a.key, b.key),
  );
  const listOrder = listSorted.map((n) => n.key);
  const width = pad * 2 + columnCount * columnWidth;

  if (nodes.length > WORLD_TREE_LIST_FALLBACK_LIMIT) {
    return {
      status: 'fallback',
      reason: 'too_many_nodes',
      extent: { width, height: 0 },
      nodes: [],
      paths: [],
      listOrder,
      originX: pad,
      columnWidth,
      columnCount,
      nodeColumns,
    };
  }

  // --- lanes (DFS in deterministic child order) ------------------------------
  const lane = new Map<string, number>();
  let counter = 0;
  const allocate = (unit: Unit) => {
    if (lane.has(unit.anchor.key)) return;
    const offsets = unit.members.map((_, i) => (i % 2 === 0 ? -1 : 1) * (Math.floor(i / 2) + 1));
    const min = Math.min(0, ...offsets);
    const max = Math.max(0, ...offsets);
    const anchorLane = counter - min;
    counter += max - min + 1;
    lane.set(unit.anchor.key, anchorLane);
    unit.members.forEach((m, i) => lane.set(m.key, anchorLane + offsets[i]));
  };
  const childOrder = (a: NormNode, b: NormNode) =>
    (column.get(a.key) as number) - (column.get(b.key) as number) || orderOf(a) - orderOf(b) || compareKeys(a.key, b.key);
  const stack: NormNode[] = [...roots].sort(childOrder).reverse();
  while (stack.length > 0) {
    const node = stack.pop() as NormNode;
    allocate(unitOf.get(node.key) as Unit);
    const kids = (children.get(node.key) ?? []).slice().sort(childOrder).reverse();
    for (const kid of kids) stack.push(kid);
  }

  const xOf = (node: NormNode) => pad + (column.get(node.key) as number) * columnWidth + (unitOf.get(node.key) as Unit).rank * nodeGap;
  const yOf = (node: NormNode) => pad + (lane.get(node.key) as number) * nodeGap;

  const layoutNodes: WorldTreeLayoutNode[] = listSorted.map((n) => ({
    nodeKey: n.key,
    nodeType: n.type,
    x: round(xOf(n)),
    y: round(yOf(n)),
  }));

  const paths: WorldTreeLayoutPath[] = [];
  for (const child of listSorted) {
    if (child.parent === null) continue;
    const parent = byKey.get(child.parent) as NormNode;
    const toX = xOf(child);
    const toY = yOf(child);
    const py = yOf(parent);
    // Real fork position is used only for visible parents; a stub never reveals its own timeline.
    const forkX = parent.type === 'work' && child.forkPosition !== null ? pad + child.forkPosition * columnWidth : xOf(parent);
    const fromX = parent.type === 'work' ? forkX : xOf(parent);
    const mid = (fromX + toX) / 2;
    const d =
      py === toY
        ? `M ${round(fromX)} ${round(py)} L ${round(toX)} ${round(toY)}`
        : `M ${round(fromX)} ${round(py)} C ${round(mid)} ${round(py)}, ${round(mid)} ${round(toY)}, ${round(toX)} ${round(toY)}`;
    paths.push({ fromKey: parent.key, toKey: child.key, d, broken: parent.type === 'broken' || child.type === 'broken' });
  }

  return {
    status: 'ok',
    extent: { width, height: pad * 2 + Math.max(0, counter - 1) * nodeGap },
    nodes: layoutNodes,
    paths,
    listOrder,
    originX: pad,
    columnWidth,
    columnCount,
    nodeColumns,
  };
}

// ---------------------------------------------------------------------------
// Windowing
// ---------------------------------------------------------------------------

export interface EraWindowViewport {
  x: number;
  width: number;
}

export interface EraWindowOptions {
  overscan?: number;
  selectedKey?: string | null;
}

export interface EraWindow {
  mode: 'all' | 'windowed' | 'list';
  firstColumn: number;
  lastColumn: number;
  nodes: WorldTreeLayoutNode[];
  paths: WorldTreeLayoutPath[];
  /** Always the full canvas extent so scrollbars never change while windowing. */
  extent: { width: number; height: number };
  /** Coordinates of the selected node for scrollIntoView, or null. */
  focusTarget: { x: number; y: number } | null;
}

/**
 * <=300 nodes render fully; 301..1000 render era columns intersecting the viewport (+overscan
 * columns); the selected node is always rendered. The full ordered list (layout.listOrder) is
 * never windowed. Fallback layouts render nothing and point to the list view.
 */
export function getVisibleEraWindow(layout: WorldTreeLayoutResult, viewport: EraWindowViewport, options: EraWindowOptions = {}): EraWindow {
  const overscan = Math.max(0, Math.floor(options.overscan ?? 1));
  const selectedKey = options.selectedKey ?? null;
  const selected = selectedKey ? (layout.nodes.find((n) => n.nodeKey === selectedKey) ?? null) : null;
  const focusTarget = selected ? { x: selected.x, y: selected.y } : null;

  if (layout.status !== 'ok') {
    return { mode: 'list', firstColumn: 0, lastColumn: -1, nodes: [], paths: [], extent: layout.extent, focusTarget: null };
  }
  const lastIndex = layout.columnCount - 1;
  if (layout.nodes.length <= WORLD_TREE_FULL_RENDER_LIMIT) {
    return { mode: 'all', firstColumn: 0, lastColumn: lastIndex, nodes: layout.nodes, paths: layout.paths, extent: layout.extent, focusTarget };
  }
  const colW = layout.columnWidth;
  const first = Math.max(0, Math.floor((viewport.x - layout.originX) / colW) - overscan);
  const last = Math.min(lastIndex, Math.floor((viewport.x + viewport.width - layout.originX) / colW) + overscan);
  const visible = new Set<string>();
  const nodes = layout.nodes.filter((n) => {
    const col = layout.nodeColumns[n.nodeKey];
    const show = (col >= first && col <= last) || n.nodeKey === selectedKey;
    if (show) visible.add(n.nodeKey);
    return show;
  });
  const paths = layout.paths.filter((p) => visible.has(p.fromKey) || visible.has(p.toKey));
  return { mode: 'windowed', firstColumn: first, lastColumn: last, nodes, paths, extent: layout.extent, focusTarget };
}
