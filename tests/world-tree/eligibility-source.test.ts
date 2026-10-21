import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ELIGIBILITY_POLICY_SQL_BEGIN,
  ELIGIBILITY_POLICY_SQL_END,
  WORLD_TREE_ELIGIBILITY,
  renderEligibilityPolicySql,
} from '@/lib/world-tree/eligibility';

/**
 * 18-14 static contract for supabase/migrations/0033_world_tree_eligibility.sql.
 * Text checks only: they prove the generated policy block has not drifted from
 * lib/world-tree/eligibility.ts and that grants / check order / response shape are as agreed.
 * They are NOT runtime proof — eligibility.database.test.ts (run by 18-12) is.
 */
const MIGRATION = 'supabase/migrations/0033_world_tree_eligibility.sql';

function source(): string {
  return readFileSync(MIGRATION, 'utf8').replaceAll('\r\n', '\n');
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

/** Body of `create or replace function <name>(` up to the next `$$;`. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function ${name}(`);
  if (start < 0) throw new Error(`function ${name} not found`);
  const end = sql.indexOf('$$;', start);
  if (end < 0) throw new Error(`function ${name} not terminated`);
  return sql.slice(start, end + 3);
}

function outsideGenerated(sql: string): string {
  const begin = sql.indexOf(ELIGIBILITY_POLICY_SQL_BEGIN);
  const end = sql.indexOf(ELIGIBILITY_POLICY_SQL_END);
  return sql.slice(0, begin) + sql.slice(end + ELIGIBILITY_POLICY_SQL_END.length);
}

describe('0033 world-tree eligibility migration (static contract)', () => {
  it('exists as the next migration after 0032', () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync('supabase/migrations/0032_world_tree_schema.sql')).toBe(true);
  });

  describe('generated policy block (drift check against 18-13)', () => {
    it('contains exactly one BEGIN/END marker pair', () => {
      const sql = source();
      expect(sql.split(ELIGIBILITY_POLICY_SQL_BEGIN)).toHaveLength(2);
      expect(sql.split(ELIGIBILITY_POLICY_SQL_END)).toHaveLength(2);
      expect(sql.indexOf(ELIGIBILITY_POLICY_SQL_BEGIN)).toBeLessThan(sql.indexOf(ELIGIBILITY_POLICY_SQL_END));
    });

    it('matches renderEligibilityPolicySql() byte for byte', () => {
      const sql = source();
      const begin = sql.indexOf(ELIGIBILITY_POLICY_SQL_BEGIN);
      const end = sql.indexOf(ELIGIBILITY_POLICY_SQL_END) + ELIGIBILITY_POLICY_SQL_END.length;
      expect(sql.slice(begin, end)).toBe(renderEligibilityPolicySql().trimEnd());
    });

    it('carries the current threshold values only inside the generated block', () => {
      const sql = source();
      const block = sql.slice(sql.indexOf(ELIGIBILITY_POLICY_SQL_BEGIN), sql.indexOf(ELIGIBILITY_POLICY_SQL_END));
      expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minPublishedChapters}::integer as min_published_chapters`);
      expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minDocumentBodyChars}::integer as min_document_body_chars`);
      expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minSettingDocuments}::integer as min_setting_documents`);

      // Hand-written SQL must read thresholds from world_tree_eligibility_thresholds(), never
      // repeat the numbers.
      const handWritten = stripComments(outsideGenerated(sql));
      const numbers = new Set([
        WORLD_TREE_ELIGIBILITY.minPublishedChapters,
        WORLD_TREE_ELIGIBILITY.minDocumentBodyChars,
        WORLD_TREE_ELIGIBILITY.minSettingDocuments,
        ...Object.values(WORLD_TREE_ELIGIBILITY.categoryMinimums),
      ]);
      for (const n of numbers) {
        expect(handWritten, `literal ${n} outside the generated block`).not.toMatch(new RegExp(`(?<![\\w.])${n}(?![\\w.])`));
      }
    });

    it('keeps the thresholds function argument-free', () => {
      expect(source()).not.toMatch(/world_tree_eligibility_thresholds\(\s*[^)\s]/);
    });
  });

  describe('world_work_reader_visible(uuid)', () => {
    const body = () => functionBody(source(), 'world_work_reader_visible');

    it('is a stable SECURITY DEFINER boolean with search_path = public', () => {
      expect(body()).toMatch(/world_work_reader_visible\(p_work_id uuid\)\s*returns boolean/);
      expect(body()).toMatch(/language sql stable security definer set search_path = public as/);
    });

    it('checks only the work itself: deletion, branch draft, admin blind and a live published chapter', () => {
      const b = body();
      expect(b).toContain('w.deleted_at is null');
      expect(b).toContain('not w.is_branch_draft');
      expect(b).toContain('not w.admin_blinded');
      expect(b).toMatch(/c\.is_published and c\.deleted_at is null/);
      expect(b).toMatch(/coalesce\(/); // missing work -> false, never null
    });

    it('is non-recursive and has no owner/admin/eligibility exceptions', () => {
      const b = stripComments(body());
      for (const forbidden of ['can_view', 'read_chapter_content', 'list_chapter_access', 'get_chapter_access_state',
        'world_tree_', 'get_world_', 'auth.uid', 'owner_id', 'role', 'kb_nodes', 'price_tier', 'entitle', 'parent']) {
        expect(b, forbidden).not.toContain(forbidden);
      }
    });

    it('revokes PUBLIC and grants anon/authenticated/service_role explicitly', () => {
      const sql = source();
      expect(sql).toMatch(/revoke all on function world_work_reader_visible\(uuid\) from public;/);
      expect(sql).toMatch(/grant execute on function world_work_reader_visible\(uuid\) to anon, authenticated, service_role;/);
    });
  });

  describe('single evaluator (world_tree_evaluate_branch_eligibility)', () => {
    const body = () => stripComments(functionBody(source(), 'world_tree_evaluate_branch_eligibility'));

    it('takes only the source work and a lock flag (no client counts/thresholds)', () => {
      expect(body()).toMatch(/world_tree_evaluate_branch_eligibility\(p_source_work_id uuid, p_lock boolean\)\s*returns jsonb/);
    });

    it('checks auth -> active writer -> ownership -> reader visibility before any count', () => {
      const b = body();
      const auth = b.indexOf("raise exception 'authentication_required'");
      const writer = b.indexOf("raise exception 'writer_required'");
      const owner = b.indexOf("raise exception 'world_tree_forbidden'");
      const visible = b.indexOf('world_work_reader_visible(p_source_work_id)');
      const chapterCount = b.indexOf('count(*)');
      const kb = b.indexOf('from kb_nodes');
      for (const idx of [auth, writer, owner, visible, chapterCount, kb]) expect(idx).toBeGreaterThan(0);
      expect(auth).toBeLessThan(writer);
      expect(writer).toBeLessThan(owner);
      expect(owner).toBeLessThan(visible);
      expect(visible).toBeLessThan(chapterCount);
      expect(visible).toBeLessThan(kb);
    });

    it('returns parent_not_visible with zero (not aggregated) counts before counting', () => {
      const b = body();
      const visible = b.indexOf('world_work_reader_visible(p_source_work_id)');
      const shortCircuit = b.indexOf("'parent_not_visible'");
      expect(shortCircuit).toBeGreaterThan(visible);
      expect(shortCircuit).toBeLessThan(b.indexOf('count(*)'));
      expect(b).toMatch(/'readerVisible', false/);
    });

    it('reads thresholds and body rules only from the generated helpers', () => {
      const b = body();
      expect(b).toContain('from world_tree_eligibility_thresholds()');
      expect(b).toContain('world_tree_eligibility_body(n.content)');
      expect(b).toContain('world_tree_eligibility_is_untouched_seed(n.content, n.name, s.content)');
      expect(b).toContain('kb_template_seed_catalog');
      expect(b).toMatch(/n\.scope = 'work'/);
      expect(b).toMatch(/n\.work_id = p_source_work_id/);
      expect(b).toMatch(/n\.node_type = 'file'/);
      expect(b).toMatch(/n\.deleted_at is null/);
      expect(b).toMatch(/n\.category = any\(/);
    });

    it('locks source work -> chapters -> KB in that order only in lock mode', () => {
      const b = body();
      const work = b.indexOf('for share of w');
      const chapters = b.search(/from chapters c[^;]*order by c\.id for share/);
      const kb = b.search(/from kb_nodes n[^;]*order by n\.id for share/);
      expect(work).toBeGreaterThan(0);
      expect(chapters).toBeGreaterThan(work);
      expect(kb).toBeGreaterThan(chapters);
      expect(b).toMatch(/if p_lock then/);
    });

    it('emits only the BranchEligibilitySummary fields (no body/name/source refs/blind reason)', () => {
      const b = body();
      for (const key of ['eligible', 'isPublished', 'readerVisible', 'publishedChapterCount', 'qualifyingDocumentCount',
        'categoryCounts', 'thresholds', 'unmetReasons', 'minPublishedChapters', 'minDocumentChars',
        'minQualifyingDocuments', 'minCategoryDocuments']) {
        expect(b).toContain(`'${key}'`);
      }
      for (const leaked of ["'content'", "'name'", "'title'", "'body'", "'sourceRefs'", 'admin_blind_reason', "'nodeId'"]) {
        expect(b).not.toContain(leaked);
      }
    });

    it('keeps the unmet reason codes of the 18-01 contract', () => {
      const b = body();
      for (const reason of ['published_chapters_insufficient', 'qualifying_documents_insufficient',
        'character_documents_insufficient', 'place_documents_insufficient', 'event_documents_insufficient']) {
        expect(b).toContain(`'${reason}'`);
      }
    });

    it('is internal: no EXECUTE for any API role', () => {
      const sql = source();
      expect(sql).toMatch(/revoke all on function world_tree_evaluate_branch_eligibility\(uuid, boolean\) from public, anon, authenticated, service_role;/);
      expect(sql).not.toMatch(/grant execute on function world_tree_evaluate_branch_eligibility/);
    });
  });

  describe('get_world_branch_eligibility (owner-only lookup)', () => {
    it('delegates to the shared evaluator without locks and takes no client facts', () => {
      const b = stripComments(functionBody(source(), 'get_world_branch_eligibility'));
      expect(b).toMatch(/get_world_branch_eligibility\(p_source_work_id uuid\)\s*returns jsonb/);
      expect(b).toMatch(/security definer set search_path = public/);
      expect(b).toContain('world_tree_evaluate_branch_eligibility(p_source_work_id, false)');
      expect(b).not.toContain('from kb_nodes');
      expect(b).not.toContain('from chapters');
    });

    it('revokes PUBLIC/anon and grants authenticated only', () => {
      const sql = source();
      expect(sql).toMatch(/revoke all on function get_world_branch_eligibility\(uuid\) from public, anon, service_role;/);
      expect(sql).toMatch(/grant execute on function get_world_branch_eligibility\(uuid\) to authenticated;/);
      expect(sql).not.toMatch(/grant execute on function get_world_branch_eligibility\(uuid\) to [^;]*anon/);
    });
  });

  describe('world_tree_assert_branch_eligible (internal guard for 18-02)', () => {
    it('uses the same evaluator in lock mode and raises branch_ineligible with unmetReasons DETAIL', () => {
      const b = stripComments(functionBody(source(), 'world_tree_assert_branch_eligible'));
      expect(b).toMatch(/world_tree_assert_branch_eligible\(p_source_work_id uuid\)\s*returns void/);
      expect(b).toContain('world_tree_evaluate_branch_eligibility(p_source_work_id, true)');
      expect(b).toMatch(/raise exception 'branch_ineligible'\s+using detail = jsonb_build_object\('unmetReasons', v_summary -> 'unmetReasons'\)::text/);
      expect(b).not.toContain('from kb_nodes');
    });

    it('has no caller EXECUTE grant', () => {
      const sql = source();
      expect(sql).toMatch(/revoke all on function world_tree_assert_branch_eligible\(uuid\) from public, anon, authenticated, service_role;/);
      expect(sql).not.toMatch(/grant execute on function world_tree_assert_branch_eligible/);
    });
  });

  describe('generated helpers stay internal', () => {
    it('also closes service_role on the generated policy functions', () => {
      const sql = outsideGenerated(source());
      for (const sig of ['world_tree_eligibility_thresholds()', 'world_tree_eligibility_body(text)',
        'world_tree_eligibility_is_untouched_seed(text, text, text)']) {
        expect(sql).toContain(`revoke all on function ${sig} from service_role;`);
        expect(source()).not.toContain(`grant execute on function ${sig}`);
      }
    });
  });

  describe('DB suite presence (run by 18-12, not here)', () => {
    const DB_SUITE = 'tests/world-tree/eligibility.database.test.ts';

    it('exists as an opt-in suite that applies 0032 and 0033 in an isolated schema', () => {
      expect(existsSync(DB_SUITE)).toBe(true);
      const suite = readFileSync(DB_SUITE, 'utf8');
      // Split literal: vitest.config.ts routes any file containing the env name to the db project.
      expect(suite).toContain(`describe.skipIf(!process.env.${'SUPABASE_'}DB_URL)`);
      expect(suite).toContain("'0032_world_tree_schema.sql'");
      expect(suite).toContain("'0033_world_tree_eligibility.sql'");
      expect(suite).toMatch(/exec\('rollback'\)/);
    });

    it('covers the blinded-parent rejection, assert DETAIL, unblind recovery and owner-only access', () => {
      const suite = readFileSync(DB_SUITE, 'utf8');
      for (const needle of ["unmetReasons: ['parent_not_visible']", "'branch_ineligible'", 'blindWork(work, null)',
        "'world_tree_forbidden'", "'writer_required'", "'permission denied'", 'kb_template_seed_catalog',
        'get_world_branch_eligibility($1, 0)']) {
        expect(suite).toContain(needle);
      }
    });
  });

  describe('scope boundary', () => {
    it('defines no branch RPC, KB trigger or reader projection (0034/0036 own them)', () => {
      const sql = stripComments(outsideGenerated(source()));
      const defined = [...sql.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]).sort();
      expect(defined).toEqual([
        'get_world_branch_eligibility',
        'world_tree_assert_branch_eligible',
        'world_tree_evaluate_branch_eligibility',
        'world_work_reader_visible',
      ]);
      expect(sql).not.toMatch(/create (or replace )?trigger|create policy|alter table|create table/i);
    });
  });
});
