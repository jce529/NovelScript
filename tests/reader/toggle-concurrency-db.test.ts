import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';

// BUG-02: independent DB connections (not the single-connection fixture pattern) so two toggles
// really race. Fixtures are committed via the service-role API; each toggle runs as the user in
// its own transaction.
const TABLES = [
  ['like', 'work_likes', 'toggle_work_likes'],
  ['bookmark', 'work_bookmarks', 'toggle_work_bookmarks'],
  ['subscription', 'work_subscriptions', 'toggle_work_subscriptions'],
] as const;

describe('atomic reader toggles (BUG-02)', () => {
  const admin = adminClient();
  const sql = pgPool(6);
  const users: string[] = [];

  afterAll(async () => {
    await sql.end();
    for (const id of users) await deleteTestUser(id).catch(() => {});
  });

  async function newUser() {
    const u = await createTestUser();
    users.push(u.id);
    return u;
  }

  async function createWork() {
    const owner = await newUser();
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: 'toggle race', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    if (error) throw error;
    return data as string;
  }

  function toggleAs(userId: string | null, fn: string, workId: string) {
    return sql.begin(async (tx) => {
      if (userId) await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      const rows = await tx.unsafe(`select ${fn}($1::uuid) as state`, [workId]);
      return rows[0].state as boolean;
    });
  }

  async function rowCount(table: string, workId: string, userId: string) {
    const rows = await sql.unsafe(`select count(*)::int as n from ${table} where work_id = $1 and user_id = $2`, [workId, userId]);
    return rows[0].n as number;
  }

  describe.each(TABLES)('%s', (_name, table, fn) => {
    it('two concurrent toggles from an empty state end off (one on, one off)', async () => {
      const workId = await createWork();
      const user = await newUser();
      const results = await Promise.all([toggleAs(user.id, fn, workId), toggleAs(user.id, fn, workId)]);
      expect([...results].sort()).toEqual([false, true]);
      expect(await rowCount(table, workId, user.id)).toBe(0);
    });

    it('two concurrent toggles from an existing row end on (one off, one on)', async () => {
      const workId = await createWork();
      const user = await newUser();
      expect(await toggleAs(user.id, fn, workId)).toBe(true);
      const results = await Promise.all([toggleAs(user.id, fn, workId), toggleAs(user.id, fn, workId)]);
      expect([...results].sort()).toEqual([false, true]);
      expect(await rowCount(table, workId, user.id)).toBe(1);
    });

    it('sequential on -> off -> on and other users stay untouched', async () => {
      const workId = await createWork();
      const user = await newUser();
      const other = await newUser();
      await toggleAs(other.id, fn, workId);
      expect(await toggleAs(user.id, fn, workId)).toBe(true);
      expect(await toggleAs(user.id, fn, workId)).toBe(false);
      expect(await toggleAs(user.id, fn, workId)).toBe(true);
      expect(await rowCount(table, workId, other.id)).toBe(1);
    });

    it('rejects anonymous callers and suspended accounts', async () => {
      const workId = await createWork();
      await expect(toggleAs(null, fn, workId)).rejects.toThrow(/write_access_denied/);
      const user = await newUser();
      await sql.begin(async (tx) => {
        await tx`select set_config('app.sanction_cache_writer', 'on', true)`;
        await tx`update profiles set sanction_kind = 'permanent_suspension' where id = ${user.id}`;
      });
      await expect(toggleAs(user.id, fn, workId)).rejects.toThrow(/write_access_denied/);
      expect(await rowCount(table, workId, user.id)).toBe(0);
    });
  });
});
