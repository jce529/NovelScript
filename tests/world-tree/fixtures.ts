/**
 * Phase 18 Wave 0 fixtures (owned by 18-01). Later plans import these and do not edit them.
 *
 * Every scenario the pure world-tree suites need is expressed here once:
 *  - root/If/expand branches on one world, owner view with real IDs and unpublished meta
 *  - reader projections: normal tree, private root stub, private middle parent stub,
 *    consecutive stubs, and the same world after the private root is republished
 *  - three eras with a concurrent placement and an inherited (lock-inherited) era span
 *  - zero / added / modified / deleted branch diffs
 *  - eligibility summaries (blind parent, insufficient, eligible)
 *
 * Reader fixtures never contain DB UUIDs: node keys are per-response opaque keys (n0, n1, ...).
 * Thresholds below are TEST DATA ONLY; the real policy values are owned by 18-13.
 */
import type {
  BranchDiff,
  BranchDraft,
  BranchEligibilitySummary,
  BranchEligibilityThresholds,
  Era,
  EraPlacement,
  OwnerWorldTreeProjection,
  ReaderWorldTreeProjection,
  WorldBranch,
} from '@/lib/world-tree/types';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const ids = {
  owner: uuid(1),
  rootWork: uuid(10),
  ifWork: uuid(11),
  expandWork: uuid(12),
  grandchildWork: uuid(13),
  draftWork: uuid(14),
  rootBranch: uuid(20),
  ifBranch: uuid(21),
  expandBranch: uuid(22),
  grandchildBranch: uuid(23),
  draftBranch: uuid(24),
  eraAncient: uuid(30),
  eraMedieval: uuid(31),
  eraModern: uuid(32),
  ifEraAncient: uuid(33),
  ifEraMedieval: uuid(34),
  ifEraOwn: uuid(35),
  placementRoot: uuid(40),
  placementConcurrent: uuid(41),
  placementIf: uuid(42),
  sourceNode: uuid(50),
  draftNode: uuid(51),
  requestId: uuid(60),
} as const;

/** Every UUID used by fixtures — reader payloads must not contain any of them. */
export const allFixtureUuids: string[] = Object.values(ids);

export const ROOT_TITLE = '첫 왕국 연대기';
export const IF_TITLE = '만약 왕이 살았다면';
export const EXPAND_TITLE = '변방의 기사';
export const GRANDCHILD_TITLE = '기사의 아들';

const T0 = '2026-10-01T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Owner-side rows
// ---------------------------------------------------------------------------

export const rootBranch: WorldBranch = {
  id: ids.rootBranch,
  rootWorkId: ids.rootWork,
  workId: ids.rootWork,
  ownerId: ids.owner,
  parentBranchId: null,
  kind: 'trunk',
  status: 'confirmed',
  forkEraId: null,
  confirmedAt: T0,
  deletedAt: null,
};

export const ifBranch: WorldBranch = {
  id: ids.ifBranch,
  rootWorkId: ids.rootWork,
  workId: ids.ifWork,
  ownerId: ids.owner,
  parentBranchId: ids.rootBranch,
  kind: 'if',
  status: 'confirmed',
  forkEraId: ids.eraMedieval,
  confirmedAt: T0,
  deletedAt: null,
};

export const expandBranch: WorldBranch = {
  id: ids.expandBranch,
  rootWorkId: ids.rootWork,
  workId: ids.expandWork,
  ownerId: ids.owner,
  parentBranchId: ids.rootBranch,
  kind: 'expand',
  status: 'confirmed',
  forkEraId: ids.eraModern,
  confirmedAt: T0,
  deletedAt: null,
};

export const grandchildBranch: WorldBranch = {
  id: ids.grandchildBranch,
  rootWorkId: ids.rootWork,
  workId: ids.grandchildWork,
  ownerId: ids.owner,
  parentBranchId: ids.expandBranch,
  kind: 'expand',
  status: 'confirmed',
  forkEraId: ids.eraModern,
  confirmedAt: T0,
  deletedAt: null,
};

export const draftBranch: WorldBranch = {
  id: ids.draftBranch,
  rootWorkId: ids.rootWork,
  workId: ids.draftWork,
  ownerId: ids.owner,
  parentBranchId: ids.rootBranch,
  kind: 'if',
  status: 'draft',
  forkEraId: ids.eraAncient,
  confirmedAt: null,
  deletedAt: null,
};

