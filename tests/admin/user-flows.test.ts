import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * 07-06 user flows. A small in-memory fake emulates the RLS rules from 0006/0008 that these
 * flows rely on (own-row reads, recipient-only acknowledge_warning, owner+blinded insert policy,
 * one open request per target, restrictive write policy), so the domain code and the public
 * Server Action wrappers are exercised against the same boundaries the database enforces.
 * Rendering is not covered here; browser checks are recorded in 07-07.
 */

const h = vi.hoisted(() => ({
  client: null as unknown,
  sessionUserId: null as string | null,
  revalidatePath: null as unknown as ReturnType<typeof import('vitest').vi.fn>,
}));

vi.mock('next/cache', () => {
  h.revalidatePath = vi.fn();
  return { revalidatePath: h.revalidatePath };
});
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import {
  getAccountNotices, getReviewTargetState, requestReview,
  REVIEW_ERRORS, SUSPENSION_DENIAL_COPY, NOTICE_ACK_ERROR,
} from '../../lib/moderation/user-actions';
import {
  acknowledgeWarningAction, getAccountNoticesAction, getReviewPanelStateAction, requestReviewAction,
} from '../../lib/moderation/actions';
import { saveChapterContent, type PublicChapter, type PublicChapterListItem } from '../../lib/chapters/actions';
import { viewerLockModel, tocRowBadge, BLINDED_ENTITLED_NOTE, BLINDED_VIEWER_TITLE } from '../../lib/moderation/user-actions';
import { purchaseChapterAction, trackChapterOpenAction } from '../../app/works/[workId]/chapters/[chapterId]/actions';
import { PURCHASE_BLINDED_MESSAGE, PURCHASE_UNAVAILABLE_MESSAGE } from '../../lib/commerce/actions';

export const WRITER = '10000000-0000-4000-8000-000000000001';
export const STRANGER = '10000000-0000-4000-8000-000000000002';
export const WORK = '20000000-0000-4000-8000-000000000001';
export const OTHER_WORK = '20000000-0000-4000-8000-000000000002';
export const CHAPTER = '30000000-0000-4000-8000-000000000001';
export const OTHER_CHAPTER = '30000000-0000-4000-8000-000000000002';
const WARN_1 = '60000000-0000-4000-8000-000000000001';
const WARN_2 = '60000000-0000-4000-8000-000000000002';
const WARN_STRANGER = '60000000-0000-4000-8000-000000000003';

type Row = Record<string, unknown>;
type Sanction = 'none' | 'suspension' | 'permanent_suspension';

export interface FakeDb {
  works: Row[];
  chapters: Row[];
  user_sanctions: Row[];
  warning_acknowledgements: Row[];
  moderation_review_requests: Row[];
  reading_progress: Row[];
  sanction: Record<string, Sanction>;
  fail: Set<string>;
  calls: string[];
  updates: { table: string; values: Row }[];
  rpcHandlers: Record<string, (args: Row) => { data: unknown; error: { message: string } | null } | 'throw'>;
}

export function seedDb(): FakeDb {
  return {
    works: [
      { id: WORK, owner_id: WRITER, deleted_at: null, admin_blinded: true, admin_blind_reason: '저작권 침해 신고' },
      { id: OTHER_WORK, owner_id: STRANGER, deleted_at: null, admin_blinded: true, admin_blind_reason: '기타' },
    ],
    chapters: [
      { id: CHAPTER, work_id: WORK, deleted_at: null, is_published: true, admin_blinded: true, admin_blind_reason: '혐오 표현' },
      { id: OTHER_CHAPTER, work_id: OTHER_WORK, deleted_at: null, admin_blinded: true, admin_blind_reason: '기타' },
    ],
    user_sanctions: [
      { id: WARN_1, user_id: WRITER, kind: 'warning', public_reason: '첫 번째 경고', internal_note: 'internal-1', created_at: '2026-09-01T00:00:00Z' },
      { id: WARN_2, user_id: WRITER, kind: 'warning', public_reason: '두 번째 경고', internal_note: 'internal-2', created_at: '2026-09-02T00:00:00Z' },
      { id: WARN_STRANGER, user_id: STRANGER, kind: 'warning', public_reason: '다른 사람 경고', internal_note: 'x', created_at: '2026-09-01T00:00:00Z' },
    ],
    warning_acknowledgements: [],
    moderation_review_requests: [],
    reading_progress: [],
    sanction: {},
    fail: new Set(),
    calls: [],
    updates: [],
    rpcHandlers: {},
  };
}

