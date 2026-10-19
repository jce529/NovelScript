import postgres from 'postgres';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// 07-08 Task 3: publication_notifications (0029). A real blind lift (direct unblind or
// re-review 'unblinded') notifies the work's bookmark (선호작) holders once; nothing else does.
//
// Real PostgreSQL, isolated schema and outer rollback (operations.database.test.ts harness).
// SQL files are read at module load; the connection opens only in beforeAll.
const MIGRATIONS = ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
  '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql',
  '0008_sanction_enforcement.sql', '0009_blind_access.sql', '0029_admin_blueprint_completion.sql'] as const;
const MIGRATION_SQL = MIGRATIONS.map((file) => {
  const text = readFileSync(`supabase/migrations/${file}`, 'utf8');
  assert.ok(text.trim().length > 0, `${file} is empty`);
  return { file, text };
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('unblind publication notifications (PostgreSQL)', () => {
  let sql: postgres.Sql;
  const schema = `admin_bp_pub_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (text: string) => sql.unsafe(text);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const reader2 = '10000000-0000-4000-8000-000000000004';
  const subscriber = '10000000-0000-4000-8000-000000000005';
  const gone = '10000000-0000-4000-8000-000000000006';
  const work = '20000000-0000-4000-8000-000000000001';
  const chapter = '30000000-0000-4000-8000-000000000001';
  const chapter2 = '30000000-0000-4000-8000-000000000002';

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  const asOwner = () => exec('reset role');
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }
  async function blind(table: 'works' | 'chapters', id: string) {
    await asOwner();
    await query(`update ${table} set admin_blinded = true, admin_blind_reason = '운영 정책', admin_blinded_at = now() where id = $1`, [id]);
  }
  async function unblind(chapterId: string | null, key = crypto.randomUUID()) {
    await asOwner();
    const v = await scalar<string>('select moderation_target_version($1, $2)', [work, chapterId]);
    await as(admin, 'service_role');
    return scalar<string>('select unblind_moderation_target($1, $2, $3, $4, $5, $6)', [admin, key, work, chapterId, v, '해제']);
  }
  async function reviewRequest(chapterId: string | null) {
    await as(writer);
    await query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapterId]);
    await asOwner();
    return scalar<string>("select id from moderation_review_requests where status = 'open'");
  }
  async function resolve(request: string, outcome: 'maintained' | 'unblinded', chapterId: string | null) {
    await asOwner();
    const v = await scalar<string>('select moderation_target_version($1, $2)', [work, chapterId]);
    await as(admin, 'service_role');
    return scalar<string>('select resolve_review_request($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), request, outcome, v, '재검토 결과']);
  }
  async function notices() {
    await asOwner();
    return query('select user_id, work_id, chapter_id, kind, title, admin_action_id from publication_notifications order by user_id, created_at');
  }

  beforeAll(async () => {
    sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
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
    for (const { text } of MIGRATION_SQL) {
      await exec(text
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, '')
        .replace(/^notify pgrst.*$/gm, ''));
    }
  }, 120_000);
  afterAll(async () => {
    if (!sql) return;
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3),($4),($5),($6)',
      [writer, reader, admin, reader2, subscriber, gone]);
    await query("update profiles set role = 'writer', pen_name = 'Writer' where id = $1", [writer]);
    await query("insert into works(id, owner_id, title, synopsis) values ($1, $2, '작품', '소개')", [work, writer]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published)
      values ($1, $3, '1화', 'body', 0, true), ($2, $3, '2화', 'body', 1, true)`, [chapter, chapter2, work]);
    // Bookmark holders: reader, reader2, a deleted account and the owner. subscriber only subscribes.
    await query('insert into work_bookmarks(work_id, user_id) values ($1, $2), ($1, $3), ($1, $4), ($1, $5)',
      [work, reader, reader2, gone, writer]);
    await query('insert into work_subscriptions(work_id, user_id) values ($1, $2)', [work, subscriber]);
    await query('update profiles set deleted_at = now() where id = $1', [gone]);
    await query("select grant_admin($1, 'test grant', 'vitest')", [admin]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('notifies current bookmark holders once on a direct chapter unblind, and nobody else', async () => {
    await blind('chapters', chapter);
    const action = await unblind(chapter);
    const rows = await notices();
    expect(rows.map((r) => r.user_id)).toEqual([reader, reader2].sort());
    expect(rows[0]).toMatchObject({ work_id: work, chapter_id: chapter, kind: 'publication', title: '작품 · 1화',
      admin_action_id: action });
  });

  it('notifies on a re-review "unblinded" outcome but not on "maintained"', async () => {
    await blind('works', work);
    const first = await reviewRequest(null);
    await resolve(first, 'maintained', null);
    expect(await notices()).toEqual([]);
    const second = await reviewRequest(null);
    const action = await resolve(second, 'unblinded', null);
    const rows = await notices();
    expect(rows.map((r) => [r.user_id, r.chapter_id, r.title, r.admin_action_id]))
      .toEqual([reader, reader2].sort().map((u) => [u, null, '작품', action]));
  });

  it('creates nothing for blinds, account sanction lifts or other audit rows', async () => {
    await asOwner();
    await query("insert into reports(reporter_id, work_id, chapter_id, reason_category) values ($1, $2, $3, '기타')",
      [reader, work, chapter]);
    const r1 = await scalar<string>('select id from reports');
    const v = await scalar<string>('select moderation_target_version($1, $2)', [work, chapter]);
    await as(admin, 'service_role');
    await query("select moderate_report_group($1, $2, $3, $4, $5::uuid[], $6, 'blind', 'i', 'p', null)",
      [admin, crypto.randomUUID(), work, chapter, [r1], v]);
    await asOwner();
    const suspend = await scalar<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, 'user_permanent_suspend', $2, 'i', 'p') returning id`, [admin, writer]);
    await query("select apply_user_sanction($1, $2, 'permanent_suspension', 'p', 'i', null, $3)", [admin, writer, suspend]);
    const lift = await scalar<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, 'user_sanction_lift', $2, 'i', 'p') returning id`, [admin, writer]);
    await query("select apply_user_sanction($1, $2, 'lift', 'p', 'i', null, $3)", [admin, writer, lift]);
    expect(await notices()).toEqual([]);
  });

  it('stays silent when the content is still not public after the lift', async () => {
    // Chapter lifted while the parent work is still blinded.
    await blind('works', work);
    await blind('chapters', chapter);
    await unblind(chapter);
    expect(await notices()).toEqual([]);

    // Unpublished and deleted chapters.
    await asOwner();
    await query('update works set admin_blinded = false, admin_blind_reason = null, admin_blinded_at = null where id = $1', [work]);
    await blind('chapters', chapter2);
    await query('update chapters set is_published = false where id = $1', [chapter2]);
    await unblind(chapter2);
    await blind('chapters', chapter2);
    await asOwner();
    await query('update chapters set is_published = true, deleted_at = now() where id = $1', [chapter2]);
    await unblind(chapter2);
    expect(await notices()).toEqual([]);

    // Work lift with no readable chapter: chapter is unpublished, chapter2 deleted.
    await asOwner();
    await query('update chapters set is_published = false where id = $1', [chapter]);
    await blind('works', work);
    await unblind(null);
    expect(await notices()).toEqual([]);
  });

  it('sends one work-level notice and never announces a chapter that is still separately blinded', async () => {
    await blind('chapters', chapter);
    await blind('works', work);
    const action = await unblind(null);
    const rows = await notices();
    expect(rows.map((r) => [r.user_id, r.chapter_id, r.admin_action_id])).toEqual([reader, reader2].sort().map((u) => [u, null, action]));

    // Only separately blinded chapters left public-eligible: no work notice.
    await asOwner();
    await query('update chapters set is_published = false where id = $1', [chapter2]);
    await blind('works', work);
    await unblind(null);
    expect((await notices()).length).toBe(2);
  });

  it('never duplicates on retry and leaves nothing behind when the unblind fails or rolls back', async () => {
    await blind('chapters', chapter);
    const key = crypto.randomUUID();
    const first = await unblind(chapter, key);
    await as(admin, 'service_role');
    // Same key retry replays the recorded action (version argument is not rechecked on replay).
    expect(await scalar<string>('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, key, work, chapter, 'old', '해제'])).toBe(first);
    expect((await notices()).length).toBe(2);
    await asOwner();
    await rejected(() => query(`insert into publication_notifications(user_id, work_id, chapter_id, admin_action_id, title)
      values ($1, $2, $3, $4, 'dup')`, [reader, work, chapter, first]), 'duplicate key');

    // Stale unblind: no audit, no notice.
    await as(admin, 'service_role');
    await rejected(() => query('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), work, chapter2, 'stale', '해제']), 'stale_target');

    // Notice insert failure rolls back the unblind itself.
    await blind('chapters', chapter2);
    await asOwner();
    await exec(`create function fail_notice() returns trigger language plpgsql as $$
      begin raise exception 'notice_write_failed'; end; $$;
      create trigger fail_notice before insert on publication_notifications for each row execute function fail_notice();`);
    const v = await scalar<string>('select moderation_target_version($1, $2)', [work, chapter2]);
    await as(admin, 'service_role');
    await rejected(() => query('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), work, chapter2, v, '해제']), 'notice_write_failed');
    await asOwner();
    expect(await scalar<boolean>('select admin_blinded from chapters where id = $1', [chapter2])).toBe(true);
    expect(await scalar<number>("select count(*)::int from admin_actions where action_type = 'chapter_unblind'")).toBe(1);
    expect((await notices()).length).toBe(2);
  });

  it('lets only the recipient read and acknowledge, also while suspended; browser writes are denied', async () => {
    await blind('chapters', chapter);
    const action = await unblind(chapter);
    await asOwner();
    const mine = await scalar<string>('select id from publication_notifications where user_id = $1', [reader]);
    const theirs = await scalar<string>('select id from publication_notifications where user_id = $1', [reader2]);

    await as(reader);
    expect((await query('select id, title, kind, acknowledged_at from publication_notifications')))
      .toEqual([{ id: mine, title: '작품 · 1화', kind: 'publication', acknowledged_at: null }]);
    await rejected(() => query('select admin_action_id from publication_notifications'), 'permission denied');
    await rejected(() => query('select acknowledge_publication_notification($1)', [theirs]), 'notification_not_found');
    await rejected(() => query(`insert into publication_notifications(user_id, work_id, admin_action_id, title)
      values ($1, $2, $3, 'x')`, [reader, work, action]), 'permission denied');
    await rejected(() => query('update publication_notifications set acknowledged_at = now()'), 'permission denied');
    await rejected(() => query('delete from publication_notifications'), 'permission denied');

    // Suspended recipient may still acknowledge (account-control exception).
    await asOwner();
    const suspend = await scalar<string>(`insert into admin_actions(actor_id, action_type, target_user_id, reason, public_reason)
      values ($1, 'user_permanent_suspend', $2, 'i', 'p') returning id`, [admin, reader]);
    await query("select apply_user_sanction($1, $2, 'permanent_suspension', 'p', 'i', null, $3)", [admin, reader, suspend]);
    await as(reader);
    expect(await scalar<boolean>('select acknowledge_publication_notification($1)', [mine])).toBe(true);
    expect(await scalar<boolean>('select acknowledge_publication_notification($1)', [mine])).toBe(true);
    await asOwner();
    expect(await scalar<boolean>('select acknowledged_at is not null from publication_notifications where id = $1', [mine])).toBe(true);
    expect(await scalar<boolean>('select acknowledged_at is null from publication_notifications where id = $1', [theirs])).toBe(true);

    await as(reader, 'anon');
    await rejected(() => query('select id from publication_notifications'), 'permission denied');
    await rejected(() => query('select acknowledge_publication_notification($1)', [mine]), 'permission denied');
    await as(reader2, 'authenticated');
    expect((await query('select id from publication_notifications')).map((r) => r.id)).toEqual([theirs]);
  });
});
