import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// D-07 server guards (07-03). Fake Supabase clients record every table mutation and RPC so the
// tests can prove a refused write never reaches the database, a provider or the wallet.

const adminState = vi.hoisted(() => ({ client: null as unknown, created: 0 }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { adminState.created += 1; return adminState.client; },
}));

import {
  assertCanWrite, checkWriteAccess, WriteAccessDenied, WRITE_SUSPENDED_MESSAGE, WRITE_UNAVAILABLE_MESSAGE,
} from '../../lib/auth/write-access';
import {
  createChapter, getPublicChapter, publishChapter, reorderChapters, saveChapterContent, unpublishChapter,
} from '../../lib/chapters/actions';
import { createWork } from '../../lib/works/actions';
import { createFolder, createNode, deleteNode, renameNode, saveNodeContent } from '../../lib/kb/actions';
import { upgradeToWriter } from '../../lib/auth/writer';
import { submitReport } from '../../lib/reader/reports';
import { getLikeState, toggleLike } from '../../lib/reader/likes';
import { toggleBookmark } from '../../lib/reader/bookmarks';
import { toggleSubscription } from '../../lib/reader/subscriptions';
import { upsertReadingProgress } from '../../lib/reader/progress';
import { incrementChapterView } from '../../lib/reader/views';
import { createPurchaseOrder, payPurchaseOrder } from '../../lib/commerce/actions';
import { isAccountActive } from '../../lib/auth/account';
import { chat, type ChatInput } from '../../lib/ai/chat';
import type { GeminiClient } from '../../lib/ai/gemini';

const userId = '10000000-0000-4000-8000-000000000001';
const workId = '20000000-0000-4000-8000-000000000001';
const chapterId = '30000000-0000-4000-8000-000000000001';
const nodeId = '40000000-0000-4000-8000-000000000001';
const orderId = '50000000-0000-4000-8000-000000000001';

