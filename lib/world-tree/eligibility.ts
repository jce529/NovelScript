/**
 * WORLD-TREE rule 22 — branching eligibility (18-13).
 *
 * This file is the SINGLE SOURCE of the eligibility thresholds. UI, Server Actions and RPC
 * arguments never copy these numbers: the UI renders `summary.thresholds` returned by the
 * server, and the DB policy function is generated from the same constant by
 * `renderEligibilityPolicySql()` (18-14 pastes the generated block into
 * 0033_world_tree_eligibility.sql and checks it for drift).
 *
 * Evaluation inputs are SERVER facts only (DB rows + world_work_reader_visible() result from
 * 18-14). Client payloads are never treated as facts and can never supply thresholds.
 * Store sale eligibility (on hold) reuses the same pure evaluation; WTREE-09 progress /
 * document locking is out of scope here.
 */
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import {
  ELIGIBILITY_CATEGORIES,
  type BranchEligibilitySummary,
  type BranchEligibilityThresholds,
  type EligibilityCategory,
  type EligibilityUnmetReason,
  type Uuid,
} from '@/lib/world-tree/types';

// ---------------------------------------------------------------------------
// Thresholds (SSOT)
// ---------------------------------------------------------------------------

export interface WorldTreeEligibilityConstants {
  readonly minPublishedChapters: number;
  readonly minDocumentBodyChars: number;
  readonly minSettingDocuments: number;
  readonly categoryMinimums: Readonly<Record<EligibilityCategory, number>>;
}

/** User-confirmed 2026-10-13 (18-CONTEXT Open Decisions #2). Adjust ONLY here, then
 * regenerate the SQL block (see renderEligibilityPolicySql). */
export const WORLD_TREE_ELIGIBILITY: WorldTreeEligibilityConstants = Object.freeze({
  minPublishedChapters: 50,
  minDocumentBodyChars: 200,
  minSettingDocuments: 20,
  categoryMinimums: Object.freeze({ 인물: 5, 장소: 3, 사건: 3 }),
});

/** Threshold view in the 18-01 summary contract shape. */
export function eligibilityThresholds(): BranchEligibilityThresholds {
  return {
    minPublishedChapters: WORLD_TREE_ELIGIBILITY.minPublishedChapters,
    minDocumentChars: WORLD_TREE_ELIGIBILITY.minDocumentBodyChars,
    minQualifyingDocuments: WORLD_TREE_ELIGIBILITY.minSettingDocuments,
    minCategoryDocuments: { ...WORLD_TREE_ELIGIBILITY.categoryMinimums },
  };
}

const CATEGORY_REASON: Record<EligibilityCategory, EligibilityUnmetReason> = {
  인물: 'character_documents_insufficient',
  장소: 'place_documents_insufficient',
  사건: 'event_documents_insufficient',
};

// ---------------------------------------------------------------------------
// Body normalization (identical in TS and SQL)
// ---------------------------------------------------------------------------

/**
 * Whitespace removed from both ends before counting. Explicit set (not JS String#trim) so the
 * SQL `btrim(text, chars)` in renderEligibilityPolicySql() is byte-for-byte the same rule.
 * CR (U+000D) is first removed everywhere, so CRLF and LF bodies count the same.
 */
export const ELIGIBILITY_TRIM_CODE_POINTS: readonly number[] = Object.freeze([
  0x20, // space
  0x09, // tab
  0x0a, // LF
  0x0b, // VT
  0x0c, // FF
  0xa0, // NBSP
  0x3000, // ideographic space
  0xfeff, // BOM / ZWNBSP
]);

const TRIM_SET = new Set(ELIGIBILITY_TRIM_CODE_POINTS);

