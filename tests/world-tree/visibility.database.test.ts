import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BROKEN_BRANCH_STUB_FIELDS,
  parseWorldTreeResponse,
  type OwnerWorldTreeProjection,
  type ReaderWorldTreeProjection,
} from '@/lib/world-tree/types';

/**
 * 18-04 reader-visibility DB suite (WTREE-06/07/10, rule 23). Real PostgreSQL, isolated schema,
 * one connection, outer rollback (nothing is committed). Opt-in: runs only with SUPABASE_DB_URL
 * under `--project db`; the live run belongs to 18-12. Not executed by 18-04.
 *
 * Covers: own-publish-state entry, private root / middle / consecutive stubs keeping published
 * children attached, stub whitelist and absence of every private identifier in the whole
 * response, private leaf exclusion, republish restore without structural writes, owner/admin full
 * view, reader preview, forged audiences, delete-with-children guard, notices, the metric
 * baseline, and (Task 2) works/chapters RLS plus the direct read RPCs on the same predicate.
 */
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0012_template_category_folders.sql',
  '0022_template_readonly_backfill.sql', '0023_template_policy_guards.sql',
  '0032_world_tree_schema.sql', '0033_world_tree_eligibility.sql', '0034_world_tree_branching.sql',
  '0035_world_tree_timeline.sql', '0036_world_tree_reader_visibility.sql'];

function migrationSql(file: string, schema: string): string {
  return readFileSync(`supabase/migrations/${file}`, 'utf8')
    .replace('create extension if not exists "pgcrypto";', '')
    .replaceAll('auth.users', `${schema}.test_users`)
    .replaceAll('search_path = public', `search_path = ${schema}, public`)
    .replaceAll('public.world_tree_eligibility_body', `${schema}.world_tree_eligibility_body`)
    .replace(/^begin;|^commit;/gm, '');
}

const writer = '14000000-0000-4000-8000-000000000001';
const otherWriter = '14000000-0000-4000-8000-000000000002';
const reader = '14000000-0000-4000-8000-000000000003';
const admin = '14000000-0000-4000-8000-000000000004';
const revokedAdmin = '14000000-0000-4000-8000-000000000005';

const W = {
  root: '24000000-0000-4000-8000-000000000001',
  mid: '24000000-0000-4000-8000-000000000002',
  child: '24000000-0000-4000-8000-000000000003',
  leaf: '24000000-0000-4000-8000-000000000004',
  solo: '24000000-0000-4000-8000-000000000005',
  draft: '24000000-0000-4000-8000-000000000006',
};
const TITLE = { root: '비밀 본작 제목', mid: '숨은 중간 제목', child: '공개 손자 작품', leaf: '미발행 잎 제목', solo: '1화 단독 작품', draft: '초안 제목' };

type Role = 'anon' | 'authenticated' | 'service_role';