type Access = { data?: unknown; error?: { message: string } | null; throws?: boolean };
const ACCESS = {
  ok: { data: { can_write: true, reason: 'ok', sanctioned_until: null } },
  suspended: { data: { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00+00:00' } },
  permanent: { data: { can_write: false, reason: 'permanent_suspension', sanctioned_until: null } },
  forbidden: { data: { can_write: false, reason: 'forbidden', sanctioned_until: null } },
  notFound: { data: { can_write: false, reason: 'not_found', sanctioned_until: null } },
  rpcError: { data: null, error: { message: 'connection reset' } },
  thrown: { throws: true },
  malformed: { data: true },
} satisfies Record<string, Access>;

interface FakeOptions {
  access: Access;
  /** Rows returned by any SELECT (maybeSingle/single) on a table. */
  rows?: Record<string, unknown>;
  rpcData?: Record<string, unknown>;
}

function fakeClient({ access, rows = {}, rpcData = {} }: FakeOptions) {
  const mutations: string[] = [];
  const rpcCalls: string[] = [];
  const rpc = vi.fn(async (name: string) => {
    rpcCalls.push(name);
    if (name === 'get_write_access') {
      if ('throws' in access && access.throws) throw new Error('network');
      return { data: access.data ?? null, error: access.error ?? null };
    }
    return { data: rpcData[name] ?? null, error: null };
  });
  const from = vi.fn((table: string) => {
    let op = 'select';
    const chain: Record<string, unknown> = {};
    const result = () => Promise.resolve({
      data: op === 'select' ? rows[table] ?? null : { id: nodeId },
      error: null, count: 0,
    });
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit', 'or', 'ilike']) {
      chain[method] = () => chain;
    }
    for (const method of ['insert', 'update', 'delete', 'upsert']) {
      chain[method] = () => { op = method; mutations.push(`${table}.${method}`); return chain; };
    }
    chain.maybeSingle = result;
    chain.single = result;
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      result().then(resolve, reject);
    return chain;
  });
  const client = { rpc, from } as unknown as SupabaseClient;
  const writes = () => [...mutations, ...rpcCalls.filter(name => name !== 'get_write_access')];
  return { client, rpc, from, mutations, rpcCalls, writes };
}

describe('checkWriteAccess / assertCanWrite', () => {
  it('allows only an explicit ok answer from the database', async () => {
    expect(await checkWriteAccess(fakeClient({ access: ACCESS.ok }).client, userId)).toEqual({ ok: true });
  });

  it('reports timed and permanent suspension with a safe message and expiry', async () => {
    expect(await checkWriteAccess(fakeClient({ access: ACCESS.suspended }).client, userId)).toEqual({
      ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE, permanent: false,
      sanctionedUntil: '2030-01-01T00:00:00.000Z',
    });
    expect(await checkWriteAccess(fakeClient({ access: ACCESS.permanent }).client, userId)).toMatchObject({
      ok: false, code: 'write_suspended', permanent: true, sanctionedUntil: null,
    });
  });

  it('asks the database with the session-derived user and never decides expiry locally', async () => {
    const { client, rpc } = fakeClient({ access: ACCESS.ok });
    await checkWriteAccess(client, userId);
    expect(rpc).toHaveBeenCalledWith('get_write_access', { p_user_id: userId });
  });

  it.each([
    ['rpc error', ACCESS.rpcError, 'write_unavailable'],
    ['thrown transport error', ACCESS.thrown, 'write_unavailable'],
    ['malformed payload', ACCESS.malformed, 'write_unavailable'],
    ['cross-user probe', ACCESS.forbidden, 'write_forbidden'],
    ['deleted profile', ACCESS.notFound, 'write_forbidden'],
  ] as const)('fails closed on %s', async (_label, access, code) => {
    const result = await checkWriteAccess(fakeClient({ access }).client, userId);
    expect(result).toMatchObject({ ok: false, code });
    if (!result.ok) expect(result.error).not.toContain('connection');
  });

  it('rejects a malformed user id without querying', async () => {
    const { client, rpc } = fakeClient({ access: ACCESS.ok });
    expect(await checkWriteAccess(client, 'not-a-uuid')).toMatchObject({ ok: false, code: 'write_forbidden' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('assertCanWrite throws a typed denial', async () => {
    await expect(assertCanWrite(fakeClient({ access: ACCESS.suspended }).client, userId))
      .rejects.toBeInstanceOf(WriteAccessDenied);
    await expect(assertCanWrite(fakeClient({ access: ACCESS.ok }).client, userId)).resolves.toBeUndefined();
  });

  it('keeps account activity (soft deletion) separate from suspension', () => {
    expect(isAccountActive({ deleted_at: null })).toBe(true);
    expect(isAccountActive({ deleted_at: '2026-01-01T00:00:00Z' })).toBe(false);
  });
});

type Mutation = [string, (client: SupabaseClient) => Promise<{ ok: boolean; error?: string; code?: string }>];
const mutations: Mutation[] = [
  ['chapter create', c => createChapter(c, { ownerId: userId, workId, title: '1화' })],
  ['chapter save', c => saveChapterContent(c, { ownerId: userId, chapterId, content: 'x' })],
  ['chapter publish', c => publishChapter(c, { ownerId: userId, chapterId, priceTier: 10 })],
  ['chapter unpublish', c => unpublishChapter(c, { ownerId: userId, chapterId })],
  ['chapter reorder', c => reorderChapters(c, { ownerId: userId, workId, orderedIds: [chapterId] })],
  ['work create', c => createWork(c, { ownerId: userId, title: '작품' })],
  ['kb create file', c => createNode(c, { ownerId: userId, workId, parentId: nodeId, category: '인물', nodeType: 'file', name: 'n', templateOverrideContent: null })],
  ['kb create folder', c => createFolder(c, { ownerId: userId, workId, scope: 'work', parentId: null, name: 'f' })],
  ['kb rename', c => renameNode(c, { ownerId: userId, nodeId, name: 'r' })],
  ['kb delete', c => deleteNode(c, { ownerId: userId, nodeId })],
  ['kb save', c => saveNodeContent(c, { ownerId: userId, nodeId, content: 'c' })],
  ['writer upgrade', c => upgradeToWriter(c, { userId, penName: '필명' })],
  ['report', c => submitReport(c, { reporterId: userId, workId, chapterId: null, reasonCategory: '스팸/광고' })],
  ['purchase order', c => createPurchaseOrder(c, { chapterIds: [chapterId], idempotencyKey: orderId }, { userId })],
  ['purchase payment', c => payPurchaseOrder(c, orderId, { userId })],
];

describe('domain mutations refuse writes before touching the database', () => {
  it.each(mutations)('%s is denied during suspension', async (_name, run) => {
    const fake = fakeClient({ access: ACCESS.suspended });
    const result = await run(fake.client);
    expect(result).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(fake.writes()).toEqual([]);
  });

  it.each(mutations)('%s fails closed when the permission lookup fails', async (_name, run) => {
    const fake = fakeClient({ access: ACCESS.rpcError });
    const result = await run(fake.client);
    expect(result).toMatchObject({ ok: false, code: 'write_unavailable', error: WRITE_UNAVAILABLE_MESSAGE });
    expect(fake.writes()).toEqual([]);
  });

  it('proceeds to the write for an unsanctioned user (control)', async () => {
    const fake = fakeClient({ access: ACCESS.ok, rows: { chapters: { id: chapterId, work_id: workId } } });
    expect(await saveChapterContent(fake.client, { ownerId: userId, chapterId, content: 'x' })).toMatchObject({ ok: true });
    expect(fake.mutations).toEqual(['chapters.update']);
  });

  it('maps the database-side purchase refusal to the same safe message', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'P0001: write_access_denied' } }));
    const client = { rpc } as unknown as SupabaseClient;
    expect(await payPurchaseOrder(client, orderId)).toEqual({
      ok: false, orderId, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE,
    });
  });
});