/** Remove every CR, then trim the shared whitespace set from both ends. */
export function normalizeEligibilityBody(content: string | null | undefined): string {
  if (typeof content !== 'string') return '';
  const chars = Array.from(content.replaceAll('\r', ''));
  let start = 0;
  let end = chars.length;
  while (start < end && TRIM_SET.has(chars[start].codePointAt(0)!)) start += 1;
  while (end > start && TRIM_SET.has(chars[end - 1].codePointAt(0)!)) end -= 1;
  return chars.slice(start, end).join('');
}

/** Unicode code-point length of the normalized body (Postgres char_length on UTF8). */
export function eligibilityBodyLength(content: string | null | undefined): number {
  return Array.from(normalizeEligibilityBody(content)).length;
}

/** Same placeholder rule as lib/kb/templates.ts substituteTitle (Templater title tag). */
const TITLE_PLACEHOLDER = /<%\s*tp\.file\.title\s*%>/g;
/** POSIX ERE equivalent for regexp_replace in SQL. */
const TITLE_PLACEHOLDER_SQL = '<%[[:space:]]*tp\\.file\\.title[[:space:]]*%>';

// ---------------------------------------------------------------------------
// Server facts
// ---------------------------------------------------------------------------

/** One kb_nodes row of the source work as read by the server (service/definer context). */
export interface EligibilityKbDocumentFact {
  id: Uuid;
  workId: Uuid | null;
  scope: 'work' | 'account_template';
  nodeType: 'folder' | 'file';
  /** Raw DB category text — validated here, unexpected values are never counted. */
  category: string;
  name: string;
  content: string | null;
  deletedAt: string | null;
}

export interface EligibilityServerFacts {
  /** The work the new branch is cut from (root, If or expand child alike). */
  sourceWorkId: Uuid;
  /** world_work_reader_visible(source) from 18-14. Only strict `true` passes. */
  readerVisible: boolean;
  /** Count of alive (deleted_at is null) chapters with is_published = true. KB 회차 folders never count. */
  publishedChapterCount: number;
  /** kb_nodes rows read by the server for the source work. */
  documents: readonly EligibilityKbDocumentFact[];
  /**
   * 02-08 canonical default-template provenance: kb_template_seed_catalog name -> content
   * (docs/Template raw seed). A work document whose normalized body equals the seed, raw or
   * with the title placeholder substituted by the document name, is an untouched default.
   */
  canonicalTemplateSeeds: Partial<Record<KbCategory, string>>;
}

const KB_CATEGORY_SET = new Set<string>(KB_CATEGORIES);

function isKbCategory(value: unknown): value is KbCategory {
  return typeof value === 'string' && KB_CATEGORY_SET.has(value);
}

function isUntouchedSeed(doc: EligibilityKbDocumentFact, category: KbCategory, seeds: EligibilityServerFacts['canonicalTemplateSeeds']): boolean {
  const seed = seeds[category];
  if (typeof seed !== 'string') return false;
  const body = normalizeEligibilityBody(doc.content);
  if (body === normalizeEligibilityBody(seed)) return true;
  const substituted = seed.replaceAll(TITLE_PLACEHOLDER, () => doc.name);
  return body === normalizeEligibilityBody(substituted);
}

/** True when a kb_nodes row counts as one qualifying setting document. */
export function isQualifyingDocument(doc: EligibilityKbDocumentFact, facts: Pick<EligibilityServerFacts, 'sourceWorkId' | 'canonicalTemplateSeeds'>): boolean {
  if (!doc || doc.scope !== 'work') return false;
  if (doc.workId !== facts.sourceWorkId) return false;
  if (doc.nodeType !== 'file') return false;
  if (doc.deletedAt !== null) return false;
  if (!isKbCategory(doc.category)) return false;
  if (eligibilityBodyLength(doc.content) < WORLD_TREE_ELIGIBILITY.minDocumentBodyChars) return false;
  if (isUntouchedSeed(doc, doc.category, facts.canonicalTemplateSeeds)) return false;
  return true;
}

export interface QualifyingDocumentCount {
  total: number;
  byCategory: Record<KbCategory, number>;
}

