import { describe, expect, it } from 'vitest';
import { buildWorldTreeLayout } from '@/lib/world-tree/layout';
import type { ReaderWorldTreeProjection } from '@/lib/world-tree/types';
import {
  allReaderTrees,
  ownerTree,
  readerConsecutiveStubTree,
  readerNormalTree,
  readerPrivateMiddleTree,
  readerPrivateRootTree,
  readerRepublishedTree,
} from './fixtures';

const opts = { eraWidth: 160, nodeGap: 48 };
const metrics = { totalViews: 0, likeCount: 0, ctr: 0 };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function pos(layout: ReturnType<typeof buildWorldTreeLayout>, key: string) {
  const node = layout.nodes.find((n) => n.nodeKey === key);
  if (!node) throw new Error(`missing ${key}`);
  return node;
}

describe('buildWorldTreeLayout: time axis and concurrency', () => {
  it('places the past left of the latest', () => {
    const layout = buildWorldTreeLayout(readerNormalTree, opts);
    expect(layout.status).toBe('ok');
    expect(pos(layout, 'n0').x).toBeLessThan(pos(layout, 'n1').x);
  });

  it('puts a concurrent work on the same x, different y', () => {
    const layout = buildWorldTreeLayout(readerNormalTree, opts);
    expect(pos(layout, 'n2').x).toBe(pos(layout, 'n0').x);
    expect(pos(layout, 'n2').y).not.toBe(pos(layout, 'n0').y);
  });

  it('alternates lanes above/below for consecutive concurrent works without overlap', () => {
    const tree: ReaderWorldTreeProjection = {
      status: 'ok',
      audience: 'reader',
      header: { title: 't' },
      focusNodeKey: 'n0',
      eras: [{ eraKey: 'e0', nodeKey: 'n0', position: 0, name: 'a', yearLabel: null, inherited: false }],
      nodes: [0, 1, 2, 3].map((i) => ({
        nodeType: 'work' as const,
        nodeKey: `n${i}`,
        parentNodeKey: i === 0 ? null : 'n0',
        workId: uuid(100 + i),
        title: `w${i}`,
        kind: i === 0 ? ('trunk' as const) : ('expand' as const),
        placement: { eraKey: 'e0', orderIndex: i, concurrentWithPrev: i > 0 },
        diffCount: i === 0 ? null : 1,
        metrics,
      })),
    };
    const layout = buildWorldTreeLayout(tree, opts);
    expect(layout.status).toBe('ok');
    expect(new Set(layout.nodes.map((n) => n.x)).size).toBe(1);
    const ys = layout.nodes.map((n) => n.y);
    expect(new Set(ys).size).toBe(4);
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i += 1) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(opts.nodeGap);
  });

  it('fails closed when the first fruit is concurrent', () => {
    const bad: ReaderWorldTreeProjection = {
      ...readerNormalTree,
      nodes: readerNormalTree.nodes.map((n) =>
        n.nodeType === 'work' && n.nodeKey === 'n0' && n.placement ? { ...n, placement: { ...n.placement, concurrentWithPrev: true } } : n,
      ),
    };
    const layout = buildWorldTreeLayout(bad, opts);
    expect(layout.status).toBe('invalid');
    expect(layout.nodes).toEqual([]);
  });

  it('does not merge same-named eras of different lines', () => {
    const tree: ReaderWorldTreeProjection = {
      status: 'ok',
      audience: 'reader',
      header: { title: 't' },
      focusNodeKey: 'n0',
      eras: [
        { eraKey: 'e0', nodeKey: 'n0', position: 0, name: '고대', yearLabel: null, inherited: false },
        { eraKey: 'e1', nodeKey: 'n1', position: 3, name: '고대', yearLabel: null, inherited: false },
      ],
      nodes: [
        { nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: uuid(1), title: 'a', kind: 'trunk', placement: { eraKey: 'e0', orderIndex: 0, concurrentWithPrev: false }, diffCount: null, metrics },
        { nodeType: 'work', nodeKey: 'n1', parentNodeKey: 'n0', workId: uuid(2), title: 'b', kind: 'if', placement: { eraKey: 'e1', orderIndex: 0, concurrentWithPrev: false }, diffCount: 1, metrics },
      ],
    };
    const layout = buildWorldTreeLayout(tree, opts);
    expect(layout.nodeColumns.n0).toBe(0);
    expect(layout.nodeColumns.n1).toBe(3);
  });

  it('continues an inherited span from the parent fork column into the own era', () => {
    const tree: ReaderWorldTreeProjection = {
      status: 'ok',
      audience: 'reader',
      header: { title: 't' },
      focusNodeKey: 'n0',
      eras: [
        { eraKey: 'e0', nodeKey: 'n0', position: 0, name: 'a', yearLabel: null, inherited: false },
        { eraKey: 'e1', nodeKey: 'n1', position: 0, name: 'a', yearLabel: null, inherited: true },
        { eraKey: 'e2', nodeKey: 'n1', position: 1, name: 'b', yearLabel: null, inherited: true },
        { eraKey: 'e3', nodeKey: 'n1', position: 2, name: 'c', yearLabel: null, inherited: false },
      ],
      nodes: [
        { nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: uuid(1), title: 'a', kind: 'trunk', placement: { eraKey: 'e0', orderIndex: 0, concurrentWithPrev: false }, diffCount: null, metrics },
        { nodeType: 'work', nodeKey: 'n1', parentNodeKey: 'n0', workId: uuid(2), title: 'b', kind: 'if', placement: { eraKey: 'e3', orderIndex: 0, concurrentWithPrev: false }, diffCount: 1, metrics },
      ],
    };
    const layout = buildWorldTreeLayout(tree, opts);
    const path = layout.paths.find((p) => p.toKey === 'n1');
    expect(path).toBeDefined();
    // path starts at the fork column (position 1), not at the parent fruit column (position 0)
    const forkX = layout.originX + 1 * layout.columnWidth;
    expect(path?.d.startsWith(`M ${forkX} `)).toBe(true);
    expect(path?.broken).toBe(false);
  });

  it('is deterministic for the same input', () => {
    expect(buildWorldTreeLayout(readerNormalTree, opts)).toEqual(buildWorldTreeLayout(readerNormalTree, opts));
  });

  it('rejects bad options', () => {
    expect(buildWorldTreeLayout(readerNormalTree, { eraWidth: 0, nodeGap: 48 }).status).toBe('invalid');
  });
});

