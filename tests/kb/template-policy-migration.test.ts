import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pgPool, createTestUser, deleteTestUser, signedInClient } from '../helpers/db';
import { readCanonicalSeed, KB_CATEGORIES } from '../../lib/kb/templates';

/**
 * Reopen D-10 real-DB migration suite (0022_template_readonly_backfill → 0023_template_policy_guards → re-run).
 *
 * DESTRUCTIVE TO SCHEMA STATE: to build pre-0022 fixtures it temporarily removes the 0023 guard/index and
 * re-applies historical migrations (0004, 0012). It therefore runs ONLY against a dedicated disposable
 * Supabase project, never the shared one. Opt in explicitly:
 *
 *   TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF=<ref of NEXT_PUBLIC_SUPABASE_URL>
 *
 * The ref must equal the project ref in NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co); a mismatch
 * fails loudly. Without the variable the suite is skipped. The last step re-applies 0022/0023 and checks
 * the latest policy is restored. Executed by plan 02-13 (`npx vitest run --project db ...`).
 */
const optInRef = process.env.TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF?.trim();
const projectRef = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0]; } catch { return ''; }
})();

const migration = (name: string) =>
  readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf-8');

describe.skipIf(!optInRef)('template policy migration on a disposable DB (0022 → 0023 → re-run)', () => {
  const sql = pgPool(5);
  const users: string[] = [];
  let owner: { id: string; email?: string };
  let workId: string;
  let workRootId: string;
  let accountRootId: string;
  const ids: Record<string, string> = {};

  async function applyMigration(sqlText: string) {
    const conn = await sql.reserve();
    try { await conn.unsafe(sqlText); } finally { conn.release(); }
  }
  const folderOf = async (rootId: string, name: string) =>
    (await sql`select id from kb_nodes where parent_id = ${rootId} and name = ${name} and deleted_at is null`)[0].id as string;
  async function insertTemplate(scope: 'work' | 'account_template', parentId: string, name: string, content: string) {
    const [row] = await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      values (${owner.id}::uuid, ${scope === 'work' ? workId : null}, ${scope}, ${parentId}, 'file', 'template', false, ${name}, ${content})
      returning id`;
    return row.id as string;
  }

  beforeAll(async () => {
    if (optInRef !== projectRef) {
      throw new Error(`TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF (${optInRef}) does not match NEXT_PUBLIC_SUPABASE_URL ref (${projectRef}); refusing to alter schema state`);
    }
    // Pre-0022 schema: drop the 0023 guard/index and restore the 0002 locked guard (name/deleted_at only).
    await applyMigration(`begin;
      drop trigger if exists kb_nodes_guard_template_policy on kb_nodes;
      drop index if exists kb_nodes_template_area_name_unique;
      create or replace function guard_locked_kb_node() returns trigger language plpgsql as $$
      begin
        if OLD.is_locked and (NEW.name is distinct from OLD.name or NEW.deleted_at is not null) then
          raise exception 'locked_node_immutable';
        end if;
        return NEW;
      end; $$;
      commit;`);

    const user = await createTestUser();
    users.push(user.id);
    owner = user;
  });

  afterAll(async () => {
    for (const id of users) await deleteTestUser(id).catch(() => {});
    await sql.end();
  });

  it('historical: 0012 moves legacy flat template files into category folders and is idempotent', async () => {
    const [work] = await sql`insert into works (owner_id, title) values (${owner.id}::uuid, '이전 구조') returning id`;
    const [root] = await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
      values (${owner.id}::uuid, ${work.id}, 'work', null, 'folder', 'template', true, 'template') returning id`;
    await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      values (${owner.id}::uuid, ${work.id}, 'work', ${root.id}, 'file', 'template', false, '인물', '# 이전 인물'),
             (${owner.id}::uuid, ${work.id}, 'work', ${root.id}, 'file', 'template', false, '커스텀', '# 미분류')`;
    const legacy = await migration('0012_template_category_folders.sql');
    await applyMigration(legacy);
    await applyMigration(legacy);
    const rows = await sql`select child.name, child.node_type, parent.name as parent_name
      from kb_nodes child left join kb_nodes parent on child.parent_id = parent.id
      where child.work_id = ${work.id} and child.parent_id is not null and child.deleted_at is null`;
    expect(rows.filter((row) => row.node_type === 'folder' && row.parent_name === 'template')).toHaveLength(5);
    expect(rows.find((row) => row.name === '인물' && row.node_type === 'file')?.parent_name).toBe('인물');
    expect(rows.find((row) => row.name === '커스텀')?.parent_name).toBe('template');
    ids.legacyWork = work.id;
  });

  it('historical: 0004 backfills a locked 회차 folder for a legacy work', async () => {
    const [work] = await sql`insert into works (owner_id, title) values (${owner.id}::uuid, '레거시 작품') returning id`;
    for (const category of ['template', '인물', '장소', '사건', '세력', '아이템']) {
      await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
        values (${owner.id}::uuid, ${work.id}::uuid, 'work', null, 'folder', ${category}, true, ${category})`;
    }
    await applyMigration(await migration('0004_kb_custom_folders.sql'));
    await applyMigration(await migration('0012_template_category_folders.sql'));
    // 0004 replay regresses soft_delete_kb_node to its pre-0008 body; restore the latest (0008) definition.
    const sanction = await migration('0008_sanction_enforcement.sql');
    const start = sanction.indexOf('create or replace function soft_delete_kb_node');
    const grant = 'grant execute on function soft_delete_kb_node(uuid, uuid) to authenticated, service_role;';
    const end = sanction.indexOf(grant, start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    await applyMigration(`begin;\n${sanction.slice(start, end + grant.length)}\ncommit;`);
    const after = await sql`select is_locked from kb_nodes where work_id = ${work.id} and category = '회차' and parent_id is null`;
    expect(after).toEqual([{ is_locked: true }]);
  });

  it('builds the pre-0022 fixture: unchanged / edited / renamed / moved / missing / soft-deleted / colliding, two scopes', async () => {
    const [work] = await sql`select create_work(${owner.id}::uuid, '이관 대상', null, null, null) as id`;
    workId = work.id;
    workRootId = (await sql`select id from kb_nodes where work_id = ${workId} and category = 'template' and parent_id is null`)[0].id;
    accountRootId = (await sql`select ensure_account_template_root(${owner.id}::uuid) as id`)[0].id;
    const person = await readCanonicalSeed('인물');

    ids.unchanged = await insertTemplate('work', await folderOf(workRootId, '인물'), '인물', person.replaceAll('\n', '\r\n'));
    ids.edited = await insertTemplate('work', await folderOf(workRootId, '장소'), '장소', '# 내가 고친 장소\r\n본문');
    ids.existingCopy = await insertTemplate('work', await folderOf(workRootId, '장소'), '장소 사본', 'existing copy');
    ids.renamed = await insertTemplate('work', await folderOf(workRootId, '사건'), '내 사건', 'renamed default');
    ids.moved = await insertTemplate('work', await folderOf(workRootId, '아이템'), '세력', 'moved 세력');
    ids.memo1 = await insertTemplate('work', await folderOf(workRootId, '인물'), '메모', 'm1');
    ids.memo2 = await insertTemplate('work', await folderOf(workRootId, '장소'), '메모 ', 'm2');
    ids.accountDeleted = await insertTemplate('account_template', await folderOf(accountRootId, '인물'), '인물', 'deleted edited');
    await sql`update kb_nodes set deleted_at = now() where id = ${ids.accountDeleted}`;
    ids.accountEdited = await insertTemplate('account_template', await folderOf(accountRootId, '장소'), '장소', 'account edited');
    const [doc] = await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      select ${owner.id}::uuid, ${workId}, 'work', id, 'file', '인물', false, '아서', 'general doc'
      from kb_nodes where work_id = ${workId} and category = '인물' and parent_id is null returning id`;
    ids.generalDoc = doc.id;
    expect(Object.keys(ids).length).toBeGreaterThan(8);
  });

  it('applies 0022 → 0022 → 0023 → 0023 → 0022 without error (re-run safe)', async () => {
    const backfill = await migration('0022_template_readonly_backfill.sql');
    const guards = await migration('0023_template_policy_guards.sql');
    for (const sqlText of [backfill, backfill, guards, guards, backfill]) await applyMigration(sqlText);
  });

  it('each area has exactly the 5 canonical defaults, locked, byte-equal to the catalog and to readCanonicalSeed', async () => {
    for (const scope of ['work', 'account_template'] as const) {
      const rows = await sql`select f.name, f.content, p.name as folder_name, (c.content = f.content) as canonical
        from kb_nodes f join kb_nodes p on p.id = f.parent_id
        left join kb_template_seed_catalog c on c.name = f.name
        where f.owner_id = ${owner.id} and f.scope = ${scope} and f.node_type = 'file'
          and f.is_locked and f.deleted_at is null and coalesce(f.work_id::text, '') = ${scope === 'work' ? workId : ''}`;
      expect(rows.map((row) => row.name).sort()).toEqual([...KB_CATEGORIES].sort());
      for (const row of rows) {
        expect(row.canonical).toBe(true);
        expect(row.folder_name).toBe(row.name);
        expect(row.content).toBe(await readCanonicalSeed(row.name));
      }
    }
  });

  it('preserves edits as copies, restores originals in place, keeps renamed/moved files and untouched rows', async () => {
    const byId = async (id: string) => (await sql`select name, content, is_locked, deleted_at from kb_nodes where id = ${id}`)[0];
    const workFiles = await sql`select id, name, content, is_locked from kb_nodes
      where work_id = ${workId} and node_type = 'file' and category = 'template' and deleted_at is null`;
    const named = (name: string) => workFiles.filter((row) => row.name === name);

    expect((await byId(ids.unchanged)).is_locked).toBe(true);
    expect(named('인물 사본')).toHaveLength(0);
    expect(await byId(ids.edited)).toMatchObject({ name: '장소', is_locked: true });
    expect(named('장소 사본 2')).toEqual([expect.objectContaining({ content: '# 내가 고친 장소\r\n본문', is_locked: false })]);
    expect((await byId(ids.existingCopy)).content).toBe('existing copy');
    expect(await byId(ids.renamed)).toMatchObject({ name: '내 사건', content: 'renamed default', is_locked: false });
    expect(await byId(ids.moved)).toMatchObject({ name: '세력 (2)', content: 'moved 세력', is_locked: false });
    expect(await byId(ids.memo1)).toMatchObject({ name: '메모', content: 'm1' });
    expect(await byId(ids.memo2)).toMatchObject({ name: '메모 (2)', content: 'm2' });
    expect(await byId(ids.accountDeleted)).toMatchObject({ content: 'deleted edited' });
    expect((await byId(ids.accountDeleted)).deleted_at).not.toBeNull();
    expect(await byId(ids.accountEdited)).toMatchObject({ name: '장소', is_locked: true });
    expect(await byId(ids.generalDoc)).toMatchObject({ content: 'general doc', is_locked: false });

    const provenance = await sql`select original_id from kb_template_backfill_copies
      where original_id in ${sql([ids.edited, ids.accountEdited])}`;
    expect(provenance).toHaveLength(2);
  });

  it('a signed-in writer cannot edit, rename, unlock, hard-delete or forge defaults, nor use reserved names', async () => {
    const client = await signedInClient(owner);
    const eventFolder = await folderOf(workRootId, '사건');
    const update = (patch: Record<string, unknown>) => client.from('kb_nodes').update(patch).eq('id', ids.edited).select('id');

    expect((await update({ content: 'x' })).error?.message).toContain('locked_template_immutable');
    expect((await update({ name: 'y' })).error?.message).toContain('locked_node_immutable');
    expect((await update({ is_locked: false })).error?.message).toContain('locked_node_immutable');
    expect((await client.from('kb_nodes').delete().eq('id', ids.edited).select('id')).error?.message).toContain('locked_node_immutable');
    expect((await client.rpc('soft_delete_kb_node', { p_node_id: ids.edited, p_owner_id: owner.id })).error?.message)
      .toContain('locked_node_immutable');

    const insert = (row: Record<string, unknown>) => client.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: eventFolder, node_type: 'file', category: 'template',
      is_locked: false, ...row,
    }).select('id');
    expect((await insert({ name: '사건', content: 'x' })).error?.message).toContain('template_name_reserved');
    expect((await insert({ name: ' 인물 ', content: 'x' })).error?.message).toContain('template_name_reserved');
    expect((await insert({ name: '사건', content: 'fake', is_locked: true })).error?.message).toContain('invalid_template_seed');
    expect((await insert({ name: '위장', content: await readCanonicalSeed('사건'), is_locked: true })).error?.message)
      .toContain('invalid_template_seed');
    expect((await insert({ name: '교차', content: 'x', parent_id: await folderOf(accountRootId, '사건') })).error?.message)
      .toContain('template_parent_invalid');
  });

  it('concurrent creation of the same template name in one area yields exactly one row', async () => {
    const client = await signedInClient(owner);
    const make = (folder: string) => folderOf(workRootId, folder).then((parent) => client.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: parent, node_type: 'file', category: 'template',
      is_locked: false, name: '동시 이름', content: 'c',
    }).select('id'));
    const results = await Promise.all([make('인물'), make('장소')]);
    expect(results.filter((result) => !result.error)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error?.code).toBe('23505');
    const sameNameElsewhere = await client.from('kb_nodes').insert({
      owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: await folderOf(accountRootId, '인물'),
      node_type: 'file', category: 'template', is_locked: false, name: '동시 이름', content: 'c',
    }).select('id');
    expect(sameNameElsewhere.error).toBeNull();
  });

  it('general documents, user templates and structural folders keep their behavior', async () => {
    const client = await signedInClient(owner);
    expect((await client.from('kb_nodes').update({ content: 'edited doc' }).eq('id', ids.generalDoc).select('id')).error).toBeNull();
    expect((await client.from('kb_nodes').update({ content: 'edited tpl', name: '내 사건 v2' }).eq('id', ids.renamed).select('id')).error).toBeNull();
    expect((await client.rpc('soft_delete_kb_node', { p_node_id: ids.memo2, p_owner_id: owner.id })).error).toBeNull();
    expect((await client.from('kb_nodes').update({ name: 'x' }).eq('id', workRootId).select('id')).error?.message)
      .toContain('locked_node_immutable');
  });

  it('the latest policy is in force at the end (guard trigger, area index, extended locked guard)', async () => {
    const [state] = await sql`select
      exists (select 1 from pg_trigger where tgname = 'kb_nodes_guard_template_policy' and not tgisinternal) as trigger_on,
      exists (select 1 from pg_indexes where indexname = 'kb_nodes_template_area_name_unique') as index_on,
      position('NEW.is_locked is not true' in pg_get_functiondef('guard_locked_kb_node'::regproc)) > 0 as unlock_guard,
      position('write_access_denied' in pg_get_functiondef('soft_delete_kb_node'::regproc)) > 0 as soft_delete_latest`;
    expect(state).toEqual({ trigger_on: true, index_on: true, unlock_guard: true, soft_delete_latest: true });
  });
});
