import { describe, expect, it } from 'vitest';
import {
  BROKEN_BRANCH_STUB_FIELDS,
  READER_FORBIDDEN_FIELDS,
  READER_WORK_NODE_FIELDS,
  isBrokenBranchStub,
  parseBranchEligibilitySummary,
  parseWorldTreeResponse,
  totalDiffCount,
  type ReaderWorldTreeProjection,
} from '@/lib/world-tree/types';
import {
  ROOT_TITLE,
  allFixtureUuids,
  allReaderTrees,
  blindParentSummary,
  diffAdded,
  diffDeleted,
  diffModified,
  diffZero,
  eligibleSummary,
  ids,
  ifEras,
  insufficientSummary,
  ownerTree,
  placements,
  readerConsecutiveStubTree,
  readerPrivateMiddleTree,
  readerPrivateRootTree,
  readerRepublishedTree,
  trunkEras,
} from './fixtures';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Collects every object key in a JSON value (deep). */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      allKeys(inner, out);
    }
  }
  return out;
}

describe('reader DTO whitelist', () => {
  it.each(Object.entries(allReaderTrees))('%s parses as an ok reader projection', (_name, tree) => {
    const parsed = parseWorldTreeResponse(clone(tree));
    expect(parsed.status).toBe('ok');
    expect(parsed).toEqual(tree);
  });

  it.each(Object.entries(allReaderTrees))('%s serialises without setting content or document refs', (_name, tree) => {
    const keys = allKeys(parseWorldTreeResponse(clone(tree)));
    for (const forbidden of ['content', 'documentName', 'sourceNodeId', 'source_node_id']) {
      expect(keys.has(forbidden)).toBe(false);
    }
    for (const forbidden of READER_FORBIDDEN_FIELDS) expect(keys.has(forbidden)).toBe(false);
  });

  it('rejects a reader work node carrying setting content', () => {
    const tree = clone(readerPrivateRootTree);
    (tree.nodes[1] as unknown as Record<string, unknown>).content = '비밀 설정';
    expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
  });

  it('rejects a reader work node carrying a document name or source node id', () => {
    for (const extra of ['documentName', 'sourceNodeId']) {
      const tree = clone(readerPrivateRootTree);
      (tree.nodes[1] as unknown as Record<string, unknown>)[extra] = 'x';
      expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
    }
  });

  it('reader work node field list is exactly the whitelist', () => {
    expect([...READER_WORK_NODE_FIELDS].sort()).toEqual(
      ['diffCount', 'kind', 'metrics', 'nodeKey', 'nodeType', 'parentNodeKey', 'placement', 'title', 'workId'].sort(),
    );
  });
});