export const allBranches: WorldBranch[] = [rootBranch, ifBranch, expandBranch, grandchildBranch, draftBranch];

/** Owner draft DTO: no setting content, no source node references. */
export const branchDraft: BranchDraft = {
  branchId: ids.draftBranch,
  draftWorkId: ids.draftWork,
  sourceWorkId: ids.rootWork,
  rootWorkId: ids.rootWork,
  kind: 'if',
  status: 'draft',
  forkEraId: ids.eraAncient,
  requestId: ids.requestId,
  createdAt: T0,
};

/** Three eras on the trunk. */
export const trunkEras: Era[] = [
  { id: ids.eraAncient, branchId: ids.rootBranch, sourceEraId: null, position: 0, name: '고대', yearLabel: '1~300년', memo: null, inherited: false, deletedAt: null },
  { id: ids.eraMedieval, branchId: ids.rootBranch, sourceEraId: null, position: 1, name: '중세', yearLabel: '301~900년', memo: '왕국 분열', inherited: false, deletedAt: null },
  { id: ids.eraModern, branchId: ids.rootBranch, sourceEraId: null, position: 2, name: '근대', yearLabel: null, memo: null, inherited: false, deletedAt: null },
];

/**
 * If branch forked at 중세: 고대/중세 are inherited copies (lock-inherited span, WTREE-09 locks
 * follow the child reader's progress — not implemented in Phase 18), then its own era.
 */
export const ifEras: Era[] = [
  { id: ids.ifEraAncient, branchId: ids.ifBranch, sourceEraId: ids.eraAncient, position: 0, name: '고대', yearLabel: '1~300년', memo: null, inherited: true, deletedAt: null },
  { id: ids.ifEraMedieval, branchId: ids.ifBranch, sourceEraId: ids.eraMedieval, position: 1, name: '중세', yearLabel: '301~900년', memo: null, inherited: true, deletedAt: null },
  { id: ids.ifEraOwn, branchId: ids.ifBranch, sourceEraId: null, position: 2, name: '왕의 귀환', yearLabel: null, memo: null, inherited: false, deletedAt: null },
];

