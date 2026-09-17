import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Real PostgreSQL, isolated schema and outer rollback (same harness as
// tests/admin/foundation.database.test.ts). Two-session races are covered in 07-07.
describe.skipIf(!process.env.SUPABASE_DB_URL)('admin moderation operations (PostgreSQL)', () => {
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 1, prepare: false });
  const schema = `admin_ops_${crypto.randomUUID().replaceAll('-', '')}`;
  const exec = (query: string) => sql.unsafe(query);
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  const writer = '10000000-0000-4000-8000-000000000001';
  const reader = '10000000-0000-4000-8000-000000000002';
  const admin = '10000000-0000-4000-8000-000000000003';
  const reader2 = '10000000-0000-4000-8000-000000000004';
  const outsider = '10000000-0000-4000-8000-000000000005';
  const work = '20000000-0000-4000-8000-000000000001';
  const work2 = '20000000-0000-4000-8000-000000000002';
  const chapter = '30000000-0000-4000-8000-000000000001';
  const chapter2 = '30000000-0000-4000-8000-000000000002';

  const OP = 'select moderate_report_group($1, $2, $3, $4, $5::uuid[], $6, $7, $8, $9, $10::timestamptz) as id';

  async function scalar<T>(text: string, params: unknown[] = []): Promise<T> {
    const rows = await query(text, params);
    return Object.values(rows[0] as object)[0] as T;
  }
  async function as(id: string, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated') {
    await exec('reset role');
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await exec(`set role ${role}`);
  }
  async function asOwner() {
    await exec('reset role');
  }
  async function rejected(action: () => Promise<unknown>, message: string) {
    await exec('savepoint expected_failure');
    await expect(action()).rejects.toThrow(message);
    await exec('rollback to savepoint expected_failure');
  }
  async function report(reporter: string, workId: string, chapterId: string | null, category = '스팸/광고', at?: string) {
    await asOwner();
    return scalar<string>(
      `insert into reports(reporter_id, work_id, chapter_id, reason_category, created_at)
       values ($1, $2, $3, $4, coalesce($5::timestamptz, now())) returning id`,
      [reporter, workId, chapterId, category, at ?? null]);
  }
  async function version(workId: string, chapterId: string | null) {
    await asOwner();
    return scalar<string>('select moderation_target_version($1, $2)', [workId, chapterId]);
  }
  interface OpInput {
    key?: string; workId?: string; chapterId?: string | null; ids: string[]; expected?: string;
    action: string; reason?: string | null; publicReason?: string | null; endsAt?: string | null; actor?: string;
  }
  async function op(input: OpInput) {
    const workId = input.workId ?? work;
    const chapterId = input.chapterId === undefined ? chapter : input.chapterId;
    const expected = input.expected ?? await version(workId, chapterId);
    await as(input.actor ?? admin, 'service_role');
    return scalar<string>(OP, [input.actor ?? admin, input.key ?? crypto.randomUUID(), workId, chapterId,
      input.ids, expected, input.action, input.reason ?? null, input.publicReason ?? null, input.endsAt ?? null]);
  }
  async function reportRow(id: string) {
    await asOwner();
    const [row] = await query('select status, resolution_note, resolved_by from reports where id = $1', [id]);
    return row as unknown as { status: string; resolution_note: string | null; resolved_by: string | null };
  }
  async function counts() {
    await asOwner();
    const [row] = await query(`select
      (select count(*)::int from admin_actions where action_type not in ('admin_grant','admin_revoke')) as actions,
      (select count(*)::int from user_sanctions) as sanctions,
      (select count(*)::int from reports where status = 'open') as open_reports,
      (select admin_blinded from chapters where id = '${chapter}') as chapter_blinded,
      (select admin_blinded from works where id = '${work}') as work_blinded,
      (select sanction_kind from profiles where id = '${writer}') as writer_sanction`);
    return row;
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
    for (const file of ['0001_init.sql', '0002_studio.sql', '0003_reader.sql', '0004_kb_custom_folders.sql',
      '0005_commerce.sql', '0006_admin_foundation.sql', '0007_admin_operations.sql']) {
      await exec(readFileSync(`supabase/migrations/${file}`, 'utf8')
        .replace('create extension if not exists "pgcrypto";', '')
        .replaceAll('auth.users', `${schema}.test_users`)
        .replaceAll('search_path = public', `search_path = ${schema}, public`)
        .replace(/^begin;|^commit;/gm, ''));
    }
  });
  afterAll(async () => {
    try { await exec('rollback'); } finally { await sql.end(); }
  });
  beforeEach(async () => {
    await exec('savepoint fixture');
    await query('insert into test_users(id) values ($1),($2),($3),($4),($5)', [writer, reader, admin, reader2, outsider]);
    await query("update profiles set role = 'writer', pen_name = 'Writer' where id = $1", [writer]);
    await query("insert into works(id, owner_id, title, synopsis) values ($1, $2, 'Work', 'work synopsis'), ($3, $2, 'Second', null)",
      [work, writer, work2]);
    await query(`insert into chapters(id, work_id, title, content, order_index, is_published)
      values ($1, $2, 'One', 'chapter body', 0, true), ($3, $2, 'Two', 'second body', 1, true)`,
      [chapter, work, chapter2]);
    await query("select grant_admin($1, 'test grant', 'vitest')", [admin]);
  });
  afterEach(async () => { await exec('rollback to savepoint fixture; reset role'); });

  it('denies every moderation function to browser roles', async () => {
    const calls: [string, unknown[]][] = [
      [OP, [admin, crypto.randomUUID(), work, chapter, [], 'v', 'dismiss', null, null, null]],
      ['select unblind_moderation_target($1, $2, $3, null, $4, $5)', [admin, crypto.randomUUID(), work, 'v', 'r']],
      ["select resolve_review_request($1, $2, $3, 'maintained', 'v', 'r')", [admin, crypto.randomUUID(), crypto.randomUUID()]],
      ["select * from list_report_groups('open', 25, 0)", []],
      ['select get_report_group_detail($1)', [crypto.randomUUID()]],
      ["select * from list_review_requests('open', 25, 0)", []],
      ['select get_review_request_detail($1)', [crypto.randomUUID()]],
      ['select moderation_target_version($1, null)', [work]],
      ["select moderation_set_blind($1, null, 'x')", [work]],
    ];
    for (const role of ['anon', 'authenticated'] as const) {
      await as(admin, role);
      for (const [text, params] of calls) await rejected(() => query(text, params), 'permission denied');
    }
    await as(admin, 'service_role');
    await rejected(() => query("select moderation_set_blind($1, null, 'x')", [work]), 'permission denied');
    expect(await query("select * from list_report_groups('open', 25, 0)")).toEqual([]);
  });

  it('dismisses without a note and resolves only the reviewed set, leaving late reports open', async () => {
    const r1 = await report(reader, work, chapter);
    const r2 = await report(reader2, work, chapter, '기타');
    const expected = await version(work, chapter);
    const late = await report(outsider, work, chapter); // arrives while the operator reviews
    const id = await op({ ids: [r2, r1], expected, action: 'dismiss' });

    expect(await reportRow(r1)).toEqual({ status: 'dismissed', resolution_note: null, resolved_by: admin });
    expect((await reportRow(r2)).status).toBe('dismissed');
    expect((await reportRow(late)).status).toBe('open');
    await asOwner();
    const [audit] = await query('select action_type, report_ids, target_chapter_id, reason from admin_actions where id = $1', [id]);
    expect(audit).toEqual({ action_type: 'report_dismiss', report_ids: [r1, r2].sort(), target_chapter_id: chapter, reason: null });

    const note = await op({ ids: [late], action: 'resolve', reason: '  확인 완료  ' });
    expect(await reportRow(late)).toEqual({ status: 'resolved', resolution_note: '확인 완료', resolved_by: admin });
    expect(note).toBeTruthy();
  });

  it('rejects report IDs that do not belong to the exact target', async () => {
    const chapterReport = await report(reader, work, chapter);
    const workReport = await report(reader, work, null);
    const otherChapterReport = await report(reader, work, chapter2);
    const before = await counts();
    // Work-level report cannot be consumed by a chapter-level command and vice versa.
    await rejected(() => op({ ids: [chapterReport, workReport], action: 'dismiss' }), 'report_target_mismatch');
    await rejected(() => op({ ids: [chapterReport], chapterId: null, action: 'dismiss' }), 'report_target_mismatch');
    await rejected(() => op({ ids: [chapterReport, otherChapterReport], action: 'dismiss' }), 'report_target_mismatch');
    await rejected(() => op({ ids: [crypto.randomUUID()], action: 'dismiss' }), 'report_target_mismatch');
    await rejected(() => op({ ids: [], action: 'dismiss' }), 'invalid_report_ids');
    await rejected(() => op({ ids: [chapterReport, chapterReport], action: 'dismiss' }), 'invalid_report_ids');
    await rejected(() => op({ ids: [chapterReport], action: 'delete' }), 'invalid_action');
    expect(await counts()).toEqual(before);
  });

  it('requires internal and public reasons for operative actions', async () => {
    const r1 = await report(reader, work, chapter);
    for (const action of ['blind', 'warn', 'permanent_suspend']) {
      await rejected(() => op({ ids: [r1], action, reason: '   ', publicReason: 'public' }), 'reason_required');
      await rejected(() => op({ ids: [r1], action, reason: 'internal', publicReason: null }), 'reason_required');
    }
    await rejected(() => op({ ids: [r1], action: 'suspend', reason: 'i', publicReason: 'p' }), 'invalid_sanction_expiry');
    await rejected(() => op({ ids: [r1], action: 'warn', reason: 'i', publicReason: 'p',
      endsAt: new Date(Date.now() + 86_400_000).toISOString() }), 'invalid_sanction_expiry');
    expect((await reportRow(r1)).status).toBe('open');
  });

  it('blinds a chapter atomically without touching publication and separates public from internal reason', async () => {
    const r1 = await report(reader, work, chapter);
    const id = await op({ ids: [r1], action: 'blind', reason: '내부 메모', publicReason: '운영 정책 위반' });
    await asOwner();
    const [row] = await query('select is_published, admin_blinded, admin_blind_reason from chapters where id = $1', [chapter]);
    expect(row).toEqual({ is_published: true, admin_blinded: true, admin_blind_reason: '운영 정책 위반' });
    expect(await scalar<boolean>('select admin_blinded from works where id = $1', [work])).toBe(false);
    const [audit] = await query('select action_type, reason, public_reason from admin_actions where id = $1', [id]);
    expect(audit).toEqual({ action_type: 'chapter_blind', reason: '내부 메모', public_reason: '운영 정책 위반' });
    expect(await reportRow(r1)).toEqual({ status: 'resolved', resolution_note: '내부 메모', resolved_by: admin });

    // Work-level blind is a separate target.
    const w1 = await report(reader, work, null);
    const workBlind = await op({ ids: [w1], chapterId: null, action: 'blind', reason: 'i', publicReason: 'p' });
    await asOwner();
    expect(await scalar<string>('select action_type from admin_actions where id = $1', [workBlind])).toBe('work_blind');
    expect(await scalar<boolean>('select admin_blinded from works where id = $1', [work])).toBe(true);
  });

  it('applies warn, timed and permanent suspension through the single sanction path', async () => {
    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const r1 = await report(reader, work, chapter);
    await op({ ids: [r1], action: 'warn', reason: 'first', publicReason: '경고 사유' });
    const r2 = await report(reader2, work, chapter);
    await op({ ids: [r2], action: 'suspend', reason: 'second', publicReason: '정지 사유', endsAt: until });
    await asOwner();
    const [cache] = await query('select sanction_kind, sanctioned_until from profiles where id = $1', [writer]);
    expect((cache as unknown as { sanction_kind: string }).sanction_kind).toBe('suspension');
    const r3 = await report(outsider, work, null);
    await op({ ids: [r3], chapterId: null, action: 'permanent_suspend', reason: 'third', publicReason: '영구 정지' });
    await asOwner();
    expect(await scalar<string>('select sanction_kind from profiles where id = $1', [writer])).toBe('permanent_suspension');
    const rows = await query(`select s.kind, s.public_reason, s.internal_note, a.action_type, a.target_user_id
      from user_sanctions s join admin_actions a on a.id = s.admin_action_id order by s.seq`);
    expect(rows).toEqual([
      { kind: 'warning', public_reason: '경고 사유', internal_note: 'first', action_type: 'user_warn', target_user_id: writer },
      { kind: 'suspension', public_reason: '정지 사유', internal_note: 'second', action_type: 'user_suspend', target_user_id: writer },
      { kind: 'permanent_suspension', public_reason: '영구 정지', internal_note: 'third',
        action_type: 'user_permanent_suspend', target_user_id: writer },
    ]);
  });

  it('returns the recorded action on retry and never repeats a sanction', async () => {
    const r1 = await report(reader, work, chapter);
    const key = crypto.randomUUID();
    const expected = await version(work, chapter);
    const first = await op({ key, ids: [r1], expected, action: 'warn', reason: 'i', publicReason: 'p' });
    // Retry with the stale pre-operation version: identical operation replays.
    const second = await op({ key, ids: [r1], expected, action: 'warn', reason: 'i', publicReason: 'p' });
    expect(second).toBe(first);
    await asOwner();
    expect(await scalar<number>('select count(*)::int from user_sanctions')).toBe(1);
    expect(await scalar<number>("select count(*)::int from admin_actions where action_type = 'user_warn'")).toBe(1);
    // Same key, different operation.
    await rejected(() => op({ key, ids: [r1], expected, action: 'dismiss' }), 'idempotency_conflict');
    const r2 = await report(reader2, work, chapter);
    await rejected(() => op({ key, ids: [r1, r2], action: 'warn', reason: 'i', publicReason: 'p' }), 'idempotency_conflict');
    expect((await reportRow(r2)).status).toBe('open');
  });

  it('rejects stale state: already handled reports or a changed target version', async () => {
    const r1 = await report(reader, work, chapter);
    const r2 = await report(reader2, work, chapter);
    const seen = await version(work, chapter);
    await op({ ids: [r1], action: 'dismiss' }); // another operator handles r1
    const before = await counts();
    await rejected(() => op({ ids: [r1, r2], expected: seen, action: 'blind', reason: 'i', publicReason: 'p' }), 'stale_target');
    await rejected(() => op({ ids: [r2], expected: seen, action: 'blind', reason: 'i', publicReason: 'p' }), 'stale_target');
    expect(await counts()).toEqual(before);
    // Fresh version but a reviewed report is no longer open: still stale.
    await rejected(() => op({ ids: [r1, r2], action: 'dismiss' }), 'stale_target');
    expect((await reportRow(r2)).status).toBe('open');
    // With the fresh version the remaining report can be handled.
    await op({ ids: [r2], action: 'blind', reason: 'i', publicReason: 'p' });
    const r3 = await report(outsider, work, chapter);
    await rejected(() => op({ ids: [r3], action: 'blind', reason: 'i', publicReason: 'p' }), 'stale_target'); // already blinded
    expect((await reportRow(r3)).status).toBe('open');
  });

  it('rolls back target, report and sanction changes when the audit write fails', async () => {
    const r1 = await report(reader, work, chapter);
    const before = await counts();
    await asOwner();
    await exec(`create function fail_audit() returns trigger language plpgsql as $$
      begin if new.reason = 'boom' then raise exception 'audit_write_failed'; end if; return new; end; $$;
      create trigger fail_audit before insert on admin_actions for each row execute function fail_audit();`);
    await rejected(() => op({ ids: [r1], action: 'blind', reason: 'boom', publicReason: 'p' }), 'audit_write_failed');
    await rejected(() => op({ ids: [r1], action: 'warn', reason: 'boom', publicReason: 'p' }), 'audit_write_failed');
    expect(await counts()).toEqual(before);

    // Failure after the audit insert (sanction validation) also rolls back the audit row.
    await rejected(() => op({ ids: [r1], action: 'suspend', reason: 'late', publicReason: 'p',
      endsAt: new Date(Date.now() - 86_400_000).toISOString() }), 'invalid_sanction_expiry');
    expect(await counts()).toEqual(before);
    expect((await reportRow(r1)).status).toBe('open');
  });

  it('refuses non-admin, revoked and self-sanctioning actors', async () => {
    const r1 = await report(reader, work, chapter);
    await rejected(() => op({ actor: outsider, ids: [r1], action: 'dismiss' }), 'actor_not_admin');
    await asOwner();
    await query("select grant_admin($1, 'writer admin', 'vitest')", [writer]);
    await rejected(() => op({ actor: writer, ids: [r1], action: 'warn', reason: 'i', publicReason: 'p' }),
      'self_sanction_forbidden');
    await asOwner();
    await query("select revoke_admin($1, 'left', 'vitest')", [admin]);
    await rejected(() => op({ ids: [r1], action: 'dismiss' }), 'actor_not_admin');
    expect((await reportRow(r1)).status).toBe('open');
  });

  it('unblinds only through the audited command and closes the open review request', async () => {
    const r1 = await report(reader, work, chapter);
    await op({ ids: [r1], action: 'blind', reason: 'i', publicReason: 'p' });
    await as(writer);
    await query('insert into moderation_review_requests(requester_id, work_id, chapter_id, message) values ($1, $2, $3, $4)',
      [writer, work, chapter, '수정했습니다']);
    const stale = await version(work, null); // wrong target version
    const expected = await version(work, chapter);
    await as(admin, 'service_role');
    await rejected(() => query('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), work, chapter, stale, 'r']), 'stale_target');
    await rejected(() => query('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), work, chapter, expected, ' ']), 'reason_required');
    const key = crypto.randomUUID();
    const id = await scalar<string>('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, key, work, chapter, expected, '수정 확인']);
    await as(admin, 'service_role');
    expect(await scalar<string>('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, key, work, chapter, expected, '수정 확인'])).toBe(id);
    await asOwner();
    expect(await query('select admin_blinded, admin_blind_reason, admin_blinded_at, is_published from chapters where id = $1', [chapter]))
      .toEqual([{ admin_blinded: false, admin_blind_reason: null, admin_blinded_at: null, is_published: true }]);
    const [request] = await query('select status, resolved_by, resolution_note from moderation_review_requests');
    expect(request).toEqual({ status: 'unblinded', resolved_by: admin, resolution_note: '수정 확인' });
    expect(await scalar<number>("select count(*)::int from admin_actions where action_type = 'chapter_unblind'")).toBe(1);
    // Not blinded anymore: another unblind is stale.
    await as(admin, 'service_role');
    await rejected(() => query('select unblind_moderation_target($1, $2, $3, $4, $5, $6)',
      [admin, crypto.randomUUID(), work, chapter, expected, 'again']), 'stale_target');
  });

  it('resolves review requests to an explicit maintained or unblinded outcome', async () => {
    const r1 = await report(reader, work, null);
    await op({ ids: [r1], chapterId: null, action: 'blind', reason: 'i', publicReason: 'p' });
    await as(writer);
    await query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)', [writer, work]);
    await asOwner();
    const request = await scalar<string>('select id from moderation_review_requests');
    const RESOLVE = 'select resolve_review_request($1, $2, $3, $4, $5, $6)';

    await as(admin, 'service_role');
    await rejected(() => query(RESOLVE, [admin, crypto.randomUUID(), request, 'maintained', 'v', '']), 'reason_required');
    await rejected(() => query(RESOLVE, [admin, crypto.randomUUID(), request, 'closed', 'v', 'r']), 'invalid_action');
    await rejected(() => query(RESOLVE, [admin, crypto.randomUUID(), crypto.randomUUID(), 'maintained', 'v', 'r']),
      'review_request_not_found');
    await rejected(() => query(RESOLVE, [admin, crypto.randomUUID(), request, 'maintained', 'old', 'r']), 'stale_target');

    const key = crypto.randomUUID();
    const expected = await version(work, null);
    await as(admin, 'service_role');
    const id = await scalar<string>(RESOLVE, [admin, key, request, 'maintained', expected, '여전히 위반']);
    await as(admin, 'service_role');
    expect(await scalar<string>(RESOLVE, [admin, key, request, 'maintained', expected, '여전히 위반'])).toBe(id);
    await rejected(() => query(RESOLVE, [admin, key, request, 'unblinded', expected, 'x']), 'idempotency_conflict');
    await asOwner();
    expect(await scalar<boolean>('select admin_blinded from works where id = $1', [work])).toBe(true);
    expect(await scalar<string>('select status from moderation_review_requests where id = $1', [request])).toBe('maintained');
    // Terminal: cannot be resolved again with a new key.
    const current = await version(work, null);
    await as(admin, 'service_role');
    await rejected(() => query(RESOLVE, [admin, crypto.randomUUID(), request, 'unblinded', current, 'x']), 'stale_target');

    // A fresh request can end unblinded, which clears the blind in the same transaction.
    await as(writer);
    await query('insert into moderation_review_requests(requester_id, work_id) values ($1, $2)', [writer, work]);
    await asOwner();
    const second = await scalar<string>("select id from moderation_review_requests where status = 'open'");
    const v2 = await version(work, null);
    await as(admin, 'service_role');
    await scalar(RESOLVE, [admin, crypto.randomUUID(), second, 'unblinded', v2, '수정 확인']);
    await asOwner();
    expect(await scalar<boolean>('select admin_blinded from works where id = $1', [work])).toBe(false);
    expect(await query("select action_type from admin_actions where target_review_request_id is not null order by action_type"))
      .toEqual([{ action_type: 'review_maintain' }, { action_type: 'review_unblind' }]);
  });

  it('lists complete target groups oldest first with page boundaries and status filters', async () => {
    const base = Date.parse('2026-01-01T00:00:00Z');
    const at = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    // Group A (chapter): oldest at 5, three reports. Group B (work-level): oldest at 1.
    // Group C (chapter2): oldest at 3. Group D (work2): resolved later.
    const a1 = await report(reader, work, chapter, '스팸/광고', at(5));
    await report(reader2, work, chapter, '기타', at(20));
    await report(reader, work, chapter, '스팸/광고', at(30));
    const b1 = await report(reader, work, null, '혐오·유해 콘텐츠', at(1));
    await report(outsider, work, chapter2, '기타', at(3));
    const d1 = await report(reader, work2, null, '기타', at(2));

    await as(admin, 'service_role');
    const all = await query("select * from list_report_groups('open', 25, 0)");
    expect(all.map((g) => [g.work_id, g.chapter_id])).toEqual([
      [work, null], [work2, null], [work, chapter2], [work, chapter],
    ]);
    const groupA = all[3] as Record<string, unknown>;
    expect(groupA).toMatchObject({
      work_title: 'Work', chapter_title: 'One', report_count: 3, reporter_count: 2,
      categories: ['기타', '스팸/광고'], anchor_report_id: a1, total_groups: 4, blinded: false,
    });
    expect(all[0]).toMatchObject({ chapter_title: null, anchor_report_id: b1, report_count: 1 });

    // Pages of 2 groups: no group split, stable order.
    const page1 = await query("select * from list_report_groups('open', 2, 0)");
    const page2 = await query("select * from list_report_groups('open', 2, 2)");
    expect([...page1, ...page2].map((g) => g.anchor_report_id)).toEqual(all.map((g) => g.anchor_report_id));
    expect(page2.map((g) => g.report_count)).toEqual([1, 3]);

    await op({ ids: [d1], workId: work2, chapterId: null, action: 'resolve' });
    await as(admin, 'service_role');
    expect((await query("select * from list_report_groups('open', 25, 0)")).length).toBe(3);
    expect((await query("select * from list_report_groups('resolved', 25, 0)")).map((g) => g.work_id)).toEqual([work2]);
    expect(await query("select * from list_report_groups('dismissed', 25, 0)")).toEqual([]);
    await rejected(() => query("select * from list_report_groups('all', 25, 0)"), 'invalid_status');
    await rejected(() => query("select * from list_report_groups('open', 0, 0)"), 'invalid_page');
  });

  it('returns detail with all target reports, body, reviewed IDs and author history', async () => {
    // now() is constant inside the outer test transaction, so give reports explicit times.
    const old = await report(reader, work2, null, '기타', '2026-01-01T00:00:00Z');
    await op({ ids: [old], workId: work2, chapterId: null, action: 'warn', reason: '과거 경고', publicReason: '경고' });
    const r1 = await report(reader, work, chapter, '스팸/광고', '2026-01-02T00:00:00Z');
    const r2 = await report(reader2, work, chapter, '기타', '2026-01-03T00:00:00Z');
    await op({ ids: [r2], action: 'dismiss' });
    const r3 = await report(outsider, work, chapter, '스팸/광고', '2026-01-04T00:00:00Z');

    await as(admin, 'service_role');
    const detail = await scalar<Record<string, unknown>>('select get_report_group_detail($1)', [r3]);
    expect(detail).toMatchObject({
      work_id: work, chapter_id: chapter, work_title: 'Work', chapter_title: 'One', author_id: writer,
      author_pen_name: 'Writer', target_body: 'chapter body', blinded: false,
    });
    expect((detail.reports as { id: string }[]).map((r) => r.id)).toEqual([r1, r2, r3]);
    expect(detail.reviewed_report_ids).toEqual([r1, r3].sort());
    expect(detail.target_version).toBe(await version(work, chapter));
    expect((detail.author_report_history as { id: string }[]).map((r) => r.id)).toEqual([old]);
    const actions = detail.author_action_history as { action_type: string }[];
    expect(actions.map((a) => a.action_type).sort()).toEqual(['report_dismiss', 'user_warn']);
    expect(JSON.stringify(detail)).not.toContain('idempotency');

    await as(admin, 'service_role');
    const workDetail = await scalar<Record<string, unknown>>('select get_report_group_detail($1)', [old]);
    expect(workDetail).toMatchObject({ chapter_id: null, chapter_title: null, target_body: null });
    expect(await scalar('select get_report_group_detail($1)', [crypto.randomUUID()])).toBeNull();
  });

  it('lists review requests separately, oldest first, with detail', async () => {
    await asOwner();
    await query("update chapters set admin_blinded = true, admin_blind_reason = 'r', admin_blinded_at = now() where id in ($1, $2)",
      [chapter, chapter2]);
    await as(writer);
    await rejected(() => query(
      "insert into moderation_review_requests(requester_id, work_id, chapter_id, created_at) values ($1, $2, $3, '2026-01-02')",
      [writer, work, chapter]), 'permission denied');
    await query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapter2]);
    await query('insert into moderation_review_requests(requester_id, work_id, chapter_id) values ($1, $2, $3)',
      [writer, work, chapter]);
    await asOwner();
    // created_at is not insertable by writers; order the rows deterministically as owner.
    await query("update moderation_review_requests set created_at = '2026-01-05' where chapter_id = $1", [chapter2]);
    await query("update moderation_review_requests set created_at = '2026-01-01' where chapter_id = $1", [chapter]);

    await as(admin, 'service_role');
    const open = await query("select * from list_review_requests('open', 25, 0)");
    expect(open.map((r) => r.chapter_id)).toEqual([chapter, chapter2]);
    expect(open[0]).toMatchObject({ work_title: 'Work', chapter_title: 'One', requester_id: writer, total_requests: 2 });
    expect(await query("select * from list_review_requests('maintained', 25, 0)")).toEqual([]);

    const detail = await scalar<Record<string, unknown>>('select get_review_request_detail($1)', [open[1].id]);
    expect(detail).toMatchObject({ chapter_id: chapter2, target_body: 'second body', blinded: true, public_blind_reason: 'r',
      status: 'open', target_version: await version(work, chapter2) });
  });
});