describe('BrokenBranchStub', () => {
  it('allows exactly nodeType/nodeKey/parentNodeKey/positionHint', () => {
    expect([...BROKEN_BRANCH_STUB_FIELDS].sort()).toEqual(['nodeKey', 'nodeType', 'parentNodeKey', 'positionHint']);
    for (const tree of [readerPrivateRootTree, readerPrivateMiddleTree, readerConsecutiveStubTree]) {
      const stubs = tree.nodes.filter(isBrokenBranchStub);
      expect(stubs.length).toBeGreaterThan(0);
      for (const stub of stubs) expect(Object.keys(stub).sort()).toEqual([...BROKEN_BRANCH_STUB_FIELDS].sort());
    }
  });

  it.each(['workId', 'branchId', 'parentId', 'rootWorkId', 'title', 'cover', 'chapters', 'metrics', 'era'])(
    'rejects a stub carrying work field %s',
    (field) => {
      const tree = clone(readerPrivateRootTree);
      (tree.nodes[0] as unknown as Record<string, unknown>)[field] = field === 'metrics' ? { totalViews: 1 } : 'leak';
      expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
    },
  );

  it('node keys are opaque per-response keys, never real UUIDs', () => {
    for (const tree of Object.values(allReaderTrees)) {
      for (const node of tree.nodes) {
        expect(node.nodeKey).toMatch(/^n\d+$/);
        expect(allFixtureUuids).not.toContain(node.nodeKey);
        if (node.parentNodeKey !== null) expect(allFixtureUuids).not.toContain(node.parentNodeKey);
      }
    }
  });

  it('rejects a stub keyed by the real parent UUID', () => {
    const tree = clone(readerPrivateRootTree);
    tree.nodes[0].nodeKey = ids.rootWork;
    tree.nodes[1].parentNodeKey = ids.rootWork;
    expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
  });

  it('parentNodeKey only links nodes within the same response', () => {
    for (const tree of Object.values(allReaderTrees)) {
      const keys = new Set(tree.nodes.map((node) => node.nodeKey));
      for (const node of tree.nodes) if (node.parentNodeKey !== null) expect(keys.has(node.parentNodeKey)).toBe(true);
    }
    const dangling = clone(readerPrivateRootTree);
    dangling.nodes[1].parentNodeKey = 'n9';
    expect(parseWorldTreeResponse(dangling)).toEqual({ status: 'unavailable' });
  });

  it('published children stay attached to the stub (private root, middle, consecutive)', () => {
    expect(readerPrivateRootTree.nodes[1]).toMatchObject({ nodeType: 'work', parentNodeKey: 'n0' });
    expect(readerPrivateMiddleTree.nodes[2]).toMatchObject({ nodeType: 'work', parentNodeKey: 'n1' });
    expect(readerPrivateMiddleTree.nodes[1]).toMatchObject({ nodeType: 'broken', parentNodeKey: 'n0' });
    expect(readerConsecutiveStubTree.nodes.map((n) => n.nodeType)).toEqual(['broken', 'broken', 'work']);
    expect(readerConsecutiveStubTree.nodes[2].parentNodeKey).toBe('n1');
  });

  it('private root response carries no root id or root title anywhere', () => {
    for (const tree of [readerPrivateRootTree, readerConsecutiveStubTree]) {
      const json = JSON.stringify(parseWorldTreeResponse(clone(tree)));
      expect(json).not.toContain(ids.rootWork);
      expect(json).not.toContain(ids.rootBranch);
      expect(json).not.toContain(ROOT_TITLE);
      for (const uuid of [ids.expandWork, ids.expandBranch, ids.ifBranch, ids.eraAncient, ids.eraMedieval]) {
        expect(json).not.toContain(uuid);
      }
    }
  });

  it('republish turns the stub back into a normal work node with the same child link', () => {
    const before = parseWorldTreeResponse(clone(readerPrivateRootTree)) as ReaderWorldTreeProjection;
    const after = parseWorldTreeResponse(clone(readerRepublishedTree)) as ReaderWorldTreeProjection;
    expect(before.nodes[0].nodeType).toBe('broken');
    expect(after.nodes[0]).toMatchObject({ nodeType: 'work', workId: ids.rootWork, kind: 'trunk' });
    expect(after.nodes[1].parentNodeKey).toBe(after.nodes[0].nodeKey);
    expect(after.nodes[1]).toEqual(before.nodes[1]);
  });

  it('rejects a reader projection whose placement points at an unknown era key', () => {
    const tree = clone(readerPrivateRootTree);
    const node = tree.nodes[1];
    if (node.nodeType !== 'work' || !node.placement) throw new Error('fixture changed');
    node.placement.eraKey = 'e9';
    expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
  });
});

describe('abnormal responses close as unavailable', () => {
  it.each([null, undefined, 42, 'ok', [], {}, { status: 'weird' }, { status: 'ok', audience: 'reader' }])(
    'closes %j',
    (raw) => {
      expect(parseWorldTreeResponse(raw)).toEqual({ status: 'unavailable' });
    },
  );

  it('passes explicit unavailable through', () => {
    expect(parseWorldTreeResponse({ status: 'unavailable' })).toEqual({ status: 'unavailable' });
  });

  it('rejects duplicated node keys and cycles', () => {
    const dup = clone(readerPrivateMiddleTree);
    dup.nodes[2].nodeKey = 'n1';
    expect(parseWorldTreeResponse(dup)).toEqual({ status: 'unavailable' });
    const cycle = clone(readerConsecutiveStubTree);
    cycle.nodes[0].parentNodeKey = 'n2';
    expect(parseWorldTreeResponse(cycle)).toEqual({ status: 'unavailable' });
  });
});

