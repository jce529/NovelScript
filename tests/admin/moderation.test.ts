import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

import type { AdminAuthDeps } from '../../lib/admin/auth';
import * as actions from '../../lib/admin/actions';
import * as queries from '../../lib/admin/queries';
import {
  getReportDetail,
  getReviewRequestDetail,
  listReportGroups,
  listReviewRequests,
  ADMIN_PAGE_SIZE,
} from '../../lib/admin/queries';
import { moderateReportGroup, resolveReviewRequest, unblindTarget } from '../../lib/admin/actions';

const adminId = '10000000-0000-4000-8000-000000000003';
const writerId = '10000000-0000-4000-8000-000000000001';
const workId = '20000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';
const reportA = '40000000-0000-4000-8000-00000000000a';
const reportB = '40000000-0000-4000-8000-00000000000b';
const requestId = '60000000-0000-4000-8000-000000000001';
const key = '70000000-0000-4000-8000-000000000001';
const actionId = '50000000-0000-4000-8000-000000000009';

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

function world(opts: { admin?: boolean; authDown?: boolean; rpc?: (fn: string, args: unknown) => RpcResult } = {}) {
  const isAdmin = opts.admin ?? true;
  const rpc = vi.fn(async (fn: string, args: unknown) => (opts.rpc ? opts.rpc(fn, args) : { data: null, error: null }));
  const from = vi.fn((table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      maybeSingle: async () => {
        if (opts.authDown) return { data: null, error: { message: 'down' } };
        if (table === 'profiles') return { data: { id: adminId, role: 'reader', deleted_at: null }, error: null };
        return { data: isAdmin ? { id: 'membership' } : null, error: null };
      },
    };
    return builder;
  });
  const client = { from, rpc } as unknown as SupabaseClient;
  const deps: AdminAuthDeps = {
    getSessionClient: async () =>
      ({ auth: { getUser: async () => ({ data: { user: { id: adminId } }, error: null }) } }) as unknown as SupabaseClient,
    getAdminClient: () => client,
  };
  return { deps, rpc };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });

function groupRow(i: number, chapter: string | null = chapterId) {
  return {
    work_id: workId, chapter_id: chapter, work_title: `Work ${i}`, chapter_title: chapter ? 'One' : null,
    cover_image_url: null, blinded: false, report_count: 2, reporter_count: 2,
    categories: ['기타', '스팸/광고'], oldest_reported_at: '2026-01-01T00:00:00+00:00',
    anchor_report_id: reportA, total_groups: 30,
    // Extra columns must never leak into DTOs.
    idempotency_key: key, service_role_key: 'secret',
  };
}

const validCommand = {
  idempotencyKey: key, workId, chapterId, reportIds: [reportA, reportB], targetVersion: 'v1',
  action: 'blind' as const, reason: '  내부 메모 ', publicReason: ' 운영 정책 위반 ',
};

