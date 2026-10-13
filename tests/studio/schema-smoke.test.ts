import { describe, it, expect, afterAll } from 'vitest';
import { pgPool, createTestUser, deleteTestUser, adminClient } from '../helpers/db';
import { seedTemplateFiles, readCanonicalSeed } from '../../lib/kb/templates';

// Current-schema regression only. Historical migration replays (0004/0012) and the 0022/0023 data
// migration fixtures live in tests/kb/template-policy-migration.test.ts, which runs on an opt-in
// disposable DB — re-applying old migrations here would fight the current template policy.
describe('Studio schema smoke test (current studio schema)', () => {
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

  it('seeds each scope inside its five category folders as locked canonical defaults, without duplicates', async () => {
    const owner = await createOwner();
    const [work] = await sql`select create_work(${owner}::uuid, '템플릿 시드', null, null, null) as id`;
    const [workRoot] = await sql`select id from kb_nodes where work_id = ${work.id} and category = 'template' and parent_id is null`;
    const [accountRoot] = await sql`select ensure_account_template_root(${owner}::uuid) as id`;
    const admin = adminClient();
    for (const [rootId, scope, workId] of [
      [workRoot.id, 'work', work.id], [accountRoot.id, 'account_template', null],
    ] as const) {
      const first = await seedTemplateFiles(admin, { ownerId: owner, workId, scope, templateRootId: rootId });
      const second = await seedTemplateFiles(admin, { ownerId: owner, workId, scope, templateRootId: rootId });
      expect(first.created).toHaveLength(5);
      expect(second).toEqual({ created: [], existing: first.created, blocked: [] });
      const files = await sql`select file.id, file.name, file.content, file.is_locked, folder.name as folder_name from kb_nodes file
        join kb_nodes folder on file.parent_id = folder.id
        where folder.parent_id = ${rootId} and file.node_type = 'file' and file.deleted_at is null`;
      expect(files).toHaveLength(5);
      for (const file of files) {
        expect(file.name).toBe(file.folder_name);
        expect(file.is_locked).toBe(true);
        expect(file.content).toBe(await readCanonicalSeed(file.name));
      }
      await expect(sql`update kb_nodes set content = 'x' where id = ${files[0].id}`).rejects.toThrow('locked_template_immutable');
    }
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
