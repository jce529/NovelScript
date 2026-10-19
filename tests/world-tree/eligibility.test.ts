import { describe, expect, it } from 'vitest';
import {
  WORLD_TREE_ELIGIBILITY,
  countQualifyingDocuments,
  evaluateBranchEligibility,
  normalizeEligibilityBody,
  eligibilityBodyLength,
  type EligibilityKbDocumentFact,
  type EligibilityServerFacts,
} from '@/lib/world-tree/eligibility';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import { ids } from './fixtures';

const SOURCE = ids.rootWork;
const OTHER = ids.ifWork;
const BODY_200 = '가'.repeat(200);
const BODY_199 = '가'.repeat(199);

const SEED_PERSON = '﻿---\ntitle: <% tp.file.title %>\n---\n# <%tp.file.title%>\n' + '설정 항목 '.repeat(60);

let seq = 0;
function doc(category: string, overrides: Partial<EligibilityKbDocumentFact> = {}): EligibilityKbDocumentFact {
  seq += 1;
  return {
    id: `doc-${seq}`,
    workId: SOURCE,
    scope: 'work',
    nodeType: 'file',
    category,
    name: `문서 ${seq}`,
    content: `${BODY_200}-${seq}`,
    deletedAt: null,
    ...overrides,
  };
}

function docs(counts: Record<string, number>): EligibilityKbDocumentFact[] {
  return Object.entries(counts).flatMap(([category, n]) => Array.from({ length: n }, () => doc(category)));
}

/** 인물5/장소3/사건3 + 세력/아이템으로 총 20. */
const FULL = { 인물: 5, 장소: 3, 사건: 3, 세력: 5, 아이템: 4 };

function facts(overrides: Partial<EligibilityServerFacts> = {}): EligibilityServerFacts {
  return {
    sourceWorkId: SOURCE,
    readerVisible: true,
    publishedChapterCount: 50,
    documents: docs(FULL),
    canonicalTemplateSeeds: { 인물: SEED_PERSON },
    ...overrides,
  };
}

describe('WORLD_TREE_ELIGIBILITY constants (single source)', () => {
  it('holds the user-confirmed rule-22 values', () => {
    expect(WORLD_TREE_ELIGIBILITY).toEqual({
      minPublishedChapters: 50,
      minDocumentBodyChars: 200,
      minSettingDocuments: 20,
      categoryMinimums: { 인물: 5, 장소: 3, 사건: 3 },
    });
    expect(Object.isFrozen(WORLD_TREE_ELIGIBILITY)).toBe(true);
    expect(Object.isFrozen(WORLD_TREE_ELIGIBILITY.categoryMinimums)).toBe(true);
  });

  it('reports the same thresholds in every summary', () => {
    const summary = evaluateBranchEligibility(facts());
    expect(summary.thresholds).toEqual({
      minPublishedChapters: 50,
      minDocumentChars: 200,
      minQualifyingDocuments: 20,
      minCategoryDocuments: { 인물: 5, 장소: 3, 사건: 3 },
    });
  });
});

describe('published chapters boundary', () => {
  it('49 published chapters is not eligible, 50 is', () => {
    const at49 = evaluateBranchEligibility(facts({ publishedChapterCount: 49 }));
    expect(at49.eligible).toBe(false);
    expect(at49.unmetReasons).toEqual(['published_chapters_insufficient']);
    const at50 = evaluateBranchEligibility(facts({ publishedChapterCount: 50 }));
    expect(at50.eligible).toBe(true);
    expect(at50.unmetReasons).toEqual([]);
    expect(at50.isPublished).toBe(true);
    expect(at50.publishedChapterCount).toBe(50);
  });

  it('draft / unpublished parent (no published chapter) is not eligible', () => {
    const draft = evaluateBranchEligibility(facts({ publishedChapterCount: 0, readerVisible: false }));
    expect(draft.eligible).toBe(false);
    expect(draft.isPublished).toBe(false);
    expect(draft.unmetReasons).toEqual(['parent_not_visible']);
  });

  it('fails closed when readerVisible=true is paired with zero published chapters', () => {
    const odd = evaluateBranchEligibility(facts({ publishedChapterCount: 0 }));
    expect(odd.eligible).toBe(false);
    expect(odd.unmetReasons).toEqual(['parent_not_visible']);
  });

  it('rejects non-integer / negative chapter counts as not published', () => {
    for (const bad of [-1, Number.NaN, 50.5, Number.POSITIVE_INFINITY]) {
      const s = evaluateBranchEligibility(facts({ publishedChapterCount: bad }));
      expect(s.eligible).toBe(false);
    }
  });
});