/** Root work + a concurrent sibling placement in the same era, and the If work on its own era. */
export const placements: EraPlacement[] = [
  { id: ids.placementRoot, branchId: ids.rootBranch, eraId: ids.eraAncient, workId: ids.rootWork, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
  { id: ids.placementConcurrent, branchId: ids.rootBranch, eraId: ids.eraAncient, workId: ids.expandWork, orderIndex: 1, concurrentWithPrev: true, relationLabel: '같은 시기' },
  { id: ids.placementIf, branchId: ids.ifBranch, eraId: ids.ifEraOwn, workId: ids.ifWork, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
];

// ---------------------------------------------------------------------------
// Diffs (owner-only entries carry names; reader DTOs only ever see a count)
// ---------------------------------------------------------------------------

export const diffZero: BranchDiff = { counts: { added: 0, modified: 0, deleted: 0 }, entries: [] };

export const diffAdded: BranchDiff = {
  counts: { added: 1, modified: 0, deleted: 0 },
  entries: [{ draftNodeId: ids.draftNode, sourceNodeId: null, name: '새 인물', category: '인물', changeKind: 'added' }],
};

export const diffModified: BranchDiff = {
  counts: { added: 0, modified: 1, deleted: 0 },
  entries: [{ draftNodeId: ids.draftNode, sourceNodeId: ids.sourceNode, name: '왕', category: '인물', changeKind: 'modified' }],
};

export const diffDeleted: BranchDiff = {
  counts: { added: 0, modified: 0, deleted: 1 },
  entries: [{ draftNodeId: null, sourceNodeId: ids.sourceNode, name: '왕', category: '인물', changeKind: 'deleted' }],
};

// ---------------------------------------------------------------------------
// Eligibility (rule 22)
// ---------------------------------------------------------------------------

/** TEST DATA ONLY — 18-13 owns the real threshold values. */
export const fixtureThresholds: BranchEligibilityThresholds = {
  minPublishedChapters: 50,
  minDocumentChars: 200,
  minQualifyingDocuments: 20,
  minCategoryDocuments: { 인물: 5, 장소: 3, 사건: 3 },
};

/** Blinded parent: published, but not reader-visible -> short-circuit, counts not aggregated. */
export const blindParentSummary: BranchEligibilitySummary = {
  eligible: false,
  isPublished: true,
  readerVisible: false,
  publishedChapterCount: 0,
  qualifyingDocumentCount: 0,
  categoryCounts: { 인물: 0, 장소: 0, 사건: 0 },
  thresholds: fixtureThresholds,
  unmetReasons: ['parent_not_visible'],
};

export const insufficientSummary: BranchEligibilitySummary = {
  eligible: false,
  isPublished: true,
  readerVisible: true,
  publishedChapterCount: 49,
  qualifyingDocumentCount: 20,
  categoryCounts: { 인물: 5, 장소: 2, 사건: 3 },
  thresholds: fixtureThresholds,
  unmetReasons: ['published_chapters_insufficient', 'place_documents_insufficient'],
};

export const eligibleSummary: BranchEligibilitySummary = {
  eligible: true,
  isPublished: true,
  readerVisible: true,
  publishedChapterCount: 50,
  qualifyingDocumentCount: 20,
  categoryCounts: { 인물: 5, 장소: 3, 사건: 3 },
  thresholds: fixtureThresholds,
  unmetReasons: [],
};

// ---------------------------------------------------------------------------
// Reader projections (opaque per-response keys only)
// ---------------------------------------------------------------------------

const noMetrics = { totalViews: 0, likeCount: 0, ctr: 0 };

/** Everything published: root -> If, root -> expand. */
export const readerNormalTree: ReaderWorldTreeProjection = {
  status: 'ok',
  audience: 'reader',
  header: { title: ROOT_TITLE },
  focusNodeKey: 'n0',
  eras: [
    { eraKey: 'e0', nodeKey: 'n0', position: 0, name: '고대', yearLabel: '1~300년', inherited: false },
    { eraKey: 'e1', nodeKey: 'n0', position: 1, name: '중세', yearLabel: '301~900년', inherited: false },
    { eraKey: 'e2', nodeKey: 'n0', position: 2, name: '근대', yearLabel: null, inherited: false },
    { eraKey: 'e3', nodeKey: 'n1', position: 2, name: '왕의 귀환', yearLabel: null, inherited: false },
  ],
  nodes: [
    { nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: ids.rootWork, title: ROOT_TITLE, kind: 'trunk', placement: { eraKey: 'e0', orderIndex: 0, concurrentWithPrev: false }, diffCount: null, metrics: { totalViews: 900, likeCount: 40, ctr: 0.5 } },
    { nodeType: 'work', nodeKey: 'n1', parentNodeKey: 'n0', workId: ids.ifWork, title: IF_TITLE, kind: 'if', placement: { eraKey: 'e3', orderIndex: 0, concurrentWithPrev: false }, diffCount: 3, metrics: { totalViews: 120, likeCount: 8, ctr: 0.3 } },
    { nodeType: 'work', nodeKey: 'n2', parentNodeKey: 'n0', workId: ids.expandWork, title: EXPAND_TITLE, kind: 'expand', placement: { eraKey: 'e0', orderIndex: 1, concurrentWithPrev: true }, diffCount: 2, metrics: noMetrics },
  ],
};

/**
 * Root unpublished (all chapters unpublished): reader sees a broken-branch stub at n0 and the
 * published If child still hangs from it. Header falls back to the requested published work.
 */
export const readerPrivateRootTree: ReaderWorldTreeProjection = {
  status: 'ok',
  audience: 'reader',
  header: { title: IF_TITLE },
  focusNodeKey: 'n1',
  eras: [
    { eraKey: 'e0', nodeKey: 'n1', position: 0, name: '고대', yearLabel: '1~300년', inherited: true },
    { eraKey: 'e1', nodeKey: 'n1', position: 1, name: '중세', yearLabel: '301~900년', inherited: true },
    { eraKey: 'e2', nodeKey: 'n1', position: 2, name: '왕의 귀환', yearLabel: null, inherited: false },
  ],
  nodes: [
    { nodeType: 'broken', nodeKey: 'n0', parentNodeKey: null, positionHint: 0 },
    { nodeType: 'work', nodeKey: 'n1', parentNodeKey: 'n0', workId: ids.ifWork, title: IF_TITLE, kind: 'if', placement: { eraKey: 'e2', orderIndex: 0, concurrentWithPrev: false }, diffCount: 3, metrics: { totalViews: 120, likeCount: 8, ctr: 0.3 } },
  ],
};

/** Root published, middle expand parent unpublished, grandchild published. */
export const readerPrivateMiddleTree: ReaderWorldTreeProjection = {
  status: 'ok',
  audience: 'reader',
  header: { title: ROOT_TITLE },
  focusNodeKey: 'n2',
  eras: [{ eraKey: 'e0', nodeKey: 'n0', position: 0, name: '고대', yearLabel: null, inherited: false }],
  nodes: [
    { nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: ids.rootWork, title: ROOT_TITLE, kind: 'trunk', placement: { eraKey: 'e0', orderIndex: 0, concurrentWithPrev: false }, diffCount: null, metrics: noMetrics },
    { nodeType: 'broken', nodeKey: 'n1', parentNodeKey: 'n0', positionHint: 1 },
    { nodeType: 'work', nodeKey: 'n2', parentNodeKey: 'n1', workId: ids.grandchildWork, title: GRANDCHILD_TITLE, kind: 'expand', placement: null, diffCount: 1, metrics: noMetrics },
  ],
};

/** Root and middle parent both unpublished: consecutive stubs keep the published grandchild attached. */
export const readerConsecutiveStubTree: ReaderWorldTreeProjection = {
  status: 'ok',
  audience: 'reader',
  header: { title: GRANDCHILD_TITLE },
  focusNodeKey: 'n2',
  eras: [],
  nodes: [
    { nodeType: 'broken', nodeKey: 'n0', parentNodeKey: null, positionHint: 0 },
    { nodeType: 'broken', nodeKey: 'n1', parentNodeKey: 'n0', positionHint: 1 },
    { nodeType: 'work', nodeKey: 'n2', parentNodeKey: 'n1', workId: ids.grandchildWork, title: GRANDCHILD_TITLE, kind: 'expand', placement: null, diffCount: 1, metrics: noMetrics },
  ],
};

/** Same world as readerPrivateRootTree after the root republishes one chapter: stub -> work again. */
export const readerRepublishedTree: ReaderWorldTreeProjection = {
  status: 'ok',
  audience: 'reader',
  header: { title: IF_TITLE },
  focusNodeKey: 'n1',
  eras: readerPrivateRootTree.eras,
  nodes: [
    { nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: ids.rootWork, title: ROOT_TITLE, kind: 'trunk', placement: null, diffCount: null, metrics: noMetrics },
    readerPrivateRootTree.nodes[1],
  ],
};

export const allReaderTrees: Record<string, ReaderWorldTreeProjection> = {
  readerNormalTree,
  readerPrivateRootTree,
  readerPrivateMiddleTree,
  readerConsecutiveStubTree,
  readerRepublishedTree,
};

// ---------------------------------------------------------------------------
// Owner/admin projection: real IDs and unpublished meta, still no setting content
// ---------------------------------------------------------------------------

export const ownerTree: OwnerWorldTreeProjection = {
  status: 'ok',
  audience: 'owner',
  header: { title: ROOT_TITLE },
  focusWorkId: ids.ifWork,
  rootWorkId: ids.rootWork,
  branches: [
    { branchId: ids.rootBranch, workId: ids.rootWork, parentBranchId: null, title: ROOT_TITLE, kind: 'trunk', status: 'confirmed', isPublished: false, readerVisible: false, forkEraId: null, diffCount: null, metrics: noMetrics },
    { branchId: ids.ifBranch, workId: ids.ifWork, parentBranchId: ids.rootBranch, title: IF_TITLE, kind: 'if', status: 'confirmed', isPublished: true, readerVisible: true, forkEraId: ids.eraMedieval, diffCount: 3, metrics: { totalViews: 120, likeCount: 8, ctr: 0.3 } },
  ],
  eras: [...trunkEras, ...ifEras],
  placements,
};