describe('reader toggles cannot bypass suspension by un-toggling', () => {
  const toggles = [
    ['like', 'work_likes', (c: SupabaseClient) => toggleLike(c, { workId, userId }), 'liked'],
    ['bookmark', 'work_bookmarks', (c: SupabaseClient) => toggleBookmark(c, { workId, userId }), 'bookmarked'],
    ['subscription', 'work_subscriptions', (c: SupabaseClient) => toggleSubscription(c, { workId, userId }), 'subscribed'],
  ] as const;

  it.each(toggles)('%s: existing row is not deleted and state is reported unchanged', async (_n, table, run, key) => {
    const fake = fakeClient({ access: ACCESS.suspended, rows: { [table]: { work_id: workId } } });
    const result = await run(fake.client) as Record<string, unknown>;
    expect(result[key]).toBe(true);
    expect(result.denied).toMatchObject({ code: 'write_suspended' });
    expect(fake.mutations).toEqual([]);
  });

  it.each(toggles)('%s: missing row is not inserted', async (_n, _table, run, key) => {
    const fake = fakeClient({ access: ACCESS.permanent });
    const result = await run(fake.client) as Record<string, unknown>;
    expect(result[key]).toBe(false);
    expect(result.denied).toBeDefined();
    expect(fake.mutations).toEqual([]);
  });

  it.each(toggles)('%s: lookup failure also refuses (fail closed)', async (_n, table, run) => {
    const fake = fakeClient({ access: ACCESS.thrown, rows: { [table]: { work_id: workId } } });
    const result = await run(fake.client) as Record<string, unknown>;
    expect(result.denied).toMatchObject({ code: 'write_unavailable' });
    expect(fake.mutations).toEqual([]);
  });
});