describe.skipIf(!process.env.SUPABASE_DB_URL)('world-tree reader visibility (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `wtree_vis_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (text: string, params: unknown[] = []) => sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);
  const branch: Record<string, string> = {};

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await exec(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: Role = 'authenticated') {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner() {
    await exec('reset role');
    await exec("select set_config('request.jwt.claim.sub', '', false)");
  }
  async function fails(action: () => Promise<unknown>): Promise<string> {
    await exec('savepoint expected_failure');
    try {
      await action();
    } catch (e) {
      await exec('rollback to savepoint expected_failure');
      await asOwner();
      return (e as { message: string }).message;
    }
    await exec('release savepoint expected_failure');
    throw new Error('expected failure');
  }
  async function raw(workId: string, sub = '', role: Role = 'anon', preview = false): Promise<Record<string, unknown>> {
    await as(sub, role);
    const r = await scalar<Record<string, unknown>>('select get_world_tree($1, $2) as r', [workId, preview]);
    await asOwner();
    return r;
  }
  async function readerTree(workId: string, sub = '', role: Role = 'anon', preview = false) {
    const r = await raw(workId, sub, role, preview);
    const parsed = parseWorldTreeResponse(r);
    expect(parsed.status, JSON.stringify(r)).toBe('ok');
    expect((parsed as ReaderWorldTreeProjection).audience).toBe('reader');
    return { tree: parsed as ReaderWorldTreeProjection, text: JSON.stringify(r) };
  }
  async function publish(workId: string, published = true, from = 1, count = 1) {
    await asOwner();
    await exec(`insert into chapters(work_id, title, content, order_index, is_published)
      select $1, 'C' || g, '본문-' || g, g, $2 from generate_series($3::int, $3::int + $4::int - 1) g`,
    [workId, published, from, count]);
  }
  async function unpublishAll(workId: string) {
    await asOwner();
    await exec('update chapters set is_published = false where work_id = $1', [workId]);
  }
  /** Private identifiers that must never appear in a reader payload. */
  function privateFacts(...keys: (keyof typeof W)[]): string[] {
    return keys.flatMap((k) => [W[k], TITLE[k], branch[k]].filter(Boolean) as string[]);
  }
  function expectAbsent(text: string, facts: string[]) {
    for (const fact of facts) expect(text, fact).not.toContain(fact);
  }

  beforeAll(async () => {
    await exec('begin');
    await exec(`
      create schema ${schema};
      set search_path = ${schema}, public;
      create table ${schema}.test_users(id uuid primary key);
      grant usage on schema ${schema} to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant all on sequences to anon, authenticated, service_role;
      alter default privileges in schema ${schema} grant execute on functions to anon, authenticated, service_role;
    `);
    for (const file of MIGRATIONS) await exec(migrationSql(file, schema));
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });

  /**
   * Tree: root(trunk) -> mid(if) -> child(expand); root -> leaf(if). solo has no tree.
   * Every work starts unpublished; each test publishes what it needs.
   */
  beforeEach(async () => {
    await exec('savepoint fixture');
    await asOwner();
    await exec('insert into test_users(id) values ($1),($2),($3),($4),($5)', [writer, otherWriter, reader, admin, revokedAdmin]);
    await exec("update profiles set role = 'writer', pen_name = 'W' || right(id::text, 4) where id in ($1, $2, $3, $4)",
      [writer, otherWriter, admin, revokedAdmin]);
    await exec("insert into admin_users(user_id, granted_by_label, grant_reason) values ($1, 'test', 'test admin'), ($2, 'test', 'test admin')",
      [admin, revokedAdmin]);
    await exec("update admin_users set revoked_at = now(), revoked_by_label = 'test', revoke_reason = 'test' where user_id = $1", [revokedAdmin]);
    for (const key of Object.keys(W) as (keyof typeof W)[]) {
      await exec('insert into works(id, owner_id, title) values ($1, $2, $3)', [W[key], writer, TITLE[key]]);
    }
    await exec('update works set is_branch_draft = true where id = $1', [W.draft]);
    branch.root = await scalar<string>(`insert into world_branches(root_work_id, work_id, owner_id, kind, status, confirmed_at)
      values ($1, $1, $2, 'trunk', 'confirmed', now()) returning id`, [W.root, writer]);
    const child = async (work: string, parent: string, kind: 'if' | 'expand', status = 'confirmed') =>
      scalar<string>(`insert into world_branches(root_work_id, work_id, owner_id, parent_branch_id, kind, status, confirmed_at)
        values ($1, $2, $3, $4, $5, $6, case when $6 = 'confirmed' then now() end) returning id`,
      [W.root, work, writer, parent, kind, status]);
    branch.mid = await child(W.mid, branch.root, 'if');
    branch.child = await child(W.child, branch.mid, 'expand');
    branch.leaf = await child(W.leaf, branch.root, 'if');
    branch.draft = await child(W.draft, branch.root, 'if', 'draft');
    // One own era + own placement per line (eras/placements are the line's own axis).
    for (const key of ['root', 'mid', 'child', 'leaf'] as const) {
      const era = await scalar<string>(`insert into world_eras(branch_id, position, name, memo)
        values ($1, 0, $2, $3) returning id`, [branch[key], `${key}-시대`, key === 'root' ? null : `${key}-비밀메모`]);
      await exec(`insert into world_era_placements(branch_id, era_id, work_id, order_index, concurrent_with_prev)
        values ($1, $2, $3, 0, false)`, [branch[key], era, W[key]]);
    }
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  // -------------------------------------------------------------------------
  // Entry by the work's own publish state
  // -------------------------------------------------------------------------
  describe('entry', () => {
    it('shows an ordinary 1-chapter work without a tree, independent of the 50-chapter branching rule', async () => {
      await publish(W.solo);
      const { tree } = await readerTree(W.solo);
      expect(tree.header).toEqual({ title: TITLE.solo });
      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0]).toMatchObject({ nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: W.solo, kind: 'trunk' });
      expect((await readerTree(W.solo, reader)).tree.nodes).toHaveLength(1);
    });

    it('answers the same unavailable for unpublished, draft, deleted, blinded and missing ids', async () => {
      await publish(W.draft);
      await publish(W.leaf, false);
      for (const id of [W.leaf, W.draft, '24000000-0000-4000-8000-0000000000ff']) {
        expect(await raw(id)).toEqual({ status: 'unavailable' });
        expect(await raw(id, reader)).toEqual({ status: 'unavailable' });
        expect(await raw(id, otherWriter)).toEqual({ status: 'unavailable' });
      }
      await publish(W.solo);
      await exec("select moderation_set_blind($1, null, '사유')", [W.solo]);
      expect(await raw(W.solo)).toEqual({ status: 'unavailable' });
      await exec('select moderation_set_blind($1, null, null)', [W.solo]);
      await exec('update works set deleted_at = now() where id = $1', [W.solo]);
      expect(await raw(W.solo)).toEqual({ status: 'unavailable' });
    });

    it('never lists a branch draft, even a published one', async () => {
      await publish(W.root);
      await publish(W.draft);
      const { tree, text } = await readerTree(W.root);
      expect(tree.nodes.map((n) => n.nodeType)).toEqual(['work']);
      expectAbsent(text, privateFacts('draft'));
    });
  });

  // -------------------------------------------------------------------------
  // Rule 23 broken branches
  // -------------------------------------------------------------------------
  describe('broken-branch stubs', () => {
    it('keeps a published child attached under a private root stub without any root identifier', async () => {
      await publish(W.mid);
      const { tree, text } = await readerTree(W.mid);
      expect(tree.header).toEqual({ title: TITLE.mid });
      expect(tree.nodes).toEqual([
        { nodeType: 'broken', nodeKey: 'n0', parentNodeKey: null, positionHint: 0 },
        expect.objectContaining({ nodeType: 'work', nodeKey: 'n1', parentNodeKey: 'n0', workId: W.mid, kind: 'if' }),
      ]);
      expect(tree.focusNodeKey).toBe('n1');
      expectAbsent(text, [...privateFacts('root', 'leaf', 'child', 'draft'), branch.mid, writer, 'root-시대', '비밀메모']);
    });

    it('stubs a private middle parent and keeps the grandchild attached', async () => {
      await publish(W.root);
      await publish(W.child);
      const { tree, text } = await readerTree(W.child);
      expect(tree.nodes).toEqual([
        expect.objectContaining({ nodeType: 'work', nodeKey: 'n0', parentNodeKey: null, workId: W.root }),
        { nodeType: 'broken', nodeKey: 'n1', parentNodeKey: 'n0', positionHint: 1 },
        expect.objectContaining({ nodeType: 'work', nodeKey: 'n2', parentNodeKey: 'n1', workId: W.child }),
      ]);
      expect(tree.header).toEqual({ title: TITLE.child });
      expectAbsent(text, [...privateFacts('mid', 'leaf'), 'mid-시대']);
      // Same projection from the root entry.
      expect((await readerTree(W.root)).tree.nodes).toEqual(tree.nodes);
    });

    it('chains consecutive stubs (private root and middle)', async () => {
      await publish(W.child);
      const { tree, text } = await readerTree(W.child);
      expect(tree.nodes).toEqual([
        { nodeType: 'broken', nodeKey: 'n0', parentNodeKey: null, positionHint: 0 },
        { nodeType: 'broken', nodeKey: 'n1', parentNodeKey: 'n0', positionHint: 1 },
        expect.objectContaining({ nodeType: 'work', nodeKey: 'n2', parentNodeKey: 'n1', workId: W.child }),
      ]);
      expect(tree.eras.every((e) => e.nodeKey === 'n2')).toBe(true);
      expectAbsent(text, privateFacts('root', 'mid', 'leaf'));
    });

    it('returns stubs with exactly the 4 whitelisted fields', async () => {
      await publish(W.child);
      const { tree } = await readerTree(W.child);
      for (const node of tree.nodes.filter((n) => n.nodeType === 'broken')) {
        expect(Object.keys(node).sort()).toEqual([...BROKEN_BRANCH_STUB_FIELDS].sort());
      }
    });

    it('drops a private leaf and any path without a published descendant', async () => {
      await publish(W.root);
      await publish(W.leaf, false);
      const { tree, text } = await readerTree(W.root);
      expect(tree.nodes).toHaveLength(1);
      expect(tree.nodes[0]).toMatchObject({ nodeType: 'work', workId: W.root });
      expectAbsent(text, privateFacts('leaf', 'mid', 'child'));
    });

    it('treats a blinded parent as a stub (blind is not unpublish; the child stays readable)', async () => {
      await publish(W.root);
      await publish(W.mid);
      await exec("select moderation_set_blind($1, null, '본작 블라인드 사유')", [W.root]);
      const { tree, text } = await readerTree(W.mid);
      expect(tree.nodes[0]).toEqual({ nodeType: 'broken', nodeKey: 'n0', parentNodeKey: null, positionHint: 0 });
      expectAbsent(text, [...privateFacts('root'), '본작 블라인드 사유']);
    });

    it('restores the normal node on republish without writing the structure or snapshots', async () => {
      await publish(W.root);
      await publish(W.mid);
      const before = await exec('select id, parent_branch_id, depth, status, updated_at from world_branches order by id');
      await unpublishAll(W.root);
      expect((await readerTree(W.mid)).tree.nodes[0].nodeType).toBe('broken');
      await exec('update chapters set is_published = true where work_id = $1 and order_index = 1', [W.root]);
      const { tree } = await readerTree(W.mid);
      expect(tree.nodes[0]).toMatchObject({ nodeType: 'work', nodeKey: 'n0', workId: W.root, title: TITLE.root });
      expect(await exec('select id, parent_branch_id, depth, status, updated_at from world_branches order by id')).toEqual(before);
    });

    it('still refuses to delete a private parent that has a live child', async () => {
      await publish(W.mid);
      await as(writer);
      expect(await fails(() => exec('select soft_delete_world_branch($1)', [branch.root]))).toContain('world_branch_has_children');
    });
  });

  // -------------------------------------------------------------------------
  // Owner / admin full view, preview and forged audiences
  // -------------------------------------------------------------------------
  describe('audiences', () => {
    it('gives the owner the full DB ancestry including private and draft works', async () => {
      await publish(W.child);
      const r = parseWorldTreeResponse(await raw(W.child, writer)) as OwnerWorldTreeProjection;
      expect(r).toMatchObject({ status: 'ok', audience: 'owner', rootWorkId: W.root, focusWorkId: W.child });
      expect(r.branches.map((b) => b.workId).sort()).toEqual([W.root, W.mid, W.child, W.leaf, W.draft].sort());
      expect(r.branches.find((b) => b.workId === W.root)).toMatchObject({ isPublished: false, readerVisible: false, title: TITLE.root });
      expect(JSON.stringify(r)).not.toContain('본문-');
      // The owner also gets a full view of an unpublished entry.
      expect((await raw(W.root, writer)).audience).toBe('owner');
    });

    it('gives an active admin the same full view, but not a revoked or deleted admin', async () => {
      await publish(W.child);
      expect((await raw(W.child, admin)).audience).toBe('admin');
      expect((await raw(W.root, admin)).audience).toBe('admin');
      expect((await raw(W.child, revokedAdmin)).audience).toBe('reader');
      expect(await raw(W.root, revokedAdmin)).toEqual({ status: 'unavailable' });
      await exec('update profiles set deleted_at = now() where id = $1', [admin]);
      expect((await raw(W.child, admin)).audience).toBe('reader');
    });

    it('serves the reader preview from the DB projection for owner/admin only', async () => {
      await publish(W.child);
      const anon = await raw(W.child);
      expect(await raw(W.child, writer, 'authenticated', true)).toEqual(anon);
      expect(await raw(W.child, admin, 'authenticated', true)).toEqual(anon);
      expect(await raw(W.child, reader, 'authenticated', true)).toEqual({ status: 'unavailable' });
      expect(await raw(W.child, '', 'anon', true)).toEqual({ status: 'unavailable' });
      expect(await raw(W.root, writer, 'authenticated', true)).toEqual({ status: 'unavailable' });
    });

    it('ignores forged audiences: other writers and readers get the reader projection', async () => {
      await publish(W.child);
      for (const sub of [otherWriter, reader]) {
        const { tree, text } = await readerTree(W.child, sub);
        expect(tree.nodes[0].nodeType).toBe('broken');
        expectAbsent(text, privateFacts('root', 'mid'));
      }
      await as(otherWriter);
      expect(await fails(() => exec("select get_world_tree($1, false, 'owner')", [W.child]))).toContain('does not exist');
    });

    it('closes the internal projections to every API role', async () => {
      for (const role of ['anon', 'authenticated', 'service_role'] as const) {
        await as(role === 'anon' ? '' : writer, role);
        expect(await fails(() => exec('select world_tree_full_projection($1, $2)', [W.root, 'owner']))).toContain('permission denied');
        await as(role === 'anon' ? '' : writer, role);
        expect(await fails(() => exec('select world_tree_reader_projection($1)', [W.root]))).toContain('permission denied');
      }
      await as(writer, 'service_role');
      expect(await fails(() => exec('select get_world_tree($1)', [W.root]))).toContain('permission denied');
    });
  });

  // -------------------------------------------------------------------------
  // Notices and the metric baseline
  // -------------------------------------------------------------------------
  describe('notices and baseline', () => {
    it('marks a notice read for its owner only and changes nothing else', async () => {
      const notice = await scalar<string>(`insert into world_branch_notices(source_work_id, branch_id, event_key)
        values ($1, $2, 'test:1') returning id`, [W.root, branch.mid]);
      await as('', 'anon');
      expect(await fails(() => exec('select mark_branch_notice_read($1)', [notice]))).toContain('permission denied');
      await as(otherWriter);
      expect(await fails(() => exec('select mark_branch_notice_read($1)', [notice]))).toContain('world_tree_forbidden');
      await as(reader);
      expect(await fails(() => exec('select mark_branch_notice_read($1)', [notice]))).toContain('writer_required');
      await as(writer);
      await exec('select mark_branch_notice_read($1)', [notice]);
      await asOwner();
      const [row] = await exec('select source_work_id, branch_id, event_key, read_at is not null as read from world_branch_notices where id = $1', [notice]);
      expect(row).toEqual({ source_work_id: W.root, branch_id: branch.mid, event_key: 'test:1', read: true });
    });

    it('builds the global baseline from reader-visible works only and reports the cutoff', async () => {
      await publish(W.solo);
      await publish(W.leaf, false);
      await publish(W.draft);
      await exec('update chapters set view_count = 5 where work_id = $1', [W.solo]);
      await exec('update chapters set view_count = 999 where work_id in ($1, $2)', [W.leaf, W.draft]);
      await as('', 'anon');
      const b = await scalar<{ maxTotalViews: number; maxLikeCount: number; authorViewsExcludedSince: string }>(
        'select get_world_tree_metric_baseline()');
      await asOwner();
      expect(b.maxTotalViews).toBe(5);
      expect(Number.isNaN(Date.parse(b.authorViewsExcludedSince))).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Task 2: works/chapters RLS and direct read RPCs on the same predicate
  // -------------------------------------------------------------------------
  describe('public read rules', () => {
    async function selectAs(sub: string, role: Role, text: string, params: unknown[] = []) {
      await as(sub, role);
      const rows = await exec(text, params);
      await asOwner();
      return rows;
    }
    async function chapterOf(workId: string) {
      return scalar<string>('select id from chapters where work_id = $1 order by order_index limit 1', [workId]);
    }

    it('hides unpublished and draft works and their chapter ids from readers, not from the owner', async () => {
      await publish(W.leaf, false);
      await publish(W.draft);
      const draftChapter = await chapterOf(W.draft);
      for (const [sub, role] of [['', 'anon'], [reader, 'authenticated'], [otherWriter, 'authenticated']] as const) {
        expect(await selectAs(sub, role, 'select id from works where id in ($1, $2)', [W.leaf, W.draft])).toHaveLength(0);
        expect(await selectAs(sub, role, 'select id from chapters where id = $1', [draftChapter])).toHaveLength(0);
      }
      expect(await selectAs(writer, 'authenticated', 'select id from works where id in ($1, $2)', [W.leaf, W.draft])).toHaveLength(2);
    });

    it('keeps a published child of a private parent readable on every general path', async () => {
      await publish(W.mid);
      const ch = await chapterOf(W.mid);
      expect(await selectAs('', 'anon', 'select id from works where id = $1', [W.mid])).toHaveLength(1);
      expect(await selectAs('', 'anon', 'select id from chapters where id = $1', [ch])).toHaveLength(1);
      expect(await selectAs('', 'anon', 'select id from works where id = $1', [W.root])).toHaveLength(0);
      await as('', 'anon');
      expect(await scalar<boolean>('select can_view($1, $2)', [W.mid, ch])).toBe(true);
      expect(await scalar<string>('select read_chapter_content($1)', [ch])).toBe('본문-1');
      expect((await scalar<{ state: string }>('select get_chapter_access_state($1, $2)', [W.mid, ch])).state).toBe('readable');
      expect(await exec('select * from list_chapter_access($1)', [W.mid])).toHaveLength(1);
      await asOwner();
    });

    it('closes the direct RPCs for a draft work but keeps the owner correction path', async () => {
      await publish(W.draft);
      const ch = await chapterOf(W.draft);
      await as('', 'anon');
      expect(await scalar<boolean>('select can_view($1, $2)', [W.draft, ch])).toBe(false);
      expect(await scalar<string | null>('select read_chapter_content($1)', [ch])).toBeNull();
      expect(await scalar<{ state: string }>('select get_chapter_access_state($1, $2)', [W.draft, ch]))
        .toEqual({ state: 'unavailable', blind_scope: null, blind_reason: null, entitled: false });
      expect(await exec('select * from list_chapter_access($1)', [W.draft])).toHaveLength(0);
      await as(writer);
      expect(await scalar<string>('select read_chapter_content($1)', [ch])).toBe('본문-1');
      expect((await scalar<{ state: string }>('select get_chapter_access_state($1, $2)', [W.draft, ch])).state).toBe('readable');
      expect(await exec('select * from list_chapter_access($1)', [W.draft])).toHaveLength(1);
      await asOwner();
    });

    it('keeps the existing blind contract: notice metadata stays, body and purchase stay closed', async () => {
      await publish(W.solo);
      const ch = await chapterOf(W.solo);
      await exec("select moderation_set_blind($1, null, '공개 사유')", [W.solo]);
      expect(await selectAs('', 'anon', 'select admin_blinded from works where id = $1', [W.solo])).toEqual([{ admin_blinded: true }]);
      expect(await selectAs('', 'anon', 'select id from chapters where id = $1', [ch])).toHaveLength(1);
      await as('', 'anon');
      expect(await scalar<boolean>('select can_view($1, $2)', [W.solo, ch])).toBe(false);
      expect(await scalar<{ state: string; blind_scope: string }>('select get_chapter_access_state($1, $2)', [W.solo, ch]))
        .toMatchObject({ state: 'blinded', blind_scope: 'work' });
      expect((await exec('select blinded from list_chapter_access($1)', [W.solo]))[0]).toEqual({ blinded: true });
      await asOwner();
    });

    it('restores public reads after republishing and keeps paid chapters behind can_view', async () => {
      await publish(W.root);
      await unpublishAll(W.root);
      expect(await selectAs('', 'anon', 'select id from works where id = $1', [W.root])).toHaveLength(0);
      await exec('update chapters set is_published = true, price_tier = 100 where work_id = $1', [W.root]);
      expect(await selectAs('', 'anon', 'select id from works where id = $1', [W.root])).toHaveLength(1);
      const ch = await chapterOf(W.root);
      await as(reader);
      expect(await scalar<boolean>('select can_view($1, $2)', [W.root, ch])).toBe(false);
      expect((await scalar<{ state: string }>('select get_chapter_access_state($1, $2)', [W.root, ch])).state).toBe('purchase_required');
      await asOwner();
    });
  });
});
