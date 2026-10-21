import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * 07-12 publication notices for bookmarking readers. A small in-memory fake emulates the
 * recipient-only RLS select on publication_notifications and the auth.uid()-bound
 * acknowledge_publication_notification RPC from 0029. Real hydration clicks and reload
 * persistence against the live DB are verified in 07-15.
 */

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { getAccountNotices, NOTICE_ACK_ERROR } from '../../lib/moderation/user-actions';
import { acknowledgePublicationNotificationAction, getAccountNoticesAction } from '../../lib/moderation/actions';

const READER = '10000000-0000-4000-8000-000000000011';
const OTHER = '10000000-0000-4000-8000-000000000012';
const WORK = '20000000-0000-4000-8000-000000000011';
const CHAPTER = '30000000-0000-4000-8000-000000000011';
const N1 = '80000000-0000-4000-8000-000000000001';
const N2 = '80000000-0000-4000-8000-000000000002';
const N_OTHER = '80000000-0000-4000-8000-000000000003';

type Row = Record<string, unknown>;
interface Db { notices: Row[]; failTable: boolean; failRpc: boolean; sanctioned: boolean; selects: string[] }

function seed(): Db {
  return {
    failTable: false, failRpc: false, sanctioned: false, selects: [],
    notices: [
      { id: N1, user_id: READER, work_id: WORK, chapter_id: null, title: '작품 A', kind: 'publication', created_at: '2026-10-01T00:00:00Z', acknowledged_at: null, admin_action_id: 'secret-action' },
      { id: N2, user_id: READER, work_id: WORK, chapter_id: CHAPTER, title: '작품 A · 1화', kind: 'publication', created_at: '2026-10-02T00:00:00Z', acknowledged_at: null, admin_action_id: 'secret-action' },
      { id: N_OTHER, user_id: OTHER, work_id: WORK, chapter_id: null, title: '타인 알림', kind: 'publication', created_at: '2026-10-01T00:00:00Z', acknowledged_at: null, admin_action_id: 'x' },
    ],
  };
}

