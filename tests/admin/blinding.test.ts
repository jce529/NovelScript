import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getChapterAccessState } from '../../lib/access/actions';
import { getPublicChapter, listPublicChapters, publishChapter, saveChapterContent } from '../../lib/chapters/actions';
import { getPublicWork, getWork, listWorks } from '../../lib/works/actions';
import { listFeed } from '../../lib/discovery/actions';
import { listRecentlyRead } from '../../lib/reader/progress';
import {
  createPurchaseOrder, payPurchaseOrder, PURCHASE_BLINDED_MESSAGE, PURCHASE_UNAVAILABLE_MESSAGE,
} from '../../lib/commerce/actions';

// 07-04 reader DAL: explicit public state, blind vs unpaid, no body or internal note leakage.

const userId = '10000000-0000-4000-8000-000000000001';
const workId = '20000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';
const chapter2 = '30000000-0000-4000-8000-000000000002';
const chapter3 = '30000000-0000-4000-8000-000000000003';
const orderId = '50000000-0000-4000-8000-000000000001';
const INTERNAL_NOTE = 'internal operator note: reporter 42';

interface FakeOptions {
  rows?: Record<string, unknown>;
  rpcData?: Record<string, unknown>;
  rpcErrors?: Record<string, string>;
}

/** Records every table query (select string, filters, mutations) and RPC. */
function fakeClient({ rows = {}, rpcData = {}, rpcErrors = {} }: FakeOptions = {}) {
  const selects: { table: string; columns: string }[] = [];
  const filters: string[] = [];
  const mutations: { table: string; op: string; values: unknown }[] = [];
  const rpcCalls: string[] = [];
  const rpc = vi.fn(async (name: string) => {
    rpcCalls.push(name);
    if (rpcErrors[name]) return { data: null, error: { message: rpcErrors[name] } };
    return { data: rpcData[name] ?? null, error: null };
  });
  const from = vi.fn((table: string) => {
    let op = 'select';
    const chain: Record<string, unknown> = {};
    const result = () => Promise.resolve({ data: op === 'select' ? rows[table] ?? null : null, error: null });
    chain.select = (columns: string) => { if (op === 'select') selects.push({ table, columns }); return chain; };
    for (const method of ['eq', 'is', 'in', 'order', 'limit']) {
      chain[method] = (...args: unknown[]) => { filters.push(`${table}.${method}(${args.map(String).join(',')})`); return chain; };
    }
    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      chain[method] = (values: unknown) => { op = method; mutations.push({ table, op: method, values }); return chain; };
    }
    chain.maybeSingle = result;
    chain.single = result;
    chain.then = (resolve: (v: unknown) => unknown, reject: (r: unknown) => unknown) => result().then(resolve, reject);
    return chain;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, selects, filters, mutations, rpcCalls };
}

const chapterRow = { id: chapterId, work_id: workId, title: '1화', order_index: 0, price_tier: 30, view_count: 7 };
const blindedState = { state: 'blinded', entitled: true, blind_scope: 'chapter', blind_reason: '검토 사유' };

describe('getChapterAccessState', () => {
  it('maps the DB payload and forwards the work/chapter pair', async () => {
    const fake = fakeClient({ rpcData: { get_chapter_access_state: blindedState } });
    expect(await getChapterAccessState(fake.client, { workId, chapterId })).toEqual({
      state: 'blinded', entitled: true, blindScope: 'chapter', blindReason: '검토 사유',
    });
    expect(fake.rpc).toHaveBeenCalledWith('get_chapter_access_state', { p_work_id: workId, p_chapter_id: chapterId });
  });

  it.each([null, true, { state: 'open' }, { state: 'readable_now' }])('fails closed to unavailable on %j', async (payload) => {
    const fake = fakeClient({ rpcData: { get_chapter_access_state: payload } });
    expect(await getChapterAccessState(fake.client, { workId, chapterId }))
      .toEqual({ state: 'unavailable', entitled: false, blindScope: null, blindReason: null });
  });

  it('never reports a blind reason for a non-blinded state', async () => {
    const fake = fakeClient({ rpcData: { get_chapter_access_state: { state: 'readable', entitled: false, blind_scope: 'work', blind_reason: 'x' } } });
    expect(await getChapterAccessState(fake.client, { workId, chapterId }))
      .toMatchObject({ state: 'readable', blindScope: null, blindReason: null });
  });

  it('propagates DB failures instead of guessing', async () => {
    const fake = fakeClient({ rpcErrors: { get_chapter_access_state: 'offline' } });
    await expect(getChapterAccessState(fake.client, { workId, chapterId })).rejects.toThrow('offline');
  });
});