export function countQualifyingDocuments(facts: Pick<EligibilityServerFacts, 'sourceWorkId' | 'documents' | 'canonicalTemplateSeeds'>): QualifyingDocumentCount {
  const byCategory = Object.fromEntries(KB_CATEGORIES.map((c) => [c, 0])) as Record<KbCategory, number>;
  let total = 0;
  for (const doc of facts.documents ?? []) {
    if (!isQualifyingDocument(doc, facts)) continue;
    byCategory[doc.category as KbCategory] += 1;
    total += 1;
  }
  return { total, byCategory };
}

function zeroCategoryCounts(): Record<EligibilityCategory, number> {
  return Object.fromEntries(ELIGIBILITY_CATEGORIES.map((c) => [c, 0])) as Record<EligibilityCategory, number>;
}

function validChapterCount(n: unknown): number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/**
 * Pure rule-22 evaluation. readerVisible=false (blind/deleted/draft/no published chapter /
 * access rule — decided by the 18-14 SQL helper, not re-implemented here) short-circuits to
 * parent_not_visible with counts 0 meaning "not aggregated". Otherwise every shortfall is
 * computed independently.
 */
export function evaluateBranchEligibility(facts: EligibilityServerFacts): BranchEligibilitySummary {
  const thresholds = eligibilityThresholds();
  const publishedChapterCount = validChapterCount(facts.publishedChapterCount);
  const isPublished = publishedChapterCount >= 1;
  const readerVisible = facts.readerVisible === true && isPublished;

  if (!readerVisible) {
    return {
      eligible: false,
      isPublished,
      readerVisible: false,
      publishedChapterCount: 0,
      qualifyingDocumentCount: 0,
      categoryCounts: zeroCategoryCounts(),
      thresholds,
      unmetReasons: ['parent_not_visible'],
    };
  }

  const counted = countQualifyingDocuments(facts);
  const categoryCounts = zeroCategoryCounts();
  for (const c of ELIGIBILITY_CATEGORIES) categoryCounts[c] = counted.byCategory[c];

  const unmetReasons: EligibilityUnmetReason[] = [];
  if (publishedChapterCount < thresholds.minPublishedChapters) unmetReasons.push('published_chapters_insufficient');
  if (counted.total < thresholds.minQualifyingDocuments) unmetReasons.push('qualifying_documents_insufficient');
  for (const c of ELIGIBILITY_CATEGORIES) {
    if (categoryCounts[c] < thresholds.minCategoryDocuments[c]) unmetReasons.push(CATEGORY_REASON[c]);
  }

  return {
    eligible: unmetReasons.length === 0,
    isPublished,
    readerVisible: true,
    publishedChapterCount,
    qualifyingDocumentCount: counted.total,
    categoryCounts,
    thresholds,
    unmetReasons,
  };
}

// ---------------------------------------------------------------------------
// DB policy generation
// ---------------------------------------------------------------------------

export const ELIGIBILITY_POLICY_SQL_BEGIN =
  '-- BEGIN GENERATED world-tree eligibility policy (lib/world-tree/eligibility.ts renderEligibilityPolicySql) — do not edit by hand';
export const ELIGIBILITY_POLICY_SQL_END = '-- END GENERATED world-tree eligibility policy';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlInteger(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('invalid_eligibility_threshold');
  return String(value);
}