describe('owner/admin DTO', () => {
  it('keeps real ids and unpublished meta but no setting content', () => {
    const parsed = parseWorldTreeResponse(clone(ownerTree));
    expect(parsed).toEqual(ownerTree);
    const keys = allKeys(parsed);
    expect(keys.has('content')).toBe(false);
    expect(keys.has('sourceNodeId')).toBe(false);
    expect(ownerTree.branches.some((b) => !b.isPublished)).toBe(true);
  });

  it('rejects an owner projection carrying setting content', () => {
    const tree = clone(ownerTree);
    (tree.branches[0] as unknown as Record<string, unknown>).content = '본문';
    expect(parseWorldTreeResponse(tree)).toEqual({ status: 'unavailable' });
  });
});

describe('BranchEligibilitySummary', () => {
  it('blind parent: published but not reader-visible, short-circuits with parent_not_visible', () => {
    const parsed = parseBranchEligibilitySummary(clone(blindParentSummary));
    expect(parsed).toEqual(blindParentSummary);
    expect(parsed).toMatchObject({ isPublished: true, readerVisible: false, eligible: false, unmetReasons: ['parent_not_visible'] });
    expect(parsed?.publishedChapterCount).toBe(0);
    expect(parsed?.qualifyingDocumentCount).toBe(0);
    expect(Object.values(parsed?.categoryCounts ?? {})).toEqual([0, 0, 0]);
  });

  it('rejects a not-visible summary that also aggregated counts or other reasons', () => {
    const counted = clone(blindParentSummary);
    counted.publishedChapterCount = 50;
    expect(parseBranchEligibilitySummary(counted)).toBeNull();
    const extra = clone(blindParentSummary);
    extra.unmetReasons = ['parent_not_visible', 'published_chapters_insufficient'];
    expect(parseBranchEligibilitySummary(extra)).toBeNull();
    const eligibleAnyway = clone(blindParentSummary);
    eligibleAnyway.eligible = true;
    eligibleAnyway.unmetReasons = [];
    expect(parseBranchEligibilitySummary(eligibleAnyway)).toBeNull();
  });

  it('accepts insufficient and eligible summaries consistently', () => {
    expect(parseBranchEligibilitySummary(clone(insufficientSummary))).toEqual(insufficientSummary);
    expect(parseBranchEligibilitySummary(clone(eligibleSummary))).toEqual(eligibleSummary);
    const contradicting = clone(eligibleSummary);
    contradicting.unmetReasons = ['published_chapters_insufficient'];
    expect(parseBranchEligibilitySummary(contradicting)).toBeNull();
  });

  it('rejects unknown reason codes and malformed input', () => {
    const unknown = clone(insufficientSummary) as unknown as { unmetReasons: string[] };
    unknown.unmetReasons = ['made_up'];
    expect(parseBranchEligibilitySummary(unknown)).toBeNull();
    expect(parseBranchEligibilitySummary(null)).toBeNull();
    expect(parseBranchEligibilitySummary({ eligible: true })).toBeNull();
  });
});

describe('timeline and diff fixtures', () => {
  it('three trunk eras and an inherited (lock-inherited) span on the If branch', () => {
    expect(trunkEras.map((era) => era.position)).toEqual([0, 1, 2]);
    expect(ifEras.filter((era) => era.inherited).map((era) => era.sourceEraId)).toEqual([ids.eraAncient, ids.eraMedieval]);
  });

  it('expresses concurrent placement in one era', () => {
    const concurrent = placements.find((p) => p.concurrentWithPrev);
    expect(concurrent).toMatchObject({ eraId: ids.eraAncient, orderIndex: 1 });
  });

  it('diff fixtures cover zero/added/modified/deleted', () => {
    expect(totalDiffCount(diffZero)).toBe(0);
    expect(diffAdded.counts.added).toBe(1);
    expect(diffModified.counts.modified).toBe(1);
    expect(diffDeleted.counts.deleted).toBe(1);
    expect(totalDiffCount(diffAdded) + totalDiffCount(diffModified) + totalDiffCount(diffDeleted)).toBe(3);
  });
});