describe('getPublicChapter distinguishes blind from unpaid', () => {
  it('returns blinded state with entitlement kept and never calls the body RPC', async () => {
    const fake = fakeClient({
      rows: { chapters: chapterRow },
      rpcData: { get_chapter_access_state: blindedState, read_chapter_content: 'hidden body' },
    });
    const result = await getPublicChapter(fake.client, { chapterId });
    expect(result).toMatchObject({
      content: null, locked: true, accessState: 'blinded', entitled: true, blindScope: 'chapter', blindReason: '검토 사유',
    });
    expect(fake.rpcCalls).not.toContain('read_chapter_content');
    expect(JSON.stringify(result)).not.toContain('hidden body');
    expect(fake.selects.every(s => !/content|resolution|note/.test(s.columns))).toBe(true);
    expect(fake.rpc).toHaveBeenCalledWith('get_chapter_access_state', { p_work_id: workId, p_chapter_id: chapterId });
  });

  it('returns purchase_required for an unpaid chapter', async () => {
    const fake = fakeClient({
      rows: { chapters: chapterRow },
      rpcData: { get_chapter_access_state: { state: 'purchase_required', entitled: false } },
    });
    expect(await getPublicChapter(fake.client, { chapterId })).toMatchObject({
      content: null, locked: true, accessState: 'purchase_required', entitled: false, blindReason: null,
    });
    expect(fake.rpcCalls).not.toContain('read_chapter_content');
  });

  it('reads the body only for readable state', async () => {
    const fake = fakeClient({
      rows: { chapters: chapterRow },
      rpcData: { get_chapter_access_state: { state: 'readable', entitled: true }, read_chapter_content: 'body' },
    });
    expect(await getPublicChapter(fake.client, { chapterId }))
      .toMatchObject({ content: 'body', locked: false, accessState: 'readable' });
  });

  it('downgrades a readable state whose body is withheld to unavailable (race-safe)', async () => {
    const fake = fakeClient({
      rows: { chapters: chapterRow },
      rpcData: { get_chapter_access_state: { state: 'readable', entitled: false } },
    });
    expect(await getPublicChapter(fake.client, { chapterId }))
      .toMatchObject({ content: null, locked: true, accessState: 'unavailable' });
  });
});

describe('listPublicChapters keeps blinded rows in order', () => {
  it('marks blinded rows, keeps entitlement and never selects content', async () => {
    const fake = fakeClient({
      rows: {
        chapters: [
          { id: chapterId, title: '1화', order_index: 0, price_tier: null },
          { id: chapter2, title: '2화', order_index: 1, price_tier: 30 },
          { id: chapter3, title: '3화', order_index: 2, price_tier: 30 },
        ],
      },
      rpcData: {
        list_chapter_access: [
          { chapter_id: chapterId, allowed: true, entitled: false, blinded: false, blind_reason: null },
          // A DB that reported allowed for a blinded row must still be treated as blinded.
          { chapter_id: chapter2, allowed: true, entitled: true, blinded: true, blind_reason: '검토 사유' },
          { chapter_id: chapter3, allowed: false, entitled: false, blinded: false, blind_reason: 'stale' },
        ],
      },
    });
    const toc = await listPublicChapters(fake.client, { workId });
    expect(toc.map(c => [c.id, c.orderIndex])).toEqual([[chapterId, 0], [chapter2, 1], [chapter3, 2]]);
    expect(toc[0]).toMatchObject({ state: 'readable', locked: false, blinded: false });
    expect(toc[1]).toMatchObject({ state: 'blinded', locked: true, blinded: true, entitled: true, blindReason: '검토 사유' });
    expect(toc[2]).toMatchObject({ state: 'purchase_required', locked: true, blinded: false, blindReason: null });
    expect(fake.selects.find(s => s.table === 'chapters')?.columns).not.toContain('content');
    for (const item of toc) expect(item).not.toHaveProperty('content');
  });

  it('treats chapters missing from the access RPC as locked, not readable', async () => {
    const fake = fakeClient({
      rows: { chapters: [{ id: chapterId, title: '1화', order_index: 0, price_tier: null }] },
      rpcData: { list_chapter_access: [] },
    });
    expect((await listPublicChapters(fake.client, { workId }))[0]).toMatchObject({ locked: true, state: 'purchase_required' });
  });
});