describe('buildWorldTreeLayout: broken-branch stubs', () => {
  it('connects a published child to a private root stub with a broken path', () => {
    const layout = buildWorldTreeLayout(readerPrivateRootTree, opts);
    expect(layout.status).toBe('ok');
    expect(layout.paths).toHaveLength(1);
    expect(layout.paths[0]).toMatchObject({ fromKey: 'n0', toKey: 'n1', broken: true });
    expect(layout.nodes.map((n) => n.nodeType)).toContain('broken');
  });

  it('exposes only coordinates for a stub (no title/metrics) and keeps the child in the list', () => {
    const layout = buildWorldTreeLayout(readerPrivateRootTree, opts);
    const stub = pos(layout, 'n0');
    expect(Object.keys(stub).sort()).toEqual(['nodeKey', 'nodeType', 'x', 'y']);
    expect(layout.listOrder).toEqual(['n0', 'n1']);
    expect(JSON.stringify(layout)).not.toMatch(/title|metrics|workId/);
  });

  it('attaches a grandchild to a middle stub and chains consecutive stubs', () => {
    const middle = buildWorldTreeLayout(readerPrivateMiddleTree, opts);
    expect(middle.paths.map((p) => `${p.fromKey}>${p.toKey}:${p.broken}`)).toEqual(['n0>n1:true', 'n1>n2:true']);
    const chain = buildWorldTreeLayout(readerConsecutiveStubTree, opts);
    expect(chain.status).toBe('ok');
    expect(chain.paths.map((p) => `${p.fromKey}>${p.toKey}`)).toEqual(['n0>n1', 'n1>n2']);
    expect(pos(chain, 'n0').x).toBeLessThan(pos(chain, 'n2').x);
  });

  it('restores normal (unbroken) paths after republish', () => {
    const layout = buildWorldTreeLayout(readerRepublishedTree, opts);
    expect(layout.paths.every((p) => !p.broken)).toBe(true);
    expect(layout.paths[0]).toMatchObject({ fromKey: 'n0', toKey: 'n1' });
  });

  it('lays out every reader fixture', () => {
    for (const tree of Object.values(allReaderTrees)) {
      const layout = buildWorldTreeLayout(tree, opts);
      expect(layout.status).toBe('ok');
      expect([...layout.listOrder].sort()).toEqual(tree.nodes.map((n) => n.nodeKey).sort());
    }
  });
});

describe('buildWorldTreeLayout: fail closed', () => {
  it('rejects orphans, cycles and duplicate keys', () => {
    const orphan: ReaderWorldTreeProjection = {
      ...readerPrivateRootTree,
      nodes: [readerPrivateRootTree.nodes[0], { ...readerPrivateRootTree.nodes[1], parentNodeKey: 'n9' }],
    };
    expect(buildWorldTreeLayout(orphan, opts).status).toBe('invalid');

    const cycle: ReaderWorldTreeProjection = {
      ...readerNormalTree,
      nodes: readerNormalTree.nodes.map((n, i) => (i === 0 ? { ...n, parentNodeKey: 'n1' } : n)),
    };
    expect(buildWorldTreeLayout(cycle, opts).status).toBe('invalid');

    const dup: ReaderWorldTreeProjection = { ...readerNormalTree, nodes: [readerNormalTree.nodes[0], readerNormalTree.nodes[0]] };
    expect(buildWorldTreeLayout(dup, opts).status).toBe('invalid');
  });

  it('rejects an unknown era reference', () => {
    const bad: ReaderWorldTreeProjection = { ...readerNormalTree, eras: [] };
    expect(buildWorldTreeLayout(bad, opts).status).toBe('invalid');
  });

  it('shows an unplaced root as an explicit initial-era fruit', () => {
    const layout = buildWorldTreeLayout(readerRepublishedTree, opts);
    expect(layout.nodeColumns.n0).toBe(0);
    expect(pos(layout, 'n0').x).toBe(layout.originX);
  });
});

describe('buildWorldTreeLayout: owner projection', () => {
  it('lays out owner branches by work id', () => {
    const layout = buildWorldTreeLayout(ownerTree, opts);
    expect(layout.status).toBe('ok');
    expect(layout.nodes).toHaveLength(2);
    expect(layout.paths).toHaveLength(1);
    expect(layout.paths[0].broken).toBe(false);
  });
});