describe('reader-visible precondition (parent_not_visible short-circuit)', () => {
  it('blind parent with 50 chapters and full documents is parent_not_visible with counts not aggregated', () => {
    const s = evaluateBranchEligibility(facts({ readerVisible: false }));
    expect(s).toEqual({
      eligible: false,
      isPublished: true,
      readerVisible: false,
      publishedChapterCount: 0,
      qualifyingDocumentCount: 0,
      categoryCounts: { 인물: 0, 장소: 0, 사건: 0 },
      thresholds: s.thresholds,
      unmetReasons: ['parent_not_visible'],
    });
  });

  it('only the strict boolean true counts as visible', () => {
    const s = evaluateBranchEligibility(facts({ readerVisible: 'true' as unknown as boolean }));
    expect(s.unmetReasons).toEqual(['parent_not_visible']);
  });
});

describe('document totals and category minimums', () => {
  it('19 qualifying documents is insufficient, 20 is enough', () => {
    const at19 = evaluateBranchEligibility(facts({ documents: docs({ ...FULL, 아이템: 3 }) }));
    expect(at19.qualifyingDocumentCount).toBe(19);
    expect(at19.unmetReasons).toEqual(['qualifying_documents_insufficient']);
    const at20 = evaluateBranchEligibility(facts({ documents: docs(FULL) }));
    expect(at20.qualifyingDocumentCount).toBe(20);
    expect(at20.eligible).toBe(true);
  });

  it.each([
    ['인물', 4, 'character_documents_insufficient'],
    ['장소', 2, 'place_documents_insufficient'],
    ['사건', 2, 'event_documents_insufficient'],
  ] as const)('%s %i with total still >= 20 fails only that category', (category, n, reason) => {
    const counts = { ...FULL, [category]: n, 세력: FULL.세력 + 5 };
    const s = evaluateBranchEligibility(facts({ documents: docs(counts) }));
    expect(s.qualifyingDocumentCount).toBeGreaterThanOrEqual(20);
    expect(s.categoryCounts[category]).toBe(n);
    expect(s.eligible).toBe(false);
    expect(s.unmetReasons).toEqual([reason]);
  });

  it('category minimum met exactly (5/3/3) passes', () => {
    const s = evaluateBranchEligibility(facts());
    expect(s.categoryCounts).toEqual({ 인물: 5, 장소: 3, 사건: 3 });
  });

  it('세력/아이템 count toward the total but never replace 인물/장소/사건', () => {
    const s = evaluateBranchEligibility(facts({ documents: docs({ 세력: 15, 아이템: 15 }) }));
    expect(s.qualifyingDocumentCount).toBe(30);
    expect(s.unmetReasons).toEqual([
      'character_documents_insufficient',
      'place_documents_insufficient',
      'event_documents_insufficient',
    ]);
  });

  it('computes every shortfall independently', () => {
    const s = evaluateBranchEligibility(facts({ publishedChapterCount: 10, documents: [] }));
    expect(s.unmetReasons).toEqual([
      'published_chapters_insufficient',
      'qualifying_documents_insufficient',
      'character_documents_insufficient',
      'place_documents_insufficient',
      'event_documents_insufficient',
    ]);
  });
});