describe('work entry points', () => {
  it('getPublicWork returns safe unavailable metadata for a work-wide blind', async () => {
    const fake = fakeClient({
      rows: {
        works: {
          id: workId, title: '작품', synopsis: 'offending synopsis', cover_image_url: 'https://x/cover.png',
          genre: '판타지', owner_id: userId, admin_blinded: true, admin_blind_reason: '작품 검토', resolution_note: INTERNAL_NOTE,
        },
      },
    });
    const work = await getPublicWork(fake.client, { workId });
    expect(work).toEqual({
      id: workId, title: '작품', synopsis: null, coverImageUrl: null, genre: '판타지', ownerId: userId,
      blinded: true, blindReason: '작품 검토',
    });
    expect(JSON.stringify(work)).not.toContain(INTERNAL_NOTE);
  });

  it('getPublicWork is unchanged for an unblinded work', async () => {
    const fake = fakeClient({
      rows: {
        works: {
          id: workId, title: '작품', synopsis: 's', cover_image_url: null, genre: null, owner_id: userId,
          admin_blinded: false, admin_blind_reason: null,
        },
      },
    });
    expect(await getPublicWork(fake.client, { workId })).toMatchObject({ synopsis: 's', blinded: false, blindReason: null });
  });

  it('writer getWork/listWorks APIs keep their original selects', async () => {
    const fake = fakeClient({ rows: { works: [] } });
    await listWorks(fake.client, { ownerId: userId });
    await getWork(fake.client, { ownerId: userId, workId });
    expect(fake.selects.map(s => s.columns)).toEqual([
      'id, title, synopsis, cover_image_url, genre, created_at',
      'id, title, synopsis, cover_image_url, genre, owner_id',
    ]);
  });

  it('listFeed filters out work-wide blinds in the query', async () => {
    const fake = fakeClient({ rows: { works: [], work_likes: [] } });
    await listFeed(fake.client, { sortMode: 'latest' });
    expect(fake.filters).toContain('works.eq(admin_blinded,false)');
  });

  it('listRecentlyRead excludes blinded works before the limit and flags blinded resume chapters', async () => {
    const fake = fakeClient({
      rows: {
        reading_progress: [{
          work_id: workId, chapter_id: chapter2, updated_at: '2026-09-16T00:00:00Z',
          works: { title: '작품', cover_image_url: null, admin_blinded: false },
          chapters: { title: '2화', order_index: 1, admin_blinded: true },
        }],
      },
    });
    const list = await listRecentlyRead(fake.client, { userId, limit: 5 });
    expect(fake.filters).toContain('reading_progress.eq(works.admin_blinded,false)');
    expect(fake.selects[0].columns).toContain('works!inner(');
    expect(list).toEqual([{
      workId, workTitle: '작품', coverImageUrl: null, chapterId: chapter2, chapterTitle: '2화',
      chapterOrderIndex: 1, chapterBlinded: true, updatedAt: '2026-09-16T00:00:00Z',
    }]);
  });
});

describe('writer saves never touch moderation columns (publish flag invariance)', () => {
  const access = { get_write_access: { can_write: true, reason: 'ok', sanctioned_until: null } };

  it('save and publish update only author columns', async () => {
    const fake = fakeClient({ rows: { chapters: { id: chapterId, work_id: workId } }, rpcData: access });
    expect((await saveChapterContent(fake.client, { ownerId: userId, chapterId, content: 'fixed' })).ok).toBe(true);
    expect((await publishChapter(fake.client, { ownerId: userId, chapterId, priceTier: 30 })).ok).toBe(true);
    expect(fake.mutations).toHaveLength(2);
    for (const { values } of fake.mutations) {
      expect(Object.keys(values as object).some(key => key.startsWith('admin_'))).toBe(false);
    }
  });
});

describe('purchase errors for blinded or unavailable content', () => {
  it('maps content_blinded to a safe message that never invites payment', async () => {
    const fake = fakeClient({ rpcErrors: { create_purchase_order: 'content_blinded' } });
    const result = await createPurchaseOrder(fake.client, { chapterIds: [chapterId], idempotencyKey: orderId });
    expect(result).toEqual({ ok: false, error: PURCHASE_BLINDED_MESSAGE, code: 'content_blinded' });
    expect(result.error).not.toMatch(/토큰으로|결제하|구매해/);
  });

  it('keeps the order id on a blinded pending settlement', async () => {
    const fake = fakeClient({ rpcErrors: { pay_purchase_order: 'P0001: content_blinded' } });
    expect(await payPurchaseOrder(fake.client, orderId))
      .toEqual({ ok: false, orderId, error: PURCHASE_BLINDED_MESSAGE, code: 'content_blinded' });
  });

  it('maps content_unavailable without leaking the raw DB text', async () => {
    const fake = fakeClient({ rpcErrors: { create_purchase_order: 'content_unavailable at line 30' } });
    const result = await createPurchaseOrder(fake.client, { chapterIds: [chapterId], idempotencyKey: orderId });
    expect(result).toEqual({ ok: false, error: PURCHASE_UNAVAILABLE_MESSAGE, code: 'content_unavailable' });
  });

  it('still maps owned/unavailable settlement conflicts to the refresh message', async () => {
    const fake = fakeClient({ rpcErrors: { pay_purchase_order: 'content_unavailable_or_owned' } });
    expect((await payPurchaseOrder(fake.client, orderId)).error).toContain('이미 열람 가능하거나');
  });
});
