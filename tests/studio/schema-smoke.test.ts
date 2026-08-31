import { describe, it, expect, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { pgPool, createTestUser, deleteTestUser } from '../helpers/db';

describe('Studio schema smoke test (0002_studio.sql)', () => {
  const sql = pgPool(5);
  let users: string[] = [];

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

    const nodes = await sql`select category, is_locked, parent_id from kb_nodes where work_id = ${workId} order by category`;
    expect(nodes).toHaveLength(7);

    const categories = nodes.map((n) => n.category).sort();
    expect(categories).toEqual(['template', '인물', '장소', '사건', '세력', '아이템', '회차'].sort());

    for (const node of nodes) {
      expect(node.is_locked).toBe(true);
      expect(node.parent_id).toBeNull();
    }
  });

  it('rejects renaming the locked template kb_node with locked_node_immutable', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품2', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = 'template'`;

    await expect(
      sql`update kb_nodes set name = 'x' where id = ${node.id}`
    ).rejects.toThrow('locked_node_immutable');
  });

  it('rejects soft-deleting the locked template kb_node with locked_node_immutable', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품3', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = 'template'`;

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
    expect(count[0].count).toBe(1);
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