function fakeClient(db: Db, session: string | null) {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const orders: { col: string; asc: boolean }[] = [];
    let limit: number | null = null;
    let cols: string | null = null;
    const run = async () => {
      if (table === 'publication_notifications') {
        db.selects.push(cols ?? '*');
        if (db.failTable) return { data: null, error: { message: 'down' } };
        let rows = db.notices.filter((r) => r.user_id === session && filters.every((f) => f(r)));
        rows = [...rows].sort((a, b) => {
          for (const { col, asc } of orders) {
            if (a[col] !== b[col]) return (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        if (limit !== null) rows = rows.slice(0, limit);
        return { data: rows.map((r) => ({ ...r })), error: null };
      }
      return { data: [], error: null };
    };
    const builder = {
      select: (c?: string) => { cols = c ?? null; return builder; },
      eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return builder; },
      is: (col: string, v: unknown) => { filters.push((r) => (r[col] ?? null) === v); return builder; },
      order: (col: string, o?: { ascending?: boolean }) => { orders.push({ col, asc: o?.ascending !== false }); return builder; },
      limit: (n: number) => { limit = n; return builder; },
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => run().then(resolve, reject),
    };
    return builder;
  }
  const rpc = vi.fn(async (name: string, args: Row) => {
    if (name === 'get_write_access') {
      return db.sanctioned
        ? { data: { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00Z' }, error: null }
        : { data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null };
    }
    if (name === 'acknowledge_publication_notification') {
      if (db.failRpc) return { data: null, error: { message: 'connection reset' } };
      if (!session) return { data: null, error: { message: 'authentication_required' } };
      const row = db.notices.find((r) => r.id === args.p_notification_id && r.user_id === session);
      if (!row) return { data: null, error: { message: 'notification_not_found' } };
      row.acknowledged_at = row.acknowledged_at ?? '2026-10-05T00:00:00Z';
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  return {
    from, rpc,
    auth: { getUser: async () => ({ data: { user: session ? { id: session } : null }, error: null }) },
  } as unknown as SupabaseClient & { rpc: typeof rpc };
}

let db: Db;
function use(session: string | null) {
  h.client = fakeClient(db, session);
  return h.client as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}
beforeEach(() => { db = seed(); use(READER); });

describe('publication notices (07-12)', () => {
  it('returns only the session user\'s pending notices with the minimal DTO', async () => {
    const result = await getAccountNotices(use(READER), { userId: READER });
    expect(result).toMatchObject({
      ok: true, warnings: [],
      publicationNotices: [
        { id: N1, workId: WORK, chapterId: null, title: '작품 A', createdAt: '2026-10-01T00:00:00Z' },
        { id: N2, workId: WORK, chapterId: CHAPTER, title: '작품 A · 1화', createdAt: '2026-10-02T00:00:00Z' },
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('secret-action');
    expect(json).not.toContain('admin_action_id');
    expect(json).not.toContain(N_OTHER);
    expect(db.selects[0]).toBe('id, work_id, chapter_id, title, created_at');
  });

  it('caps the list at 25 oldest-first', async () => {
    for (let i = 0; i < 30; i += 1) {
      db.notices.push({
        id: `90000000-0000-4000-8000-${String(i).padStart(12, '0')}`, user_id: READER, work_id: WORK, chapter_id: null,
        title: `t${i}`, created_at: `2026-11-01T00:00:${String(i).padStart(2, '0')}Z`, acknowledged_at: null,
      });
    }
    const result = await getAccountNotices(use(READER), { userId: READER });
    expect(result.ok && result.publicationNotices).toHaveLength(25);
    expect(result.ok && result.publicationNotices[0].id).toBe(N1);
  });

  it('acknowledgement persists so a reload shows the next pending notice', async () => {
    expect(await acknowledgePublicationNotificationAction(N1)).toEqual({ ok: true });
    const reloaded = await getAccountNoticesAction();
    expect(reloaded.ok && reloaded.publicationNotices.map((n) => n.id)).toEqual([N2]);
  });

  it('cannot acknowledge another reader\'s notice', async () => {
    expect(await acknowledgePublicationNotificationAction(N_OTHER))
      .toEqual({ ok: false, code: 'not_found', error: NOTICE_ACK_ERROR });
    expect(db.notices.find((n) => n.id === N_OTHER)?.acknowledged_at).toBeNull();
  });

  it('identity comes from the session; extra forged arguments are ignored', async () => {
    const forged = acknowledgePublicationNotificationAction as unknown as (id: string, user: string) => Promise<unknown>;
    expect(await forged(N_OTHER, OTHER)).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('rejects malformed ids and anonymous callers without an RPC', async () => {
    const client = use(READER);
    expect(await acknowledgePublicationNotificationAction('nope')).toMatchObject({ ok: false, code: 'not_found' });
    expect(client.rpc).not.toHaveBeenCalled();
    const anon = use(null);
    expect(await acknowledgePublicationNotificationAction(N1)).toMatchObject({ ok: false, code: 'unauthenticated' });
    expect(anon.rpc).not.toHaveBeenCalled();
    expect(await getAccountNoticesAction()).toEqual({ ok: false, code: 'unauthenticated' });
  });

  it('an RPC failure is a safe unavailable result and the notice stays pending', async () => {
    db.failRpc = true;
    expect(await acknowledgePublicationNotificationAction(N1)).toEqual({ ok: false, code: 'unavailable', error: NOTICE_ACK_ERROR });
    db.failRpc = false;
    const after = await getAccountNoticesAction();
    expect(after.ok && after.publicationNotices).toHaveLength(2);
  });

  it('a notice query failure degrades to an empty list without breaking warnings', async () => {
    db.failTable = true;
    const result = await getAccountNoticesAction();
    expect(result).toMatchObject({ ok: true, warnings: [], publicationNotices: [] });
  });

  it('suspended readers can still read and acknowledge (account-control scope)', async () => {
    db.sanctioned = true;
    const notices = await getAccountNoticesAction();
    expect(notices).toMatchObject({ ok: true, suspension: { permanent: false } });
    expect(notices.ok && notices.publicationNotices).toHaveLength(2);
    expect(await acknowledgePublicationNotificationAction(N1)).toEqual({ ok: true });
  });
});

describe('publication notice item (07-12 UI)', () => {
  it('renders safe copy and correct internal links without moderation wording', async () => {
    const { createElement } = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PublicationNoticeItem, publicationNoticeText, publicationNoticeHref } =
      await import('../../components/moderation/account-notices');
    const work = { id: N1, workId: WORK, chapterId: null, title: '<b>작품 A</b>', createdAt: '2026-10-01T00:00:00Z' };
    const chapter = { id: N2, workId: WORK, chapterId: CHAPTER, title: '작품 A · 1화', createdAt: '' };

    expect(publicationNoticeText(work)).toBe('<b>작품 A</b> 공개');
    expect(publicationNoticeText(chapter)).toBe('작품 A · 1화 회차 공개');
    expect(publicationNoticeHref(work)).toBe(`/works/${WORK}`);
    expect(publicationNoticeHref(chapter)).toBe(`/works/${WORK}/chapters/${CHAPTER}`);

    const html = renderToStaticMarkup(createElement(PublicationNoticeItem, { notice: work, onAcknowledged: () => {} }));
    expect(html).toContain('&lt;b&gt;작품 A&lt;/b&gt; 공개');
    expect(html).not.toContain('<b>');
    expect(html).toContain(`href="/works/${WORK}"`);
    expect(html).toContain('확인했습니다');
    for (const forbidden of ['블라인드', '숨김', '사유', '신고', '메모']) expect(html).not.toContain(forbidden);
    const chapterHtml = renderToStaticMarkup(createElement(PublicationNoticeItem, { notice: chapter, onAcknowledged: () => {} }));
    expect(chapterHtml).toContain(`href="/works/${WORK}/chapters/${CHAPTER}"`);
  });
});
