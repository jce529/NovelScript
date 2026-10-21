import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WORLD_TREE_ELIGIBILITY } from '@/lib/world-tree/eligibility';
import { parseBranchEligibilitySummary, type BranchEligibilitySummary } from '@/lib/world-tree/types';

/**
 * 18-14 eligibility DB suite (WTREE-03/04/07). Real PostgreSQL, isolated schema, outer rollback
 * (same pattern as tests/admin/blinding.database.test.ts). Opt-in: runs only with
 * SUPABASE_DB_URL under `--project db`; the live run belongs to 18-12.
 *
 * Out of scope here (18-02 branching.database owns them): real begin / first confirm rejecting a
 * blinded parent, eligibility dropping between check and confirm, races and idempotency.
 */
describe.skipIf(!process.env.SUPABASE_DB_URL)('world-tree eligibility (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `wtree_elig_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '11000000-0000-4000-8000-000000000001';
  const otherWriter = '11000000-0000-4000-8000-000000000002';
  const reader = '11000000-0000-4000-8000-000000000003';
  const admin = '11000000-0000-4000-8000-000000000004';
  const work = '21000000-0000-4000-8000-000000000001';
  const sibling = '21000000-0000-4000-8000-000000000002';
  const child = '21000000-0000-4000-8000-000000000003';

  const T = WORLD_TREE_ELIGIBILITY;
  const CHARS = T.minDocumentBodyChars;

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner(sub = '') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [sub]);
  }
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }
  async function eligibility(workId = work, user = writer): Promise<BranchEligibilitySummary> {
    await as(user);
    const raw = await scalar<unknown>('select get_world_branch_eligibility($1)', [workId]);
    await asOwner();
    const parsed = parseBranchEligibilitySummary(raw);
    expect(parsed, JSON.stringify(raw)).not.toBeNull();
    return parsed!;
  }
  async function visible(workId = work, user = '', role: 'anon' | 'authenticated' = 'anon') {
    await as(user, role);
    const v = await scalar<boolean>('select world_work_reader_visible($1)', [workId]);
    await asOwner();
    return v;
  }
  /** Internal assert through the isolated superuser path (no production test grant). */
  async function assertError(workId = work, sub = writer): Promise<{ message: string; detail: unknown } | null> {
    await asOwner(sub);
    await exec('savepoint assert_call');
    try {
      await query('select world_tree_assert_branch_eligible($1)', [workId]);
      await exec('release savepoint assert_call');
      return null;
    } catch (e) {
      await exec('rollback to savepoint assert_call');
      const err = e as { message: string; detail?: string };
      return { message: err.message, detail: err.detail ? JSON.parse(err.detail) : null };
    } finally {
      await asOwner();
    }
  }

  async function addChapters(workId: string, count: number, published = true, from = 0) {
    await asOwner();
    await query(`insert into chapters(work_id, title, content, order_index, is_published)
      select $1, 'C' || g, '', g, $3 from generate_series($4::int, $4::int + $2::int - 1) g`,
    [workId, count, published, from]);
  }
  async function addDocs(workId: string, category: string, count: number, content: string, tag = 'd') {
    await asOwner();
    await query(`insert into kb_nodes(owner_id, work_id, scope, node_type, category, name, content)
      select w.owner_id, w.id, 'work', 'file', $2, $2 || '-' || $4 || '-' || g, $3
        from works w, generate_series(1, $5::int) g where w.id = $1`,
    [workId, category, content, tag, count]);
  }
  const body = (n = CHARS) => '가'.repeat(n);
  /** Exactly the thresholds: 50 chapters, 인물5/장소3/사건3 + 세력 fill to 20 docs. */
  async function fullFacts(workId = work) {
    await addChapters(workId, T.minPublishedChapters);
    const m = T.categoryMinimums;
    await addDocs(workId, '인물', m.인물, body());
    await addDocs(workId, '장소', m.장소, body());
    await addDocs(workId, '사건', m.사건, body());
    await addDocs(workId, '세력', T.minSettingDocuments - m.인물 - m.장소 - m.사건, body());
  }
  async function blindWork(workId: string, reason: string | null = '검토 사유') {
    await asOwner();
    await query('select moderation_set_blind($1, null, $2)', [workId, reason]);
  }

  beforeAll(async () => {
    await exec(`
      begin;
      create schema ${schema};
      set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;
    `);
    for (const migration of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
      '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
      '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0022_template_readonly_backfill.sql',
      '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql']) {
      await exec(readFileSync(`supabase/migrations/${migration}`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        // Generated 18-13 block qualifies its helper as public.*; point it at the isolated schema.
        .replaceAll('public.world_tree_eligibility_body', `${schema}.world_tree_eligibility_body`)
        .replace(/^begin;|^commit;/gm, ''));
    }
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3),($4)', [writer, otherWriter, reader, admin]);
    await query("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2, $3)",
      [writer, otherWriter, admin]);
    await query(`insert into admin_users(user_id, granted_by_label, grant_reason) values ($1, 'test', 'test admin')`, [admin]);
    await query(`insert into works(id, owner_id, title) values ($1, $4, 'Root'), ($2, $4, 'Sibling'), ($3, $4, 'Child')`,
      [work, sibling, child, writer]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  // -------------------------------------------------------------------------
  // Reader-visibility helper
  // -------------------------------------------------------------------------
  describe('world_work_reader_visible', () => {
    it('is true for an ordinary work with one live published chapter, while eligibility stays false', async () => {
      await addChapters(work, 1);
      expect(await visible()).toBe(true);
      expect(await visible(work, reader, 'authenticated')).toBe(true);
      const s = await eligibility();
      expect(s).toMatchObject({ eligible: false, isPublished: true, readerVisible: true, publishedChapterCount: 1 });
      expect(s.unmetReasons).toEqual([
        'published_chapters_insufficient', 'qualifying_documents_insufficient',
        'character_documents_insufficient', 'place_documents_insufficient', 'event_documents_insufficient',
      ]);
    });

    it('is false for a missing work, a null id, an unpublished work and a work whose chapters are deleted', async () => {
      expect(await visible('21000000-0000-4000-8000-0000000000ff')).toBe(false);
      await as('', 'anon');
      expect(await scalar<boolean>('select world_work_reader_visible(null)')).toBe(false);
      await addChapters(work, 3, false);
      expect(await visible()).toBe(false);
      await addChapters(work, 1, true, 10);
      expect(await visible()).toBe(true);
      await query('update chapters set deleted_at = now() where work_id = $1 and is_published', [work]);
      expect(await visible()).toBe(false);
    });

    it('is false for a deleted work, a branch draft and a work-wide blind, and recovers on unblind', async () => {
      await addChapters(work, 1);
      await blindWork(work);
      expect(await visible()).toBe(false);
      await blindWork(work, null);
      expect(await visible()).toBe(true);
      await query('update works set is_branch_draft = true where id = $1', [work]);
      expect(await visible()).toBe(false);
      await query('update works set is_branch_draft = false, deleted_at = now() where id = $1', [work]);
      expect(await visible()).toBe(false);
    });

    it('gives the owner and an admin no exception', async () => {
      await addChapters(work, 1);
      await blindWork(work);
      expect(await visible(work, writer, 'authenticated')).toBe(false);
      expect(await visible(work, admin, 'authenticated')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Blinded / hidden parents (parent_not_visible precedes every count)
  // -------------------------------------------------------------------------
  describe('parent_not_visible', () => {
    const notVisible = (isPublished: boolean) => ({
      eligible: false, isPublished, readerVisible: false, publishedChapterCount: 0, qualifyingDocumentCount: 0,
      categoryCounts: { 인물: 0, 장소: 0, 사건: 0 }, unmetReasons: ['parent_not_visible'],
    });

    it('rejects a blinded parent that meets every threshold, skips counting, and recovers on unblind', async () => {
      await fullFacts();
      expect((await eligibility()).eligible).toBe(true);
      expect(await assertError()).toBeNull();

      await blindWork(work);
      expect(await visible()).toBe(false);
      expect(await eligibility()).toMatchObject(notVisible(true));
      expect(await assertError()).toEqual({ message: 'branch_ineligible', detail: { unmetReasons: ['parent_not_visible'] } });

      await blindWork(work, null);
      const s = await eligibility();
      expect(s).toMatchObject({ eligible: true, readerVisible: true, publishedChapterCount: T.minPublishedChapters,
        qualifyingDocumentCount: T.minSettingDocuments });
      expect(s.unmetReasons).toEqual([]);
    });

    it('rejects branch drafts, unpublished and deleted-chapter parents even with full documents', async () => {
      await fullFacts();
      await query('update works set is_branch_draft = true where id = $1', [work]);
      expect(await eligibility()).toMatchObject(notVisible(true));
      await query('update works set is_branch_draft = false where id = $1', [work]);
      await query('update chapters set is_published = false where work_id = $1', [work]);
      expect(await eligibility()).toMatchObject(notVisible(false));
      expect((await assertError())?.detail).toEqual({ unmetReasons: ['parent_not_visible'] });
    });

    it('rejects a deleted parent for its owner (owner full view is no bypass)', async () => {
      await fullFacts();
      await query('update works set deleted_at = now() where id = $1', [work]);
      expect(await eligibility()).toMatchObject(notVisible(true));
    });

    it('does not propagate a parent blind to an already confirmed child, which uses the same evaluator', async () => {
      await fullFacts(work);
      await fullFacts(child);
      await asOwner();
      const trunk = await scalar<string>(`insert into world_branches(root_work_id, work_id, owner_id, kind, status, confirmed_at)
        values ($1, $1, $2, 'trunk', 'confirmed', now()) returning id`, [work, writer]);
      await query(`insert into world_branches(root_work_id, work_id, owner_id, parent_branch_id, kind, status, confirmed_at)
        values ($1, $2, $3, $4, 'if', 'confirmed', now())`, [work, child, writer, trunk]);

      await blindWork(work);
      expect((await eligibility(work)).unmetReasons).toEqual(['parent_not_visible']);
      const c = await eligibility(child);
      expect(c.eligible).toBe(true);
      expect(await assertError(child)).toBeNull();

      await query('update chapters set deleted_at = now() where work_id = $1 and order_index = 0', [child]);
      const c2 = await eligibility(child);
      expect(c2.unmetReasons).toEqual(['published_chapters_insufficient']);
      expect(await assertError(child)).toEqual({ message: 'branch_ineligible', detail: { unmetReasons: ['published_chapters_insufficient'] } });
    });
  });

  // -------------------------------------------------------------------------
  // Boundary values
  // -------------------------------------------------------------------------
  describe('boundaries', () => {
    it('49 vs 50 published chapters (unpublished and deleted chapters never count)', async () => {
      await fullFacts();
      await query('update chapters set deleted_at = now() where work_id = $1 and order_index = 0', [work]);
      await addChapters(work, 5, false, 100);
      let s = await eligibility();
      expect(s.publishedChapterCount).toBe(T.minPublishedChapters - 1);
      expect(s.unmetReasons).toEqual(['published_chapters_insufficient']);
      await addChapters(work, 1, true, 200);
      s = await eligibility();
      expect(s.publishedChapterCount).toBe(T.minPublishedChapters);
      expect(s.eligible).toBe(true);
    });

    it('19 vs 20 qualifying documents (세력/아이템 count toward the total only)', async () => {
      await fullFacts();
      await query(`update kb_nodes set deleted_at = now() where id = (
        select id from kb_nodes where work_id = $1 and category = '세력' and node_type = 'file' limit 1)`, [work]);
      let s = await eligibility();
      expect(s.qualifyingDocumentCount).toBe(T.minSettingDocuments - 1);
      expect(s.unmetReasons).toEqual(['qualifying_documents_insufficient']);
      await addDocs(work, '아이템', 1, body(), 'item');
      s = await eligibility();
      expect(s.qualifyingDocumentCount).toBe(T.minSettingDocuments);
      expect(s.eligible).toBe(true);
    });

    it.each([
      ['인물', 'character_documents_insufficient'],
      ['장소', 'place_documents_insufficient'],
      ['사건', 'event_documents_insufficient'],
    ] as const)('category %s one short fails on its own even when the total is enough', async (category, reason) => {
      await fullFacts();
      await addDocs(work, '아이템', 5, body(), 'extra');
      await query(`update kb_nodes set deleted_at = now() where id = (
        select id from kb_nodes where work_id = $1 and category = $2 and node_type = 'file' and deleted_at is null limit 1)`,
      [work, category]);
      const s = await eligibility();
      expect(s.qualifyingDocumentCount).toBeGreaterThanOrEqual(T.minSettingDocuments);
      expect(s.categoryCounts[category]).toBe(T.categoryMinimums[category] - 1);
      expect(s.unmetReasons).toEqual([reason]);
      await addDocs(work, category, 1, body(), 'fix');
      expect((await eligibility()).eligible).toBe(true);
    });

    it('199 vs 200 characters, empty / null / whitespace-only bodies and trim set', async () => {
      await addChapters(work, T.minPublishedChapters);
      await addDocs(work, '인물', 1, body(CHARS - 1), 'short');
      await addDocs(work, '인물', 1, body(CHARS), 'exact');
      await addDocs(work, '인물', 1, '', 'empty');
      await asOwner();
      await query(`insert into kb_nodes(owner_id, work_id, scope, node_type, category, name, content)
        values ($1, $2, 'work', 'file', '인물', '인물-null', null)`, [writer, work]);
      // Padding from the shared trim set never counts; CR is removed everywhere.
      const pad = ' \t\n\u000b\u000c 　﻿';
      await addDocs(work, '인물', 1, pad + body(CHARS - 1) + pad, 'padded');
      await addDocs(work, '인물', 1, pad.repeat(40), 'blank');
      await addDocs(work, '인물', 1, '가\r'.repeat(CHARS - 1) + '\r', 'cr');
      // Inner whitespace is content.
      await addDocs(work, '인물', 1, body(CHARS - 1) + ' 가', 'inner');
      const s = await eligibility();
      expect(s.categoryCounts.인물).toBe(2); // exact + inner
    });

    it('counts Unicode code points (surrogate pairs = 1 char), like Array.from in TS', async () => {
      await addChapters(work, 1);
      await addDocs(work, '장소', 1, body(CHARS - 1) + '😀', 'emoji'); // 200 code points, JS length 201
      await addDocs(work, '장소', 1, '😀'.repeat(CHARS - 1), 'emoji-short'); // 199 code points, JS length 398
      await addDocs(work, '장소', 1, 'é'.repeat(CHARS / 2), 'combining'); // 200 code points
      const s = await eligibility();
      expect(s.categoryCounts.장소).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Document exclusions
  // -------------------------------------------------------------------------
  describe('document exclusions', () => {
    it('ignores deleted docs, other works, account-shared docs, folders and non-setting categories', async () => {
      await addChapters(work, 1);
      await addDocs(work, '사건', 1, body(), 'deleted');
      await asOwner();
      await query("update kb_nodes set deleted_at = now() where work_id = $1 and name like '사건-deleted-%'", [work]);
      await addDocs(sibling, '사건', 3, body(), 'sibling');
      await query(`insert into kb_nodes(owner_id, work_id, scope, node_type, category, name, content)
        values ($1, null, 'account_template', 'file', '사건', '공유-사건', $2),
               ($1, $3, 'work', 'folder', '사건', '사건-폴더', $2),
               ($1, $3, 'work', 'folder', '회차', '회차-폴더', $2),
               ($1, $3, 'work', 'file', 'template', '사건-템플릿', $2),
               ($1, $3, 'work', 'file', 'custom', '커스텀', $2)`, [writer, body(), work]);
      const s = await eligibility();
      expect(s.qualifyingDocumentCount).toBe(0);
      expect(s.categoryCounts).toEqual({ 인물: 0, 장소: 0, 사건: 0 });
    });

    it('excludes untouched default seeds, raw or title-substituted, but counts an edited copy', async () => {
      await addChapters(work, 1);
      await asOwner();
      const seed = await scalar<string>("select content from kb_template_seed_catalog where name = '인물'");
      expect(Array.from(seed.trim()).length).toBeGreaterThanOrEqual(CHARS); // otherwise the length rule alone would exclude it
      await query(`insert into kb_nodes(owner_id, work_id, scope, node_type, category, name, content)
        values ($1, $2, 'work', 'file', '인물', '원본-그대로', $3),
               ($1, $2, 'work', 'file', '인물', '홍길동', regexp_replace($3, '<%\\s*tp\\.file\\.title\\s*%>', '홍길동', 'g')),
               ($1, $2, 'work', 'file', '인물', '김철수', replace(regexp_replace($3, '<%\\s*tp\\.file\\.title\\s*%>', '김철수', 'g'), chr(10), chr(13) || chr(10))),
               ($1, $2, 'work', 'file', '인물', '수정본', $3 || chr(10) || '직접 쓴 설정')`,
      [writer, work, seed]);
      const s = await eligibility();
      expect(s.categoryCounts.인물).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Access and response shape
  // -------------------------------------------------------------------------
  describe('access and response', () => {
    it('rejects anon, readers, other writers and admins instead of returning an ineligible summary', async () => {
      await fullFacts();
      await as('', 'anon');
      await rejected(() => query('select get_world_branch_eligibility($1)', [work]), 'permission denied');
      await as(reader);
      await rejected(() => query('select get_world_branch_eligibility($1)', [work]), 'writer_required');
      await as(otherWriter);
      await rejected(() => query('select get_world_branch_eligibility($1)', [work]), 'world_tree_forbidden');
      await as(admin);
      await rejected(() => query('select get_world_branch_eligibility($1)', [work]), 'world_tree_forbidden');
      await as(writer);
      await rejected(() => query('select get_world_branch_eligibility($1)', ['21000000-0000-4000-8000-0000000000ff']),
        'world_tree_forbidden');
      await asOwner();
      expect((await assertError(work, otherWriter))?.message).toBe('world_tree_forbidden');
      expect((await assertError(work, ''))?.message).toBe('authentication_required');
    });

    it('exposes no internal function and accepts no client thresholds or counts', async () => {
      for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await as(role === 'anon' ? '' : writer, role);
        await rejected(() => query('select world_tree_assert_branch_eligible($1)', [work]), 'permission denied');
        await rejected(() => query('select world_tree_evaluate_branch_eligibility($1, false)', [work]), 'permission denied');
        await rejected(() => query('select * from world_tree_eligibility_thresholds()'), 'permission denied');
        await rejected(() => query("select world_tree_eligibility_body('x')"), 'permission denied');
      }
      await as(writer);
      await rejected(() => query('select get_world_branch_eligibility($1, 0)', [work]), 'does not exist');
      await rejected(() => query("select get_world_branch_eligibility($1, '{\"minPublishedChapters\":0}'::jsonb)", [work]),
        'does not exist');
      await asOwner();
    });

    it('returns only summary fields with server thresholds, never bodies or document names', async () => {
      await fullFacts();
      await asOwner();
      await query(`update kb_nodes set name = '비밀-이름', content = $2 where id = (
        select id from kb_nodes where work_id = $1 and category = '인물' and node_type = 'file' limit 1)`,
      [work, '비밀본문'.repeat(60)]);
      await blindWork(work, '관리자-사유');
      for (const summary of [await eligibility()]) {
        const text = JSON.stringify(summary);
        expect(text).not.toContain('비밀');
        expect(text).not.toContain('관리자-사유');
      }
      await blindWork(work, null);
      const s = await eligibility();
      expect(Object.keys(s).sort()).toEqual(['categoryCounts', 'eligible', 'isPublished', 'publishedChapterCount',
        'qualifyingDocumentCount', 'readerVisible', 'thresholds', 'unmetReasons']);
      expect(s.thresholds).toEqual({
        minPublishedChapters: T.minPublishedChapters,
        minDocumentChars: T.minDocumentBodyChars,
        minQualifyingDocuments: T.minSettingDocuments,
        minCategoryDocuments: { ...T.categoryMinimums },
      });
      const text = JSON.stringify(s);
      expect(text).not.toContain('비밀');
      expect(text).not.toContain(work);
    });
  });
});