const OWN_ROW_TABLES: Record<string, string> = {
  user_sanctions: 'user_id', warning_acknowledgements: 'user_id', moderation_review_requests: 'requester_id',
};

/** Session client bound to `session` (auth.uid()). */
export function fakeClient(db: FakeDb, session: string | null) {
  function visible(table: string): Row[] {
    const rows = (db as unknown as Record<string, Row[]>)[table] ?? [];
    const ownCol = OWN_ROW_TABLES[table];
    return ownCol ? rows.filter((r) => r[ownCol] === session) : rows;
  }
  function canWrite(user: string | null) {
    return Boolean(user) && (db.sanction[user as string] ?? 'none') === 'none';
  }

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let insertRow: Row | null = null;
    let updateValues: Row | null = null;
    const run = async () => {
      db.calls.push(`${insertRow ? 'insert' : updateValues ? 'update' : 'select'}:${table}`);
      if (db.fail.has(table)) return { data: null, error: { message: 'connection reset' } };
      if (insertRow) return doInsert(table, insertRow);
      if (updateValues) {
        db.updates.push({ table, values: updateValues });
        return { data: null, error: null };
      }
      let rows = visible(table).filter((r) => filters.every((f) => f(r)));
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (limit !== null) rows = rows.slice(0, limit);
      return { data: rows.map((r) => ({ ...r })), error: null };
    };
    const builder = {
      select: () => builder,
      insert: (row: Row) => { insertRow = row; return builder; },
      update: (values: Row) => { updateValues = values; return builder; },
      upsert: (row: Row) => { insertRow = row; return builder; },
      eq: (col: string, value: unknown) => { filters.push((r) => r[col] === value); return builder; },
      is: (col: string, value: unknown) => { filters.push((r) => (r[col] ?? null) === value); return builder; },
      order: (col: string, opts?: { ascending?: boolean }) => { order = { col, asc: opts?.ascending !== false }; return builder; },
      limit: (n: number) => { limit = n; return builder; },
      maybeSingle: async () => {
        const res = await run();
        return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
      },
      single: async () => {
        const res = await run();
        return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
      },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
    };
    return builder;
  }

  function doInsert(table: string, row: Row) {
    if (table === 'reading_progress') {
      if (!canWrite(session)) return { data: null, error: { code: '42501', message: 'rls' } };
      db.reading_progress.push(row);
      return { data: [row], error: null };
    }
    if (table !== 'moderation_review_requests') return { data: null, error: { code: '42501', message: 'rls' } };
    // 0008 restrictive write policy
    if (!canWrite(session)) return { data: null, error: { code: '42501', message: 'rls' } };
    // 0006 insert policy: requester is session, owns work, target blinded
    const work = db.works.find((w) => w.id === row.work_id && w.owner_id === session && w.deleted_at === null);
    const chapter = row.chapter_id === null ? null
      : db.chapters.find((c) => c.id === row.chapter_id && c.work_id === row.work_id && c.deleted_at === null);
    const ok = row.requester_id === session && work
      && (row.chapter_id === null ? work.admin_blinded === true : chapter?.admin_blinded === true);
    if (!ok) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
    const dup = db.moderation_review_requests.some((r) => r.status === 'open'
      && r.work_id === row.work_id && (r.chapter_id ?? null) === (row.chapter_id ?? null));
    if (dup) return { data: null, error: { code: '23505', message: 'duplicate key' } };
    const created = {
      id: `70000000-0000-4000-8000-${String(db.moderation_review_requests.length + 1).padStart(12, '0')}`,
      ...row, status: 'open', resolved_at: null, created_at: new Date(Date.now() + db.moderation_review_requests.length).toISOString(),
    };
    db.moderation_review_requests.push(created);
    return { data: [{ id: created.id }], error: null };
  }

  const rpc = vi.fn(async (name: string, args: Row) => {
    db.calls.push(`rpc:${name}`);
    if (db.fail.has(`rpc:${name}`)) return { data: null, error: { message: 'connection reset' } };
    if (name === 'get_write_access') {
      if (args.p_user_id !== session) return { data: { can_write: false, reason: 'forbidden', sanctioned_until: null }, error: null };
      const kind = db.sanction[session as string] ?? 'none';
      if (kind === 'none') return { data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null };
      return {
        data: { can_write: false, reason: kind === 'suspension' ? 'suspended' : 'permanent_suspension', sanctioned_until: kind === 'suspension' ? '2030-01-01T00:00:00Z' : null },
        error: null,
      };
    }
    if (name === 'acknowledge_warning') {
      if (!session) return { data: null, error: { message: 'authentication_required' } };
      const target = db.user_sanctions.find((s) => s.id === args.p_sanction_id && s.user_id === session && s.kind === 'warning');
      if (!target) return { data: null, error: { message: 'warning_not_found' } };
      if (!db.warning_acknowledgements.some((a) => a.sanction_id === target.id)) {
        db.warning_acknowledgements.push({ sanction_id: target.id, user_id: session });
      }
      return { data: true, error: null };
    }
    const handler = db.rpcHandlers[name];
    if (handler) {
      const out = handler(args);
      if (out === 'throw') throw new Error('network down');
      return out;
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });

  return {
    from, rpc,
    auth: { getUser: async () => ({ data: { user: session ? { id: session } : null }, error: null }) },
  } as unknown as SupabaseClient & { rpc: typeof rpc };
}

