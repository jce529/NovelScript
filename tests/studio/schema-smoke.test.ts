import { describe, it, expect, afterAll } from 'vitest';
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

  it('create_work returns a work id and creates exactly 6 parent-less kb_nodes for it, only the template folder locked', async () => {
    const owner = await createOwner();

    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품', null, null, null) as work_id`;
    const workId = row.work_id;
    expect(workId).toBeTruthy();

    const nodes = await sql`select category, is_locked, parent_id from kb_nodes where work_id = ${workId} order by category`;
    expect(nodes).toHaveLength(6);

    const categories = nodes.map((n) => n.category).sort();
    expect(categories).toEqual(['사건', '세력', '아이템', '인물', '장소', 'template'].sort());

    for (const node of nodes) {
      expect(node.is_locked).toBe(node.category === 'template');
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

  it('allows renaming a non-template category folder (인물/장소/사건/세력/아이템 are unlocked)', async () => {
    const owner = await createOwner();
    const [row] = await sql`select create_work(${owner}::uuid, '테스트 작품5', null, null, null) as work_id`;
    const workId = row.work_id;

    const [node] = await sql`select id from kb_nodes where work_id = ${workId} and category = '인물'`;

    await expect(
      sql`update kb_nodes set name = '인물(개명)' where id = ${node.id}`
    ).resolves.toBeDefined();
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