describe('every exported admin operation authorizes independently', () => {
  const calls: [string, (deps: AdminAuthDeps) => Promise<unknown>][] = [
    ['listReportGroups', (d) => listReportGroups({}, d)],
    ['getReportDetail', (d) => getReportDetail(reportA, d)],
    ['listReviewRequests', (d) => listReviewRequests({}, d)],
    ['getReviewRequestDetail', (d) => getReviewRequestDetail(requestId, d)],
    ['moderateReportGroup', (d) => moderateReportGroup(validCommand, d)],
    ['unblindTarget', (d) => unblindTarget({ idempotencyKey: key, workId, chapterId, targetVersion: 'v', reason: 'r' }, d)],
    ['resolveReviewRequest', (d) => resolveReviewRequest(
      { idempotencyKey: key, requestId, outcome: 'maintained', targetVersion: 'v', reason: 'r' }, d)],
  ];

  it('covers every exported function', () => {
    const exported = [...Object.entries(actions), ...Object.entries(queries)]
      .filter(([, value]) => typeof value === 'function').map(([name]) => name).sort();
    expect(exported).toEqual(calls.map(([name]) => name).sort());
  });

  it.each(calls)('%s returns not_found for non-admins without any RPC', async (_name, call) => {
    const { deps, rpc } = world({ admin: false });
    expect(await call(deps)).toEqual({ ok: false, error: 'not_found' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(calls)('%s fails closed when authorization is unavailable', async (_name, call) => {
    const { deps, rpc } = world({ authDown: true });
    expect(await call(deps)).toEqual({ ok: false, error: 'unavailable' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('listReportGroups', () => {
  it('defaults to open, first page, and asks for one extra group', async () => {
    const { deps, rpc } = world({ rpc: () => ok([groupRow(1)]) });
    const result = await listReportGroups(undefined, deps);
    expect(rpc).toHaveBeenCalledWith('list_report_groups', { p_status: 'open', p_limit: 26, p_offset: 0 });
    expect(result).toEqual({
      ok: true,
      data: {
        items: [{
          target: { type: 'chapter', workId, chapterId }, workTitle: 'Work 1', chapterTitle: 'One',
          coverImageUrl: null, reportCount: 2, reporterCount: 2, categories: ['기타', '스팸/광고'],
          oldestReportedAt: '2026-01-01T00:00:00+00:00', status: 'open', blinded: false, anchorReportId: reportA,
        }],
        page: 1, pageSize: 25, totalCount: 30, hasNext: false,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|idempotency/);
  });

  it('pages by complete groups and reports a next page only when a 26th group exists', async () => {
    const full = Array.from({ length: ADMIN_PAGE_SIZE + 1 }, (_, i) => groupRow(i));
    const { deps, rpc } = world({ rpc: () => ok(full) });
    const result = await listReportGroups({ status: 'resolved', page: '2' }, deps);
    expect(rpc).toHaveBeenCalledWith('list_report_groups', { p_status: 'resolved', p_limit: 26, p_offset: 25 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items).toHaveLength(25);
    expect(result.data.hasNext).toBe(true);
    expect(result.data.items.every((g) => g.status === 'resolved')).toBe(true);
  });

  it('distinguishes work-level targets from chapter targets', async () => {
    const { deps } = world({ rpc: () => ok([groupRow(1, null), groupRow(2)]) });
    const result = await listReportGroups({ status: 'dismissed' }, deps);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items.map((g) => g.target)).toEqual([
      { type: 'work', workId, chapterId: null },
      { type: 'chapter', workId, chapterId },
    ]);
    expect(result.data.items[0].chapterTitle).toBeNull();
  });

  it('returns an empty page past the end', async () => {
    const { deps } = world({ rpc: () => ok([]) });
    expect(await listReportGroups({ page: 9 }, deps)).toEqual({
      ok: true, data: { items: [], page: 9, pageSize: 25, totalCount: 0, hasNext: false },
    });
  });

  it.each([{ status: 'all' }, { page: 0 }, { page: -1 }, { page: 'x' }, { page: 1.5 }])(
    'rejects invalid filters without an RPC: %j', async (input) => {
      const { deps, rpc } = world();
      expect(await listReportGroups(input, deps)).toEqual({ ok: false, error: 'validation_failed' });
      expect(rpc).not.toHaveBeenCalled();
    });

  it('hides database errors', async () => {
    const { deps } = world({ rpc: () => ({ data: null, error: { message: 'relation secret_table does not exist' } }) });
    expect(await listReportGroups({}, deps)).toEqual({ ok: false, error: 'unavailable' });
  });
});

describe('getReportDetail', () => {
  const detailRow = {
    work_id: workId, chapter_id: chapterId, work_title: 'Work', chapter_title: 'One', author_id: writerId,
    author_pen_name: 'Writer', target_body: '<script>alert(1)</script> 본문', blinded: true, public_blind_reason: '사유',
    target_version: 'abc', reviewed_report_ids: [reportA],
    reports: [
      { id: reportA, reporter_id: adminId, work_id: workId, chapter_id: chapterId, reason_category: '기타', detail: 'd',
        status: 'open', created_at: '2026-01-01T00:00:00+00:00', resolved_at: null, resolution_note: null, secret: 'x' },
    ],
    author_report_history: [
      { id: reportB, reporter_id: adminId, work_id: workId, chapter_id: null, reason_category: '스팸/광고', detail: null,
        status: 'resolved', created_at: '2025-12-01T00:00:00+00:00', resolved_at: '2025-12-02T00:00:00+00:00',
        resolution_note: '메모' },
    ],
    author_action_history: [
      { id: actionId, actor_id: adminId, action_type: 'user_warn', work_id: workId, chapter_id: null,
        target_user_id: writerId, reason: 'internal', public_reason: 'public', created_at: '2025-12-02T00:00:00+00:00',
        idempotency_key: key, metadata: { ends_at: null } },
      { id: 'x', action_type: 'unknown_type', created_at: '2025-12-02T00:00:00+00:00' },
    ],
    service_role_key: 'secret',
  };

  it('loads the whole target group, body, reviewed IDs, version and author history', async () => {
    const { deps, rpc } = world({ rpc: () => ok(detailRow) });
    const result = await getReportDetail(reportB, deps);
    expect(rpc).toHaveBeenCalledWith('get_report_group_detail', { p_anchor_report_id: reportB });
    expect(result).toEqual({
      ok: true,
      data: {
        target: { type: 'chapter', workId, chapterId }, workTitle: 'Work', chapterTitle: 'One',
        authorId: writerId, authorPenName: 'Writer', targetBody: '<script>alert(1)</script> 본문',
        blinded: true, publicBlindReason: '사유',
        reports: [{ id: reportA, target: { type: 'chapter', workId, chapterId }, reporterId: adminId,
          reasonCategory: '기타', detail: 'd', status: 'open', createdAt: '2026-01-01T00:00:00+00:00',
          resolvedAt: null, resolutionNote: null }],
        reviewedReportIds: [reportA], targetVersion: 'abc',
        authorReportHistory: [{ id: reportB, target: { type: 'work', workId, chapterId: null }, reporterId: adminId,
          reasonCategory: '스팸/광고', detail: null, status: 'resolved', createdAt: '2025-12-01T00:00:00+00:00',
          resolvedAt: '2025-12-02T00:00:00+00:00', resolutionNote: '메모' }],
        authorActionHistory: [{ id: actionId, actorId: adminId, actionType: 'user_warn',
          target: { type: 'work', workId, chapterId: null }, targetUserId: writerId, reason: 'internal',
          publicReason: 'public', createdAt: '2025-12-02T00:00:00+00:00' }],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|idempotency|metadata/);
  });

  it('returns not_found for a missing anchor and validation_failed for a bad ID', async () => {
    const missing = world({ rpc: () => ok(null) });
    expect(await getReportDetail(reportA, missing.deps)).toEqual({ ok: false, error: 'not_found' });
    const bad = world();
    expect(await getReportDetail('not-a-uuid', bad.deps)).toEqual({ ok: false, error: 'validation_failed' });
    expect(bad.rpc).not.toHaveBeenCalled();
  });
});

describe('review request queue', () => {
  const summary = {
    id: requestId, work_id: workId, chapter_id: null, work_title: 'Work', chapter_title: null, requester_id: writerId,
    message: '수정했습니다', status: 'open', created_at: '2026-01-01T00:00:00+00:00', resolved_at: null, total_requests: 1,
  };

  it('lists open requests oldest first as a separate queue', async () => {
    const { deps, rpc } = world({ rpc: () => ok([summary]) });
    const result = await listReviewRequests({}, deps);
    expect(rpc).toHaveBeenCalledWith('list_review_requests', { p_status: 'open', p_limit: 26, p_offset: 0 });
    expect(result).toEqual({
      ok: true,
      data: {
        items: [{ id: requestId, target: { type: 'work', workId, chapterId: null }, workTitle: 'Work', chapterTitle: null,
          requesterId: writerId, message: '수정했습니다', status: 'open', createdAt: '2026-01-01T00:00:00+00:00',
          resolvedAt: null }],
        page: 1, pageSize: 25, totalCount: 1, hasNext: false,
      },
    });
    const invalid = world();
    expect(await listReviewRequests({ status: 'resolved' }, invalid.deps)).toEqual({ ok: false, error: 'validation_failed' });
    expect(invalid.rpc).not.toHaveBeenCalled();
  });

  it('maps request detail with target body and version', async () => {
    const { deps } = world({ rpc: () => ok({ ...summary, resolution_note: null, target_body: 'synopsis', blinded: true,
      public_blind_reason: '사유', target_version: 'v9', target_action_history: [] }) });
    const result = await getReviewRequestDetail(requestId, deps);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data).toMatchObject({ targetBody: 'synopsis', blinded: true, targetVersion: 'v9', targetActionHistory: [] });
    expect(result.data).not.toHaveProperty('total_requests');
  });
});

describe('moderateReportGroup', () => {
  it('sends the session actor, trimmed reasons and the exact reviewed set', async () => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const forged = { ...validCommand, actorId: writerId, p_actor_id: writerId } as typeof validCommand;
    expect(await moderateReportGroup(forged, deps)).toEqual({ ok: true, data: { actionId } });
    expect(rpc).toHaveBeenCalledWith('moderate_report_group', {
      p_actor_id: adminId, p_idempotency_key: key, p_work_id: workId, p_chapter_id: chapterId,
      p_report_ids: [reportA, reportB], p_expected_version: 'v1', p_action: 'blind',
      p_reason: '내부 메모', p_public_reason: '운영 정책 위반', p_ends_at: null,
    });
  });

  it('allows dismissal without a note and passes a work-level null chapter', async () => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const result = await moderateReportGroup({ ...validCommand, chapterId: null, action: 'dismiss', reason: '  ',
      publicReason: null }, deps);
    expect(result.ok).toBe(true);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_chapter_id: null, p_action: 'dismiss', p_reason: null, p_public_reason: null });
  });

  it('passes a future expiry for timed suspension', async () => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    await moderateReportGroup({ ...validCommand, action: 'suspend', endsAt }, deps);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_action: 'suspend', p_ends_at: endsAt });
  });

  it.each([
    ['blank reason', { reason: '   ' }, 'reason_required'],
    ['missing public reason', { action: 'warn', publicReason: '' }, 'reason_required'],
    ['suspend without expiry', { action: 'suspend' }, 'validation_failed'],
    ['suspend in the past', { action: 'suspend', endsAt: '2020-01-01T00:00:00Z' }, 'validation_failed'],
    ['expiry on a warning', { action: 'warn', endsAt: '2099-01-01T00:00:00Z' }, 'validation_failed'],
    ['unknown action', { action: 'delete' }, 'validation_failed'],
    ['no reports', { reportIds: [] }, 'validation_failed'],
    ['duplicate reports', { reportIds: [reportA, reportA] }, 'validation_failed'],
    ['bad report ID', { reportIds: ['x'] }, 'validation_failed'],
    ['missing idempotency key', { idempotencyKey: undefined }, 'validation_failed'],
    ['missing version', { targetVersion: '' }, 'validation_failed'],
    ['bad work ID', { workId: '1' }, 'validation_failed'],
  ])('rejects %s without a mutation call', async (_name, patch, error) => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const result = await moderateReportGroup({ ...validCommand, ...patch } as typeof validCommand, deps);
    expect(result).toMatchObject({ ok: false, error });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns field errors for the form', async () => {
    const { deps } = world();
    const result = await moderateReportGroup({ ...validCommand, reason: '', publicReason: '' }, deps);
    expect(result).toEqual({ ok: false, error: 'reason_required', fieldErrors: {
      reason: '조치 사유를 입력해 주세요.', publicReason: '조치 사유를 입력해 주세요.' } });
  });

  it.each([
    ['stale_target', undefined, 'stale_target'],
    ['idempotency_conflict', undefined, 'conflict'],
    ['duplicate key value violates unique constraint', '23505', 'conflict'],
    ['report_target_mismatch', undefined, 'validation_failed'],
    ['self_sanction_forbidden', undefined, 'validation_failed'],
    ['actor_not_admin', undefined, 'not_found'],
    ['connection to 10.0.0.1 failed: password for service_role', undefined, 'unavailable'],
  ])('maps database error %s to a safe code', async (message, code, error) => {
    const { deps } = world({ rpc: () => ({ data: null, error: { message, code } }) });
    const result = await moderateReportGroup(validCommand, deps);
    expect(result).toEqual({ ok: false, error });
  });
});

describe('unblindTarget and resolveReviewRequest', () => {
  it('unblinds with session actor and requires a reason', async () => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const input = { idempotencyKey: key, workId, chapterId: null, targetVersion: 'v', reason: ' 수정 확인 ' };
    expect(await unblindTarget(input, deps)).toEqual({ ok: true, data: { actionId } });
    expect(rpc).toHaveBeenCalledWith('unblind_moderation_target', {
      p_actor_id: adminId, p_idempotency_key: key, p_work_id: workId, p_chapter_id: null,
      p_expected_version: 'v', p_reason: '수정 확인',
    });
    const blank = world();
    expect(await unblindTarget({ ...input, reason: ' ' }, blank.deps)).toMatchObject({ ok: false, error: 'reason_required' });
    expect(blank.rpc).not.toHaveBeenCalled();
  });

  it('resolves a review request to an explicit outcome', async () => {
    const { deps, rpc } = world({ rpc: () => ok(actionId) });
    const input = { idempotencyKey: key, requestId, outcome: 'unblinded' as const, targetVersion: 'v', reason: '확인' };
    expect(await resolveReviewRequest(input, deps)).toEqual({ ok: true, data: { actionId } });
    expect(rpc).toHaveBeenCalledWith('resolve_review_request', {
      p_actor_id: adminId, p_idempotency_key: key, p_request_id: requestId, p_outcome: 'unblinded',
      p_expected_version: 'v', p_reason: '확인',
    });
    const invalid = world();
    expect(await resolveReviewRequest({ ...input, outcome: 'closed' } as unknown as typeof input, invalid.deps))
      .toMatchObject({ ok: false, error: 'validation_failed' });
    expect(invalid.rpc).not.toHaveBeenCalled();

    const stale = world({ rpc: () => ({ data: null, error: { message: 'stale_target' } }) });
    expect(await resolveReviewRequest(input, stale.deps)).toEqual({ ok: false, error: 'stale_target' });
  });
});