let db: FakeDb;
beforeEach(() => {
  db = seedDb();
  h.sessionUserId = WRITER;
  h.client = fakeClient(db, WRITER);
  h.revalidatePath.mockClear();
});

function useSession(userId: string | null) {
  h.sessionUserId = userId;
  h.client = fakeClient(db, userId);
  return h.client as SupabaseClient;
}

describe('warning notices (D-09)', () => {
  it('returns only the recipient\'s unacknowledged warnings with public reasons', async () => {
    const result = await getAccountNotices(useSession(WRITER), { userId: WRITER });
    expect(result).toEqual({
      ok: true, suspension: null,
      warnings: [
        { id: WARN_1, publicReason: '첫 번째 경고', createdAt: '2026-09-01T00:00:00Z' },
        { id: WARN_2, publicReason: '두 번째 경고', createdAt: '2026-09-02T00:00:00Z' },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('internal');
    expect(JSON.stringify(result)).not.toContain(WARN_STRANGER);
  });

  it('persists acknowledgement per warning so a reload no longer shows it', async () => {
    const ack = await acknowledgeWarningAction(WARN_1);
    expect(ack).toEqual({ ok: true });
    // "reload": a brand new client/session read against the same persisted state
    const reloaded = await getAccountNoticesAction();
    expect(reloaded.ok && reloaded.warnings.map((w) => w.id)).toEqual([WARN_2]);
    expect(db.warning_acknowledgements).toEqual([{ sanction_id: WARN_1, user_id: WRITER }]);
  });

  it('acknowledgement retry is idempotent', async () => {
    expect(await acknowledgeWarningAction(WARN_2)).toEqual({ ok: true });
    expect(await acknowledgeWarningAction(WARN_2)).toEqual({ ok: true });
    expect(db.warning_acknowledgements).toHaveLength(1);
  });

  it('cannot acknowledge another account\'s warning', async () => {
    const result = await acknowledgeWarningAction(WARN_STRANGER);
    expect(result).toEqual({ ok: false, code: 'not_found', error: NOTICE_ACK_ERROR });
    expect(db.warning_acknowledgements).toHaveLength(0);
    const strangerView = await getAccountNotices(useSession(STRANGER), { userId: STRANGER });
    expect(strangerView.ok && strangerView.warnings.map((w) => w.id)).toEqual([WARN_STRANGER]);
  });

  it('rejects malformed ids and anonymous callers without an RPC', async () => {
    expect((await acknowledgeWarningAction('not-a-uuid')).ok).toBe(false);
    useSession(null);
    expect(await acknowledgeWarningAction(WARN_1)).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(await getAccountNoticesAction()).toEqual({ ok: false, code: 'unauthenticated' });
    expect(db.calls.filter((c) => c === 'rpc:acknowledge_warning')).toHaveLength(0);
  });

  it('a notice load failure is reported (retryable) instead of throwing; retry then succeeds', async () => {
    db.fail.add('user_sanctions');
    expect(await getAccountNoticesAction()).toEqual({ ok: false, code: 'unavailable' });
    db.fail.delete('user_sanctions');
    const retry = await getAccountNoticesAction();
    expect(retry.ok && retry.warnings).toHaveLength(2);
  });

  it('an acknowledgement failure keeps the warning outstanding', async () => {
    db.fail.add('rpc:acknowledge_warning');
    expect(await acknowledgeWarningAction(WARN_1)).toMatchObject({ ok: false, code: 'unavailable' });
    const after = await getAccountNoticesAction();
    expect(after.ok && after.warnings).toHaveLength(2);
  });

  it('suspended users still see and acknowledge warnings (account-control exception)', async () => {
    db.sanction[WRITER] = 'suspension';
    const notices = await getAccountNoticesAction();
    expect(notices).toMatchObject({ ok: true, suspension: { permanent: false, sanctionedUntil: '2030-01-01T00:00:00.000Z' } });
    expect(await acknowledgeWarningAction(WARN_1)).toEqual({ ok: true });
  });
});

describe('writer re-review requests (D-15/D-16)', () => {
  it('creates one open request for an owned blinded work, visible for the admin queue', async () => {
    const result = await requestReviewAction({ workId: WORK, chapterId: null, message: '  수정했습니다  ' });
    expect(result.ok).toBe(true);
    expect(db.moderation_review_requests).toHaveLength(1);
    expect(db.moderation_review_requests[0]).toMatchObject({
      requester_id: WRITER, work_id: WORK, chapter_id: null, message: '수정했습니다', status: 'open',
    });
    expect(h.revalidatePath).toHaveBeenCalledWith('/admin', 'layout');
    // Requesting never clears the blind (D-15).
    expect(db.works[0].admin_blinded).toBe(true);
    expect(db.updates).toHaveLength(0);
  });

  it('the requester identity comes from the session, never from input', async () => {
    const forged = { workId: WORK, chapterId: null, userId: STRANGER, requesterId: STRANGER } as unknown as Parameters<typeof requestReviewAction>[0];
    const result = await requestReviewAction(forged);
    expect(result.ok).toBe(true);
    expect(db.moderation_review_requests[0].requester_id).toBe(WRITER);
  });

  it('duplicate work-level requests are refused with the duplicate copy', async () => {
    expect((await requestReviewAction({ workId: WORK, chapterId: null })).ok).toBe(true);
    const second = await requestReviewAction({ workId: WORK, chapterId: null });
    expect(second).toEqual({ ok: false, code: 'duplicate', error: REVIEW_ERRORS.duplicate });
    expect(db.moderation_review_requests).toHaveLength(1);
    // A chapter-level request is a separate target and still allowed.
    expect((await requestReviewAction({ workId: WORK, chapterId: CHAPTER })).ok).toBe(true);
    expect(db.moderation_review_requests).toHaveLength(2);
    expect(h.revalidatePath).toHaveBeenCalledTimes(4);
  });

  it('a resolved (maintained) request allows a new one', async () => {
    await requestReviewAction({ workId: WORK, chapterId: CHAPTER });
    Object.assign(db.moderation_review_requests[0], { status: 'maintained', resolved_at: '2026-09-10T00:00:00Z' });
    expect((await requestReviewAction({ workId: WORK, chapterId: CHAPTER })).ok).toBe(true);
  });

  it('stranger work and chapter ids are refused before any insert', async () => {
    expect(await requestReviewAction({ workId: OTHER_WORK, chapterId: null })).toMatchObject({ ok: false, code: 'not_found' });
    expect(await requestReviewAction({ workId: OTHER_WORK, chapterId: OTHER_CHAPTER })).toMatchObject({ ok: false, code: 'not_found' });
    // chapter of another work paired with own work
    expect(await requestReviewAction({ workId: WORK, chapterId: OTHER_CHAPTER })).toMatchObject({ ok: false, code: 'not_found' });
    expect(db.calls.filter((c) => c.startsWith('insert:'))).toHaveLength(0);
    expect(db.moderation_review_requests).toHaveLength(0);
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a target that is not blinded', async () => {
    db.chapters[0].admin_blinded = false;
    db.chapters[0].admin_blind_reason = null;
    expect(await requestReviewAction({ workId: WORK, chapterId: CHAPTER })).toEqual({
      ok: false, code: 'not_blinded', error: REVIEW_ERRORS.not_blinded,
    });
  });

  it('maps an RLS refusal at insert time (blind lifted concurrently) to not_found', async () => {
    const client = useSession(WRITER);
    const originalFrom = client.from.bind(client);
    // Lift the blind right after the pre-check reads the work.
    let reads = 0;
    (client as unknown as { from: typeof originalFrom }).from = ((table: string) => {
      if (table === 'works' && ++reads === 1) queueMicrotask(() => { db.works[0].admin_blinded = false; });
      return originalFrom(table);
    }) as typeof originalFrom;
    const result = await requestReview(client, { userId: WRITER, workId: WORK, chapterId: null });
    expect(result).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('suspended writers are refused with the contract copy before any DB access', async () => {
    db.sanction[WRITER] = 'permanent_suspension';
    const result = await requestReviewAction({ workId: WORK, chapterId: null });
    expect(result).toEqual({ ok: false, code: 'write_suspended', error: SUSPENSION_DENIAL_COPY });
    expect(db.calls).toEqual(['rpc:get_write_access']);
    const panel = await getReviewPanelStateAction(WORK, null);
    expect(panel.writeDenied).toBe(SUSPENSION_DENIAL_COPY);
    // Reading the review state still works while suspended (D-07).
    expect(panel.target).toMatchObject({ ok: true, state: { blinded: true } });
  });

  it('validates message length and ids', async () => {
    expect(await requestReviewAction({ workId: WORK, chapterId: null, message: 'x'.repeat(2001) }))
      .toMatchObject({ ok: false, code: 'validation_failed' });
    expect(await requestReviewAction({ workId: 'nope', chapterId: null })).toMatchObject({ ok: false, code: 'not_found' });
    useSession(null);
    expect(await requestReviewAction({ workId: WORK, chapterId: null })).toMatchObject({ ok: false, code: 'not_found' });
    expect(db.moderation_review_requests).toHaveLength(0);
  });

  it('review target state reports pending requests and hides strangers\' targets', async () => {
    await requestReviewAction({ workId: WORK, chapterId: CHAPTER });
    const state = await getReviewTargetState(useSession(WRITER), { userId: WRITER, workId: WORK, chapterId: CHAPTER });
    expect(state).toMatchObject({ ok: true, state: { blinded: true, blindReason: '혐오 표현', latestRequest: { status: 'open' } } });
    const workLevel = await getReviewTargetState(useSession(WRITER), { userId: WRITER, workId: WORK, chapterId: null });
    expect(workLevel).toMatchObject({ ok: true, state: { latestRequest: null } });
    const stranger = await getReviewTargetState(useSession(STRANGER), { userId: STRANGER, workId: WORK, chapterId: CHAPTER });
    expect(stranger).toEqual({ ok: false, code: 'not_found' });
  });

  it('saving chapter content never writes moderation columns (D-15)', async () => {
    const client = useSession(WRITER);
    const originalFrom = client.from.bind(client);
    (client as unknown as { from: typeof originalFrom }).from = ((table: string) => {
      const b = originalFrom(table) as unknown as Record<string, unknown>;
      if (table === 'chapters') {
        // findOwnedChapter joins works; answer it with the owned chapter row.
        b.maybeSingle = async () => ({ data: { id: CHAPTER }, error: null });
      }
      return b;
    }) as unknown as typeof originalFrom;
    const result = await saveChapterContent(client, { ownerId: WRITER, chapterId: CHAPTER, content: '고친 본문' });
    expect(result.ok).toBe(true);
    const update = db.updates.find((u) => u.table === 'chapters');
    expect(update).toBeDefined();
    expect(Object.keys(update!.values).some((k) => k.startsWith('admin_'))).toBe(false);
    expect(db.chapters[0].admin_blinded).toBe(true);
  });
});

describe('reader lock model (D-13/D-14)', () => {
  const base: Pick<PublicChapter, 'accessState' | 'content' | 'entitled' | 'blindScope' | 'blindReason' | 'priceTier'> = {
    accessState: 'readable', content: null, entitled: false, blindScope: null, blindReason: null, priceTier: 30,
  };

  it('owned-but-blind: no body, no purchase CTA, entitlement note and safe reason', () => {
    const model = viewerLockModel({ ...base, accessState: 'blinded', entitled: true, blindScope: 'chapter', blindReason: '혐오 표현' });
    expect(model).toEqual({
      kind: 'blinded', title: BLINDED_VIEWER_TITLE, reason: '혐오 표현', entitledNote: BLINDED_ENTITLED_NOTE, showPurchase: false,
    });
  });

  it('unpaid-but-blind: still no purchase CTA', () => {
    const model = viewerLockModel({ ...base, accessState: 'blinded', blindScope: 'work', blindReason: '기타' });
    expect(model).toMatchObject({ kind: 'blinded', showPurchase: false, entitledNote: null });
  });

  it('restored purchase: an unblinded owned chapter renders its body without another purchase', () => {
    expect(viewerLockModel({ ...base, accessState: 'readable', content: '본문', entitled: true })).toEqual({ kind: 'content', showPurchase: false });
  });

  it('only purchase_required for a non-entitled reader offers payment', () => {
    expect(viewerLockModel({ ...base, accessState: 'purchase_required' })).toEqual({ kind: 'purchase', priceTier: 30, showPurchase: true });
    expect(viewerLockModel({ ...base, accessState: 'purchase_required', entitled: true }).showPurchase).toBe(false);
    expect(viewerLockModel({ ...base, accessState: 'unavailable' }).showPurchase).toBe(false);
    expect(viewerLockModel({ ...base, accessState: 'readable', content: null }).kind).toBe('unavailable');
  });

  it('TOC keeps blinded rows in order with the review badge instead of a price lock', () => {
    const rows: (Pick<PublicChapterListItem, 'orderIndex' | 'state' | 'blinded'>)[] = [
      { orderIndex: 4, state: 'readable', blinded: false },
      { orderIndex: 5, state: 'blinded', blinded: true },
      { orderIndex: 6, state: 'purchase_required', blinded: false },
    ];
    expect(rows.map((row) => [row.orderIndex + 1, tocRowBadge(row)])).toEqual([[5, null], [6, 'review'], [7, 'paid']]);
  });
});

describe('reader actions recheck permission (D-07/D-13)', () => {
  const ORDER = '40000000-0000-4000-8000-000000000001';
  const KEY = '40000000-0000-4000-8000-0000000000aa';

  function accessState(state: string, entitled = false) {
    db.rpcHandlers.get_chapter_access_state = () => ({
      data: {
        state, entitled,
        blind_scope: state === 'blinded' ? 'chapter' : null,
        blind_reason: state === 'blinded' ? '혐오 표현' : null,
      },
      error: null,
    });
  }
  function purchaseRpcs() {
    db.rpcHandlers.create_purchase_order = () => ({ data: ORDER, error: null });
    db.rpcHandlers.pay_purchase_order = () => ({ data: ORDER, error: null });
  }

  it('entitled reader of a blinded chapter is never sent to the purchase RPCs', async () => {
    accessState('blinded', true);
    purchaseRpcs();
    expect(await purchaseChapterAction(CHAPTER, KEY)).toEqual({ ok: false, error: PURCHASE_BLINDED_MESSAGE, code: 'content_blinded' });
    expect(db.calls).not.toContain('rpc:create_purchase_order');
    expect(db.calls).not.toContain('rpc:pay_purchase_order');
  });

  it('unpaid reader of a blinded chapter is refused the same way', async () => {
    accessState('blinded', false);
    purchaseRpcs();
    expect(await purchaseChapterAction(CHAPTER, KEY)).toMatchObject({ ok: false, code: 'content_blinded' });
    expect(db.calls).not.toContain('rpc:create_purchase_order');
  });

  it('purchase_required still purchases (no payment regression)', async () => {
    accessState('purchase_required');
    purchaseRpcs();
    expect(await purchaseChapterAction(CHAPTER, KEY)).toEqual({ ok: true, orderId: ORDER });
    expect(db.calls).toContain('rpc:pay_purchase_order');
    expect(h.revalidatePath).toHaveBeenCalledWith('/works', 'layout');
  });

  it('a retry after the chapter became owned reports success without charging again', async () => {
    accessState('readable', true);
    purchaseRpcs();
    expect(await purchaseChapterAction(CHAPTER, KEY)).toEqual({ ok: true });
    expect(db.calls).not.toContain('rpc:create_purchase_order');
    expect(db.calls).not.toContain('rpc:pay_purchase_order');
  });

  it('access lookup failure or unknown chapter fails closed without an order', async () => {
    db.rpcHandlers.get_chapter_access_state = () => ({ data: null, error: { message: 'down' } });
    purchaseRpcs();
    expect(await purchaseChapterAction(CHAPTER, KEY)).toMatchObject({ ok: false, error: PURCHASE_UNAVAILABLE_MESSAGE });
    expect(await purchaseChapterAction(OTHER_WORK, KEY)).toMatchObject({ ok: false, code: 'content_unavailable' });
    expect(db.calls).not.toContain('rpc:create_purchase_order');
  });

  it('suspended reader opening a readable chapter: bookkeeping is skipped silently', async () => {
    db.sanction[WRITER] = 'suspension';
    db.rpcHandlers.can_view = () => ({ data: true, error: null });
    db.rpcHandlers.increment_chapter_view = () => ({ data: null, error: null });
    await expect(trackChapterOpenAction(WORK, CHAPTER, false)).resolves.toBeUndefined();
    expect(db.calls).not.toContain('rpc:increment_chapter_view');
    expect(db.reading_progress).toHaveLength(0);
  });

  it('records progress only after the server recheck allows reading', async () => {
    db.rpcHandlers.increment_chapter_view = () => ({ data: null, error: null });
    db.rpcHandlers.can_view = () => ({ data: false, error: null });
    await trackChapterOpenAction(WORK, CHAPTER, false); // client claims readable; server says blinded
    expect(db.reading_progress).toHaveLength(0);
    db.rpcHandlers.can_view = () => ({ data: true, error: null });
    await trackChapterOpenAction(WORK, CHAPTER, false);
    expect(db.reading_progress).toHaveLength(1);
  });

  it('bookkeeping failures never reject the viewer action', async () => {
    db.rpcHandlers.increment_chapter_view = () => 'throw';
    db.rpcHandlers.can_view = () => ({ data: null, error: { message: 'down' } });
    await expect(trackChapterOpenAction(WORK, CHAPTER, false)).resolves.toBeUndefined();
    db.rpcHandlers.can_view = () => ({ data: true, error: null });
    db.fail.add('reading_progress');
    await expect(trackChapterOpenAction(WORK, CHAPTER, false)).resolves.toBeUndefined();
  });
});
