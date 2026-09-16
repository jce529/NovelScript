import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * 07-05 Server Action boundary. app/admin/actions.ts is a public endpoint: these tests
 * call it directly (as a forged POST would) with the session and service-role clients
 * mocked at the module boundary, and assert that authorization, validation and exact
 * command binding happen before any RPC or cache revalidation.
 */

const h = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  isAdmin: true,
  authDown: false,
  rpcError: null as { message: string; code?: string } | null,
  rpc: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
  revalidatePath: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

vi.mock('next/cache', () => {
  h.revalidatePath = vi.fn();
  return { revalidatePath: h.revalidatePath };
});
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sessionUserId
          ? { data: { user: { id: h.sessionUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => {
  h.rpc = vi.fn(async () => (h.rpcError ? { data: null, error: h.rpcError } : { data: ACTION_ID, error: null }));
  return {
    createAdminClient: () => ({
      rpc: h.rpc,
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          maybeSingle: async () => {
            if (h.authDown) return { data: null, error: { message: 'down' } };
            if (table === 'profiles') return { data: { id: h.sessionUserId, role: 'reader', deleted_at: null }, error: null };
            return { data: h.isAdmin ? { id: 'membership' } : null, error: null };
          },
        };
        return builder;
      },
    }),
  };
});

const ACTION_ID = '50000000-0000-4000-8000-000000000009';
const adminId = '10000000-0000-4000-8000-000000000003';
const forgedActor = '10000000-0000-4000-8000-0000000000ff';
const workId = '20000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';
const reportA = '40000000-0000-4000-8000-00000000000a';
const reportB = '40000000-0000-4000-8000-00000000000b';
const requestId = '60000000-0000-4000-8000-000000000001';
const key = '70000000-0000-4000-8000-000000000001';

import * as serverActions from '../../app/admin/actions';
import {
  moderateReportGroupAction,
  resolveReviewRequestAction,
  unblindTargetAction,
} from '../../app/admin/actions';
import { parseQueueParams, queueHref } from '../../lib/admin/queue-params';

const blind = {
  idempotencyKey: key,
  workId,
  chapterId,
  reportIds: [reportA, reportB],
  targetVersion: 'v1',
  action: 'blind' as const,
  reason: ' 내부 메모 ',
  publicReason: ' 운영 정책 위반 ',
};
const unblind = { idempotencyKey: key, workId, chapterId, targetVersion: 'v2', reason: '수정 확인' };
const review = { idempotencyKey: key, requestId, outcome: 'unblinded' as const, targetVersion: 'v3', reason: '수정됨' };

const invocations: [string, () => Promise<unknown>][] = [
  ['moderateReportGroupAction', () => moderateReportGroupAction(blind)],
  ['unblindTargetAction', () => unblindTargetAction(unblind)],
  ['resolveReviewRequestAction', () => resolveReviewRequestAction(review)],
];

beforeEach(() => {
  h.sessionUserId = adminId;
  h.isAdmin = true;
  h.authDown = false;
  h.rpcError = null;
  h.rpc.mockClear();
  h.revalidatePath.mockClear();
});

describe('server action module surface', () => {
  it("is a 'use server' module exporting exactly the three guarded commands", () => {
    const source = readFileSync(path.resolve(__dirname, '../../app/admin/actions.ts'), 'utf8');
    expect(source.trimStart().startsWith("'use server'")).toBe(true);
    const exported = Object.entries(serverActions)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();
    expect(exported).toEqual(invocations.map(([name]) => name).sort());
  });
});

