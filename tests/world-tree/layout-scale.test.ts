import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWorldTreeLayout, getVisibleEraWindow } from '@/lib/world-tree/layout';
import type { ReaderWorldTreeProjection } from '@/lib/world-tree/types';

const TARGET = 44;
const opts = { eraWidth: 160, nodeGap: TARGET };
const metrics = { totalViews: 0, likeCount: 0, ctr: 0 };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function bigTree(count: number): ReaderWorldTreeProjection {
  const eraCount = 40;
  return {
    status: 'ok',
    audience: 'reader',
    header: { title: 'big' },
    focusNodeKey: 'n0',
    eras: Array.from({ length: eraCount }, (_, i) => ({
      eraKey: `e${i}`,
      nodeKey: 'n0',
      position: i,
      name: `era${i}`,
      yearLabel: null,
      inherited: false,
    })),
    nodes: Array.from({ length: count }, (_, i) => ({
      nodeType: 'work' as const,
      nodeKey: `n${i}`,
      parentNodeKey: i === 0 ? null : `n${Math.floor((i - 1) / 3)}`,
      workId: uuid(1000 + i),
      title: `work ${i}`,
      kind: i === 0 ? ('trunk' as const) : ('expand' as const),
      placement: { eraKey: `e${i % eraCount}`, orderIndex: i, concurrentWithPrev: false },
      diffCount: i === 0 ? null : 1,
      metrics,
    })),
  };
}

function hasOverlap(nodes: { x: number; y: number }[]): boolean {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (Math.abs(nodes[i].x - nodes[j].x) < TARGET && Math.abs(nodes[i].y - nodes[j].y) < TARGET) return true;
    }
  }
  return false;
}

describe('layout at scale', () => {
  it.each([300, 1000])('lays out %i nodes without overlapping 44px targets', (count) => {
    const layout = buildWorldTreeLayout(bigTree(count), opts);
    expect(layout.status).toBe('ok');
    expect(layout.nodes).toHaveLength(count);
    expect(hasOverlap(layout.nodes)).toBe(false);
    for (const n of layout.nodes) {
      expect(n.x).toBeLessThanOrEqual(layout.extent.width);
      expect(n.y).toBeLessThanOrEqual(layout.extent.height);
    }
  });

  it('keeps coordinates and list order stable for the same input', () => {
    const a = buildWorldTreeLayout(bigTree(1000), opts);
    const b = buildWorldTreeLayout(bigTree(1000), opts);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.listOrder).toEqual(b.listOrder);
    expect(new Set(a.listOrder).size).toBe(1000);
  });

  it('shows all nodes up to 300', () => {
    const layout = buildWorldTreeLayout(bigTree(300), opts);
    const win = getVisibleEraWindow(layout, { x: 0, width: 400 });
    expect(win.mode).toBe('all');
    expect(win.nodes).toHaveLength(300);
  });

  it('windows 301..1000 by era column, keeps extent fixed and always renders the selection', () => {
    const layout = buildWorldTreeLayout(bigTree(600), opts);
    const first = getVisibleEraWindow(layout, { x: 0, width: layout.columnWidth }, { selectedKey: 'n599' });
    const later = getVisibleEraWindow(layout, { x: layout.columnWidth * 20, width: layout.columnWidth }, { selectedKey: 'n599' });
    expect(first.mode).toBe('windowed');
    expect(first.extent).toEqual(layout.extent);
    expect(later.extent).toEqual(layout.extent);
    expect(first.nodes.length).toBeLessThan(600);
    expect(first.nodes.some((n) => n.nodeKey === 'n599')).toBe(true);
    expect(later.nodes.some((n) => n.nodeKey === 'n599')).toBe(true);
    const target = layout.nodes.find((n) => n.nodeKey === 'n599');
    expect(first.focusTarget).toEqual({ x: target?.x, y: target?.y });
    // overscan of one column on each side
    const cols = new Set(later.nodes.map((n) => layout.nodeColumns[n.nodeKey]));
    expect(cols.has(19)).toBe(true);
    expect(cols.has(21)).toBe(true);
    expect(cols.has(22)).toBe(false);
    expect(cols.has(39)).toBe(true); // the selected node only
  });

  it('falls back to the list view above 1000 and still reaches every fruit', () => {
    const layout = buildWorldTreeLayout(bigTree(1001), opts);
    expect(layout.status).toBe('fallback');
    expect(layout.nodes).toEqual([]);
    expect(layout.listOrder).toHaveLength(1001);
    expect(new Set(layout.listOrder).size).toBe(1001);
    const win = getVisibleEraWindow(layout, { x: 0, width: 400 });
    expect(win.mode).toBe('list');
    expect(win.nodes).toEqual([]);
  });

  it('does not add a graph or canvas dependency', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: object; devDependencies?: object };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /d3|dagre|elk|cytoscape|reactflow|react-flow|konva|fabric|sigma|vis-network|pixi/i.test(n))).toEqual([]);
  });
});