describe('qualifying document filter', () => {
  const one = (d: EligibilityKbDocumentFact, extra: Partial<EligibilityServerFacts> = {}) =>
    countQualifyingDocuments(facts({ documents: [d], ...extra }));

  it('199 chars excluded, 200 chars included (after trim)', () => {
    expect(one(doc('인물', { content: BODY_199 })).total).toBe(0);
    expect(one(doc('인물', { content: BODY_200 })).total).toBe(1);
    expect(one(doc('인물', { content: `  \n\t${BODY_199}　\n ` })).total).toBe(0);
    expect(one(doc('인물', { content: `﻿  ${BODY_200}  \r\n` })).total).toBe(1);
  });

  it('counts UTF-16 surrogate pairs as one Unicode character', () => {
    const emoji199 = '😀'.repeat(199);
    expect(emoji199.length).toBe(398);
    expect(eligibilityBodyLength(emoji199)).toBe(199);
    expect(one(doc('인물', { content: emoji199 })).total).toBe(0);
    expect(one(doc('인물', { content: '😀'.repeat(200) })).total).toBe(1);
  });

  it('excludes null / empty / whitespace-only bodies', () => {
    expect(one(doc('인물', { content: null })).total).toBe(0);
    expect(one(doc('인물', { content: '' })).total).toBe(0);
    expect(one(doc('인물', { content: ' \n\t 　'.repeat(100) })).total).toBe(0);
  });

  it('excludes deleted, other-work, account-template and folder nodes', () => {
    expect(one(doc('인물', { deletedAt: '2026-10-01T00:00:00Z' })).total).toBe(0);
    expect(one(doc('인물', { workId: OTHER })).total).toBe(0);
    expect(one(doc('인물', { scope: 'account_template', workId: null })).total).toBe(0);
    expect(one(doc('인물', { nodeType: 'folder' })).total).toBe(0);
  });

  it('excludes 회차 folder, template, custom and unexpected categories', () => {
    for (const category of ['회차', 'template', 'custom', 'person', '', '인물 ']) {
      expect(one(doc(category)).total).toBe(0);
    }
  });

  it('excludes canonical default-template seeds, raw or title-substituted, by seed provenance', () => {
    expect(one(doc('인물', { name: '아린', content: SEED_PERSON })).total).toBe(0);
    const substituted = SEED_PERSON.replaceAll(/<%\s*tp\.file\.title\s*%>/g, '아린');
    expect(one(doc('인물', { name: '아린', content: substituted })).total).toBe(0);
    // CRLF checkout of the same seed is still the seed.
    expect(one(doc('인물', { name: '아린', content: substituted.replaceAll('\n', '\r\n') })).total).toBe(0);
    // Edited seed is real writing.
    expect(one(doc('인물', { name: '아린', content: `${substituted}\n아린은 북부 출신이다.` })).total).toBe(1);
    // Provenance is the seed catalog, not the document name.
    expect(one(doc('인물', { name: '인물 템플릿', content: BODY_200 })).total).toBe(1);
    // Seed of another category does not exclude a 장소 doc that happens to equal it? It does not match 장소 seed.
    expect(one(doc('장소', { name: '아린', content: substituted })).total).toBe(1);
  });

  it('reports counts for every KB category and ignores client-supplied extras', () => {
    const result = countQualifyingDocuments(facts());
    expect(Object.keys(result.byCategory).sort()).toEqual([...KB_CATEGORIES].sort());
    expect(result.byCategory).toEqual({ 인물: 5, 장소: 3, 사건: 3, 세력: 5, 아이템: 4 });
    expect(result.total).toBe(20);
  });
});

describe('re-branching uses the same rule for root / If / expand children', () => {
  it.each([
    ['root', ids.rootWork],
    ['if', ids.ifWork],
    ['expand', ids.expandWork],
  ])('%s source has identical evaluation', (_kind, workId) => {
    const documents = docs(FULL).map((d) => ({ ...d, workId }));
    const ok = evaluateBranchEligibility(facts({ sourceWorkId: workId, documents }));
    expect(ok.eligible).toBe(true);
    const short = evaluateBranchEligibility(facts({ sourceWorkId: workId, documents, publishedChapterCount: 49 }));
    expect(short.unmetReasons).toEqual(['published_chapters_insufficient']);
    // Parent's documents never count for the child.
    const parentDocs = evaluateBranchEligibility(facts({ sourceWorkId: workId, documents: docs(FULL).map((d) => ({ ...d, workId: workId === SOURCE ? OTHER : SOURCE })) }));
    expect(parentDocs.qualifyingDocumentCount).toBe(0);
  });
});

describe('normalizeEligibilityBody', () => {
  it('removes CR and trims the shared whitespace set', () => {
    expect(normalizeEligibilityBody('﻿ \r\n가\r\n나 　')).toBe('가\n나');
    expect(normalizeEligibilityBody(null)).toBe('');
  });
});
