import { afterAll, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';
import { createChapter } from '../../lib/chapters/actions';

// BUG-01 (Phase 2): committed fixtures + independent connections so creates really race.
describe.skipIf(!process.env.SUPABASE_DB_URL)('atomic chapter creation (create_chapter_atomic)', () => {
  const admin = adminClient();
  const sql = pgPool(6);
  const users: string[] = [];

  afterAll(async () => {
    await sql.end();
    for (const id of users) await deleteTestUser(id).catch(() => {});
  });

  async function ownerWithWork() {
    const user = await createTestUser();
    users.push(user.id);
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: user.id, p_title: 'race', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    if (error) throw error;
    return { ownerId: user.id, workId: data as string };
  }

  async function orders(workId: string) {
    const rows = await sql`select order_index from chapters where work_id = ${workId} order by order_index`;
    return rows.map((r) => r.order_index as number);
  }

  /** Runs the RPC as a browser session user (auth.uid() = asUid) in its own transaction. */
  function rpcAs(asUid: string, ownerId: string, workId: string, folderId: string | null = null) {
    return sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: asUid, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      const rows = await tx`select create_chapter_atomic(${ownerId}::uuid, ${workId}::uuid, '회차', ${folderId}::uuid) as id`;
      return rows[0].id as string;
    });
  }

  it('concurrent createChapter calls all succeed with consecutive orders', async () => {
    const { ownerId, workId } = await ownerWithWork();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createChapter(admin, { ownerId, workId, title: `${i + 1}화` }))
    );
    expect(results.map((r) => r.ok)).toEqual(Array(6).fill(true));
    expect(new Set(results.map((r) => r.chapterId)).size).toBe(6);
    expect(await orders(workId)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('a second creator waits for the first transaction and then takes the next order', async () => {
    const { ownerId, workId } = await ownerWithWork();
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    let firstId = '';
    const first = sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      firstId = (await tx`select create_chapter_atomic(${ownerId}::uuid, ${workId}::uuid, 'A', null) as id`)[0].id as string;
      await hold;
    });
    await vi_waitFor(async () => firstId !== '');
    const second = createChapter(admin, { ownerId, workId, title: 'B' });
    const early = await Promise.race([second, new Promise((r) => setTimeout(() => r('waiting'), 800))]);
    expect(early).toBe('waiting');
    release();
    await first;
    expect((await second).ok).toBe(true);
    expect(await orders(workId)).toEqual([0, 1]);
  });

  it('a rolled-back first creator does not consume an order', async () => {
    const { ownerId, workId } = await ownerWithWork();
    await expect(sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      await tx`select create_chapter_atomic(${ownerId}::uuid, ${workId}::uuid, 'A', null)`;
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    expect((await createChapter(admin, { ownerId, workId, title: 'B' })).ok).toBe(true);
    expect(await orders(workId)).toEqual([0]);
  });

  it('different works number independently', async () => {
    const a = await ownerWithWork();
    const b = await ownerWithWork();
    await Promise.all([
      createChapter(admin, { ...a, title: '1' }), createChapter(admin, { ...b, title: '1' }),
      createChapter(admin, { ...a, title: '2' }), createChapter(admin, { ...b, title: '2' }),
    ]);
    expect(await orders(a.workId)).toEqual([0, 1]);
    expect(await orders(b.workId)).toEqual([0, 1]);
  });

  it('deleted chapters keep consuming their order (existing semantics)', async () => {
    const { ownerId, workId } = await ownerWithWork();
    const first = await createChapter(admin, { ownerId, workId, title: '1' });
    await sql`update chapters set deleted_at = now() where id = ${first.chapterId!}`;
    await createChapter(admin, { ownerId, workId, title: '2' });
    expect(await orders(workId)).toEqual([0, 1]);
  });

  it('rejects other owners, mismatched sessions, anonymous roles, bad folders and suspended accounts', async () => {
    const { ownerId, workId } = await ownerWithWork();
    const other = await createTestUser();
    users.push(other.id);

    await expect(rpcAs(other.id, other.id, workId)).rejects.toThrow(/work_not_found/);
    await expect(rpcAs(other.id, ownerId, workId)).rejects.toThrow(/write_access_denied/);
    await expect(rpcAs(ownerId, ownerId, workId, crypto.randomUUID())).rejects.toThrow(/invalid_folder/);
    await expect(sql.begin(async (tx) => {
      await tx`set local role anon`;
      await tx`select create_chapter_atomic(${ownerId}::uuid, ${workId}::uuid, 'x', null)`;
    })).rejects.toThrow(/permission denied/);

    await sql.begin(async (tx) => {
      await tx`select set_config('app.sanction_cache_writer', 'on', true)`;
      await tx`update profiles set sanction_kind = 'permanent_suspension' where id = ${ownerId}`;
    });
    await expect(rpcAs(ownerId, ownerId, workId)).rejects.toThrow(/write_access_denied/);
    expect(await orders(workId)).toEqual([]);
  });

  it('createChapter hides database error text', async () => {
    const { ownerId, workId } = await ownerWithWork();
    // Pre-checks use the real client; only the create call returns a raw DB error.
    const client = {
      from: admin.from.bind(admin),
      rpc: (name: string, args: Record<string, unknown>) =>
        name === 'create_chapter_atomic'
          ? Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint "chapters_work_order_uniq"' } })
          : admin.rpc(name, args),
    } as unknown as typeof admin;
    const result = await createChapter(client, { ownerId, workId, title: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/duplicate|constraint|chapters_work_order_uniq/);
  });
});

async function vi_waitFor(check: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 25));
  }
}
