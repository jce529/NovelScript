import { describe, it, expect, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pgPool, createTestUser, deleteTestUser, adminClient } from '../helpers/db';
import { seedTemplateFiles } from '../../lib/kb/templates';

describe('Studio schema smoke test (0002_studio.sql)', () => {
  const sql = pgPool(5);
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
    await sql.end();
  });

  async function createOwner() {
    const user = await createTestUser();
    users.push(user.id);
    return user.id;
  }

  it('create_work returns a work id and creates exactly 7 parent-less kb_nodes for it, ALL locked (D-03: 회차 + 6 existing structural folders)', async () => {
    const owner = await createOwner();

    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품', null, null, null) as work_id`;
    const workId = row.work_id;
    expect(workId).toBeTruthy();

    const nodes = await sql`select category, is_locked, parent_id from kb_nodes where work_id = ${workId} and parent_id is null order by category`;
    expect(nodes).toHaveLength(7);

    const categories = nodes.map((n) => n.category).sort();
    expect(categories).toEqual(['template', '인물', '장소', '사건', '세력', '아이템', '회차'].sort());

    for (const node of nodes) {
      expect(node.is_locked).toBe(true);
      expect(node.parent_id).toBeNull();
    }
    const folders = await sql`select child.name, child.category, child.is_locked from kb_nodes child
      join kb_nodes root on child.parent_id = root.id
      where root.work_id = ${workId} and root.category = 'template' and root.parent_id is null`;
    expect(folders.map((folder) => folder.name).sort()).toEqual(['인물','장소','사건','세력','아이템'].sort());
    expect(folders.every((folder) => folder.category === 'template' && folder.is_locked)).toBe(true);
  });

  it('rejects renaming the locked template kb_node with locked_node_immutable', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품2', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = 'template' and parent_id is null`;

    await expect(
      sql`update kb_nodes set name = 'x' where id = ${node.id}`
    ).rejects.toThrow('locked_node_immutable');
  });

  it('rejects soft-deleting the locked template kb_node with locked_node_immutable', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품3', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = 'template' and parent_id is null`;

    await expect(
      sql`update kb_nodes set deleted_at = now() where id = ${node.id}`
    ).rejects.toThrow('locked_node_immutable');
  });

  it('rejects renaming a locked 인물 kb_node with locked_node_immutable (D-03 regression fix: all 7 structural folders locked, not just template)', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품5', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = '인물'`;

    await expect(
      sql`update kb_nodes set name = '인물(개명)' where id = ${node.id}`
    ).rejects.toThrow('locked_node_immutable');
  });

  it('ensure_account_template_root is idempotent across repeated calls', async () => {
    const owner = await createOwner();

    const [first] = await sql`select ensure_account_template_root(${owner}::uuid) as id`;
    const [second] = await sql`select ensure_account_template_root(${owner}::uuid) as id`;

    expect(first.id).toBeTruthy();
    expect(second.id).toBe(first.id);

    const count = await sql`select count(*)::int as count from kb_nodes where owner_id = ${owner} and scope = 'account_template'`;
    expect(count[0].count).toBe(6);
  });

  it('seeds each scope inside its five category folders without duplicates', async () => {
    const owner = await createOwner();
    const [work] = await sql`select create_work(${owner}::uuid, '템플릿 시드', null, null, null) as id`;
    const [workRoot] = await sql`select id from kb_nodes where work_id = ${work.id} and category = 'template' and parent_id is null`;
    const [accountRoot] = await sql`select ensure_account_template_root(${owner}::uuid) as id`;
    const admin = adminClient();
    for (const [rootId, scope, workId] of [
      [workRoot.id, 'work', work.id], [accountRoot.id, 'account_template', null],
    ] as const) {
      await seedTemplateFiles(admin, { ownerId: owner, workId, scope, templateRootId: rootId });
      await seedTemplateFiles(admin, { ownerId: owner, workId, scope, templateRootId: rootId });
      const files = await sql`select file.name, folder.name as folder_name from kb_nodes file
        join kb_nodes folder on file.parent_id = folder.id
        where folder.parent_id = ${rootId} and file.node_type = 'file' and file.deleted_at is null`;
      expect(files).toHaveLength(5);
      expect(files.every((file) => file.name === file.folder_name)).toBe(true);
    }
  });

  it('migrates legacy flat files, leaves custom files at root, and is idempotent', async () => {
    const owner = await createOwner();
    const [work] = await sql`insert into works (owner_id, title) values (${owner}::uuid, '이전 구조') returning id`;
    const [root] = await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
      values (${owner}::uuid, ${work.id}, 'work', null, 'folder', 'template', true, 'template') returning id`;
    const [accountRoot] = await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
      values (${owner}::uuid, null, 'account_template', null, 'folder', 'template', true, 'template') returning id`;
    await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      values (${owner}::uuid, ${work.id}, 'work', ${root.id}, 'file', 'template', false, '인물', '# 이전 인물'),
             (${owner}::uuid, ${work.id}, 'work', ${root.id}, 'file', 'template', false, '커스텀', '# 미분류')`;
    await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
      values (${owner}::uuid, ${work.id}, 'work', ${root.id}, 'folder', 'template', false, '사용자 폴더'),
             (${owner}::uuid, null, 'account_template', ${accountRoot.id}, 'file', 'template', false, '인물')`;
    const migrationSql = await readFile(new URL('../../supabase/migrations/0012_template_category_folders.sql', import.meta.url), 'utf-8');
    await sql.unsafe(migrationSql);
    await sql.unsafe(migrationSql);
    const rows = await sql`select child.name, child.node_type, parent.name as parent_name
      from kb_nodes child left join kb_nodes parent on child.parent_id = parent.id
      where child.work_id = ${work.id} and child.parent_id is not null and child.deleted_at is null`;
    expect(rows.filter((row) => row.node_type === 'folder' && row.parent_name === 'template')).toHaveLength(6);
    expect(rows.find((row) => row.name === '인물' && row.node_type === 'file')?.parent_name).toBe('인물');
    expect(rows.find((row) => row.name === '커스텀')?.parent_name).toBe('template');
    expect(rows.find((row) => row.name === '사용자 폴더')?.parent_name).toBe('template');
    const accountRows = await sql`select file.name, parent.name as parent_name from kb_nodes file
      join kb_nodes parent on file.parent_id = parent.id
      where file.scope = 'account_template' and file.owner_id = ${owner} and file.node_type = 'file'`;
    expect(accountRows).toEqual([expect.objectContaining({ name: '인물', parent_name: '인물' })]);
  });

  it('backfills a locked 회차 folder for a work that predates this migration (D-06), proven by simulating a legacy work and re-applying the idempotent migration', async () => {
    const owner = await createOwner();
    const [work] = await sql`insert into works (owner_id, title) values (${owner}::uuid, '레거시 작품') returning id`;
    const legacyWorkId = work.id;
    for (const category of ['template', '인물', '장소', '사건', '세력', '아이템']) {
      await sql`insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
        values (${owner}::uuid, ${legacyWorkId}::uuid, 'work', null, 'folder', ${category}, true, ${category})`;
    }
    const before = await sql`select count(*)::int as count from kb_nodes where work_id = ${legacyWorkId} and category = '회차'`;
    expect(before[0].count).toBe(0);

    const migrationSql = await readFile(new URL('../../supabase/migrations/0004_kb_custom_folders.sql', import.meta.url), 'utf-8');
    await sql.unsafe(migrationSql);
    const templateMigrationSql = await readFile(new URL('../../supabase/migrations/0012_template_category_folders.sql', import.meta.url), 'utf-8');
    await sql.unsafe(templateMigrationSql);

    const after = await sql`select is_locked from kb_nodes where work_id = ${legacyWorkId} and category = '회차' and parent_id is null`;
    expect(after).toHaveLength(1);
    expect(after[0].is_locked).toBe(true);
  });

  it('reorder_chapters resequences a full chapter list in one deferred-constraint transaction', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품4', null, null, null) as work_id`;
    const workId = row.work_id;

    const [c1] = await sql`insert into chapters (work_id, title, order_index) values (${workId}, '1화', 0) returning id`;
    const [c2] = await sql`insert into chapters (work_id, title, order_index) values (${workId}, '2화', 1) returning id`;
    const [c3] = await sql`insert into chapters (work_id, title, order_index) values (${workId}, '3화', 2) returning id`;

    // New order: c2, c1, c3 -> expect order_index c2=0, c1=1, c3=2
    await sql`select reorder_chapters(${workId}::uuid, ARRAY[${c2.id}, ${c1.id}, ${c3.id}]::uuid[])`;

    const rows = await sql`select id, order_index from chapters where work_id = ${workId}`;
    const byId = new Map(rows.map((r) => [r.id, r.order_index]));

    expect(byId.get(c2.id)).toBe(0);
    expect(byId.get(c1.id)).toBe(1);
    expect(byId.get(c3.id)).toBe(2);
  });
});