/**
 * Deterministic SQL for the DB-side eligibility policy, generated from WORLD_TREE_ELIGIBILITY.
 *
 * Emits three internal functions (no tables, no writes, no grants):
 *  - world_tree_eligibility_thresholds(): NO arguments, so no caller can pass or tamper with
 *    thresholds. Returns the constant values and the counted KB category keys.
 *  - world_tree_eligibility_body(text): CR removal + trim of ELIGIBILITY_TRIM_CODE_POINTS;
 *    char_length() of its result equals eligibilityBodyLength() (UTF8 code points).
 *  - world_tree_eligibility_is_untouched_seed(content, name, seed): the 02-08 provenance check
 *    against kb_template_seed_catalog (raw or title-substituted seed).
 * EXECUTE is revoked from public/anon/authenticated; 18-14's definer evaluator calls them.
 *
 * Regeneration procedure (when a threshold or rule changes):
 *  1. Change WORLD_TREE_ELIGIBILITY (or the trim set) in this file only.
 *  2. Run `renderEligibilityPolicySql()` and paste the whole block, BEGIN..END markers
 *     included, into the generated block of supabase/migrations/0033_world_tree_eligibility.sql.
 *  3. Run tests/world-tree/eligibility-policy.test.ts and 18-14's eligibility-source.test.ts
 *     (drift check between the migration block and this output).
 *  If 0033 has already been applied to a shared database, do NOT edit it: record
 *  `needs_migration_number` in the plan/SUMMARY and get a new migration number assigned
 *  instead of inventing one.
 */
export function renderEligibilityPolicySql(): string {
  const c = WORLD_TREE_ELIGIBILITY;
  const categoryPairs = ELIGIBILITY_CATEGORIES.map((k) => `${sqlLiteral(k)}, ${sqlInteger(c.categoryMinimums[k])}`).join(', ');
  const countedCategories = KB_CATEGORIES.map(sqlLiteral).join(', ');
  const trimChars = ELIGIBILITY_TRIM_CODE_POINTS.map((cp) => `chr(${sqlInteger(cp)})`).join(' || ');
  const revoke = (sig: string) => `revoke all on function ${sig} from public, anon, authenticated;`;

  return [
    ELIGIBILITY_POLICY_SQL_BEGIN,
    'create or replace function world_tree_eligibility_thresholds()',
    'returns table (',
    '  min_published_chapters integer,',
    '  min_document_body_chars integer,',
    '  min_setting_documents integer,',
    '  category_minimums jsonb,',
    '  counted_categories text[]',
    ')',
    'language sql immutable parallel safe',
    'set search_path = pg_catalog',
    'as $$',
    `  select ${sqlInteger(c.minPublishedChapters)}::integer as min_published_chapters,`,
    `         ${sqlInteger(c.minDocumentBodyChars)}::integer as min_document_body_chars,`,
    `         ${sqlInteger(c.minSettingDocuments)}::integer as min_setting_documents,`,
    `         jsonb_build_object(${categoryPairs}) as category_minimums,`,
    `         array[${countedCategories}]::text[] as counted_categories;`,
    '$$;',
    revoke('world_tree_eligibility_thresholds()'),
    '',
    'create or replace function world_tree_eligibility_body(p_content text)',
    'returns text',
    'language sql immutable parallel safe',
    'set search_path = pg_catalog',
    'as $$',
    `  select btrim(replace(coalesce(p_content, ''), chr(13), ''), ${trimChars});`,
    '$$;',
    revoke('world_tree_eligibility_body(text)'),
    '',
    'create or replace function world_tree_eligibility_is_untouched_seed(p_content text, p_name text, p_seed text)',
    'returns boolean',
    'language sql immutable parallel safe',
    'set search_path = pg_catalog',
    'as $$',
    '  select coalesce(p_seed is not null and (',
    '    public.world_tree_eligibility_body(p_content) = public.world_tree_eligibility_body(p_seed)',
    '    or public.world_tree_eligibility_body(p_content) = public.world_tree_eligibility_body(',
    `      regexp_replace(p_seed, ${sqlLiteral(TITLE_PLACEHOLDER_SQL)}, coalesce(replace(p_name, '\\', '\\\\'), ''), 'g'))`,
    '  ), false);',
    '$$;',
    revoke('world_tree_eligibility_is_untouched_seed(text, text, text)'),
    ELIGIBILITY_POLICY_SQL_END,
    '',
  ].join('\n');
}