describe('reading bookkeeping is skipped without failing the read', () => {
  it.each([['suspended', ACCESS.suspended], ['lookup failure', ACCESS.rpcError]] as const)(
    'progress upsert no-ops for %s', async (_label, access) => {
      const fake = fakeClient({ access });
      await expect(upsertReadingProgress(fake.client, { userId, workId, chapterId })).resolves.toBeUndefined();
      expect(fake.mutations).toEqual([]);
    });

  it('view increment no-ops for a suspended signed-in reader but still counts anonymous opens', async () => {
    const suspended = fakeClient({ access: ACCESS.suspended });
    await expect(incrementChapterView(suspended.client, { chapterId, userId })).resolves.toBeUndefined();
    expect(suspended.rpcCalls).not.toContain('increment_chapter_view');

    const anonymous = fakeClient({ access: ACCESS.rpcError });
    await incrementChapterView(anonymous.client, { chapterId });
    expect(anonymous.rpcCalls).toEqual(['increment_chapter_view']);
  });

  it('reads never consult write access, so they work even when that lookup is broken', async () => {
    const fake = fakeClient({
      access: ACCESS.rpcError,
      rows: {
        work_likes: { work_id: workId },
        chapters: { id: chapterId, work_id: workId, title: '1화', order_index: 0, price_tier: 10, view_count: 3 },
      },
      rpcData: {
        read_chapter_content: 'purchased body',
        // 07-04: the viewer asks for explicit access state before the body RPC.
        get_chapter_access_state: { state: 'readable', entitled: true, blind_scope: null, blind_reason: null },
      },
    });
    expect(await getLikeState(fake.client, { workId, userId })).toBe(true);
    expect(await getPublicChapter(fake.client, { chapterId })).toMatchObject({ content: 'purchased body', locked: false });
    expect(fake.rpcCalls).not.toContain('get_write_access');
  });
});

describe('AI generation checks write access before provider work and before charging', () => {
  const input: ChatInput = {
    ownerId: userId, workId, chapterId, modelTier: 'lite', mentionedNodeIds: [], presetLevel: 'beginner',
    styleId: 'concise-hemingway', genre: '판타지', precedingText: '', chatHistory: [{ role: 'user', content: '이어줘' }],
  };
  function provider() {
    return {
      countTokens: vi.fn(async () => ({ totalTokens: 10 })),
      generateContent: vi.fn(async () => ({
        text: '[REPLY]\n좋아요\n[DRAFT]\n본문\n[/DRAFT]', finishReason: 'STOP',
        promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20,
      })),
    };
  }
  beforeEach(() => { adminState.created = 0; adminState.client = null; });

  it.each([['suspended', ACCESS.suspended], ['lookup failure', ACCESS.rpcError]] as const)(
    'a %s writer causes no wallet read, provider call or charge', async (_label, access) => {
      const session = fakeClient({ access });
      const admin = fakeClient({ access: ACCESS.ok, rows: { wallets: { balance: 1000 } } });
      adminState.client = admin.client;
      const gemini = provider();
      const result = await chat(session.client, gemini as unknown as GeminiClient, input);
      expect(result).toMatchObject({ ok: false });
      expect(result.code).toBeDefined();
      expect(adminState.created).toBe(0);
      expect(gemini.countTokens).not.toHaveBeenCalled();
      expect(gemini.generateContent).not.toHaveBeenCalled();
      expect(admin.rpcCalls).not.toContain('apply_wallet_delta');
    });

  it('a suspension landing during generation discards the output and never charges', async () => {
    const session = fakeClient({ access: ACCESS.ok });
    const admin = fakeClient({ access: ACCESS.suspended, rows: { wallets: { balance: 1000 } }, rpcData: { apply_wallet_delta: 990 } });
    adminState.client = admin.client;
    const gemini = provider();
    const result = await chat(session.client, gemini as unknown as GeminiClient, input);
    expect(gemini.generateContent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(admin.rpc).toHaveBeenCalledWith('get_write_access', { p_user_id: userId });
    expect(admin.rpcCalls).not.toContain('apply_wallet_delta');
  });

  it('charges normally when access holds through generation (control)', async () => {
    const session = fakeClient({ access: ACCESS.ok });
    const admin = fakeClient({ access: ACCESS.ok, rows: { wallets: { balance: 1000 } }, rpcData: { apply_wallet_delta: 990 } });
    adminState.client = admin.client;
    const result = await chat(session.client, provider() as unknown as GeminiClient, input);
    expect(result).toMatchObject({ ok: true, draft: '본문', remainingBalance: 990 });
    expect(admin.rpcCalls).toEqual(['get_write_access', 'apply_wallet_delta']);
  });
});