describe('direct unauthorized invocation has no side effects', () => {
  it.each(invocations)('%s: non-admin session gets not_found, no RPC, no revalidation', async (_name, call) => {
    h.isAdmin = false;
    expect(await call()).toEqual({ ok: false, error: 'not_found' });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(invocations)('%s: no session gets not_found, no RPC, no revalidation', async (_name, call) => {
    h.sessionUserId = null;
    expect(await call()).toEqual({ ok: false, error: 'not_found' });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(invocations)('%s: authorization backend failure fails closed', async (_name, call) => {
    h.authDown = true;
    expect(await call()).toEqual({ ok: false, error: 'unavailable' });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it('a malformed non-object payload is rejected without an RPC', async () => {
    const result = await moderateReportGroupAction(null as never);
    expect(result.ok).toBe(false);
    expect(h.rpc).not.toHaveBeenCalled();
  });
});

describe('forged actor input is ignored', () => {
  it('moderation always binds the session administrator', async () => {
    const forged = { ...blind, actorId: forgedActor, p_actor_id: forgedActor, actor: { userId: forgedActor } };
    expect(await moderateReportGroupAction(forged as never)).toEqual({ ok: true, data: { actionId: ACTION_ID } });
    const [, args] = h.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(args.p_actor_id).toBe(adminId);
    expect(JSON.stringify(args)).not.toContain(forgedActor);
  });

  it('unblind and review commands also bind the session administrator', async () => {
    await unblindTargetAction({ ...unblind, actorId: forgedActor } as never);
    await resolveReviewRequestAction({ ...review, actorId: forgedActor } as never);
    for (const [, args] of h.rpc.mock.calls as [string, Record<string, unknown>][]) {
      expect(args.p_actor_id).toBe(adminId);
      expect(JSON.stringify(args)).not.toContain(forgedActor);
    }
  });
});

describe('validation happens before any write', () => {
  it.each(['blind', 'warn', 'suspend', 'permanent_suspend'] as const)(
    '%s without reasons returns reason_required with field errors',
    async (action) => {
      const result = await moderateReportGroupAction({
        ...blind,
        action,
        reason: '   ',
        publicReason: '',
        endsAt: action === 'suspend' ? new Date(Date.now() + 86_400_000).toISOString() : null,
      });
      expect(result).toMatchObject({
        ok: false,
        error: 'reason_required',
        fieldErrors: { reason: '조치 사유를 입력해 주세요.', publicReason: '조치 사유를 입력해 주세요.' },
      });
      expect(h.rpc).not.toHaveBeenCalled();
      expect(h.revalidatePath).not.toHaveBeenCalled();
    }
  );

  it('dismissal does not require a reason', async () => {
    const result = await moderateReportGroupAction({ ...blind, action: 'dismiss', reason: '', publicReason: null });
    expect(result.ok).toBe(true);
    const [fn, args] = h.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('moderate_report_group');
    expect(args).toMatchObject({ p_action: 'dismiss', p_reason: null, p_public_reason: null });
  });

  it('timed suspension needs a future expiry', async () => {
    const past = await moderateReportGroupAction({ ...blind, action: 'suspend', endsAt: '2020-01-01T00:00:00Z' });
    expect(past).toMatchObject({ ok: false, error: 'validation_failed', fieldErrors: { endsAt: 'expiry_in_past' } });
    const missing = await moderateReportGroupAction({ ...blind, action: 'suspend', endsAt: null });
    expect(missing).toMatchObject({ ok: false, fieldErrors: { endsAt: 'expiry_required' } });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('permanent suspension cannot carry an expiry', async () => {
    const result = await moderateReportGroupAction({
      ...blind,
      action: 'permanent_suspend',
      endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: { endsAt: 'expiry_not_allowed' } });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID retry key, empty reviewed set and missing unblind/review reasons', async () => {
    expect((await moderateReportGroupAction({ ...blind, idempotencyKey: 'retry-1' })).ok).toBe(false);
    expect((await moderateReportGroupAction({ ...blind, reportIds: [] })).ok).toBe(false);
    expect(await unblindTargetAction({ ...unblind, reason: '  ' })).toMatchObject({ ok: false, error: 'reason_required' });
    expect(await resolveReviewRequestAction({ ...review, reason: '' })).toMatchObject({ ok: false, error: 'reason_required' });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('exact command binding', () => {
  it('blind sends the reviewed IDs, version, retry key and trimmed reasons', async () => {
    await moderateReportGroupAction(blind);
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith('moderate_report_group', {
      p_actor_id: adminId,
      p_idempotency_key: key,
      p_work_id: workId,
      p_chapter_id: chapterId,
      p_report_ids: [reportA, reportB],
      p_expected_version: 'v1',
      p_action: 'blind',
      p_reason: '내부 메모',
      p_public_reason: '운영 정책 위반',
      p_ends_at: null,
    });
  });

  it('warning, timed and permanent suspension stay distinct', async () => {
    const endsAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    await moderateReportGroupAction({ ...blind, action: 'warn' });
    await moderateReportGroupAction({ ...blind, action: 'suspend', endsAt });
    await moderateReportGroupAction({ ...blind, action: 'permanent_suspend', endsAt: null });
    const calls = (h.rpc.mock.calls as [string, Record<string, unknown>][]).map(([, a]) => [a.p_action, a.p_ends_at]);
    expect(calls).toEqual([
      ['warn', null],
      ['suspend', endsAt],
      ['permanent_suspend', null],
    ]);
  });

  it('work-level targets send a null chapter', async () => {
    await moderateReportGroupAction({ ...blind, chapterId: null, action: 'resolve' });
    expect((h.rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_chapter_id).toBeNull();
  });

  it('unblind binds unblind_moderation_target', async () => {
    await unblindTargetAction(unblind);
    expect(h.rpc).toHaveBeenCalledWith('unblind_moderation_target', {
      p_actor_id: adminId,
      p_idempotency_key: key,
      p_work_id: workId,
      p_chapter_id: chapterId,
      p_expected_version: 'v2',
      p_reason: '수정 확인',
    });
  });

  it.each(['maintained', 'unblinded'] as const)('review outcome %s binds resolve_review_request', async (outcome) => {
    await resolveReviewRequestAction({ ...review, outcome });
    expect(h.rpc).toHaveBeenCalledWith('resolve_review_request', {
      p_actor_id: adminId,
      p_idempotency_key: key,
      p_request_id: requestId,
      p_outcome: outcome,
      p_expected_version: 'v3',
      p_reason: '수정됨',
    });
  });
});

describe('revalidation only after successful writes', () => {
  it('success revalidates admin queue/detail, reader and studio routes', async () => {
    await moderateReportGroupAction(blind);
    expect(h.revalidatePath).toHaveBeenCalledWith('/admin', 'layout');
    expect(h.revalidatePath).toHaveBeenCalledWith('/works/[workId]', 'layout');
    expect(h.revalidatePath).toHaveBeenCalledWith('/studio', 'layout');
  });

  it.each([
    ['stale_target: reviewed reports changed', 'stale_target'],
    ['idempotency_conflict', 'conflict'],
    ['connection reset', 'unavailable'],
  ])('RPC failure "%s" maps to %s without revalidation or raw message', async (message, code) => {
    h.rpcError = { message };
    const result = await moderateReportGroupAction(blind);
    expect(result).toEqual({ ok: false, error: code });
    expect(JSON.stringify(result)).not.toContain('reset');
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('queue URL state', () => {
  it('defaults to the open report queue and ignores unknown values', () => {
    expect(parseQueueParams({})).toEqual({ tab: 'reports', status: 'open', page: 1 });
    expect(parseQueueParams({ tab: 'x', status: 'deleted', page: '-3' })).toEqual({ tab: 'reports', status: 'open', page: 1 });
    expect(parseQueueParams({ tab: 'reviews', page: '2' })).toEqual({ tab: 'reviews', status: 'open', page: 2 });
  });

  it('round-trips historical status and page, and always stays under /admin', () => {
    const state = parseQueueParams({ status: 'dismissed', page: '3' });
    expect(queueHref(state)).toBe('/admin?status=dismissed&page=3');
    expect(parseQueueParams(Object.fromEntries(new URLSearchParams(queueHref(state).split('?')[1])))).toEqual(state);
    expect(queueHref(parseQueueParams({ tab: '//evil.example', status: 'https://evil', page: '1e9' }))).toBe('/admin');
  });
});

describe('admin UI never renders user text as HTML', () => {
  const roots = ['app/admin', 'components/admin'].map((dir) => path.resolve(__dirname, '../..', dir));
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) files.push(full);
    }
  };
  roots.forEach(walk);

  it('has admin UI files to scan', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(['dangerouslySetInnerHTML', 'innerHTML'])('no %s in admin routes/components', (needle) => {
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toContain(needle);
  });

  it('forms never send an actor identity', () => {
    const form = readFileSync(path.resolve(__dirname, '../../components/admin/moderation-form.tsx'), 'utf8');
    expect(form).not.toMatch(/actorId|p_actor_id|userId/);
  });
});
