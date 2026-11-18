import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAuthorSubscriptionState, listMyAuthorSubscriptions, toggleAuthorSubscription,
} from '../../lib/author/subscriptions';

const authorId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const okAccess = { data: { can_write: true, reason: 'ok' }, error: null };
const stats = { work_count: '1', ongoing_count: '1', completed_count: '0', subscriber_count: '7' };

function fake(input: {
  userId?: string | null; responses?: Record<string, { data: unknown; error: unknown }>;
  state?: { data: unknown; error: unknown }; throws?: string;
} = {}) {
  const calls: string[] = [];
  const filters: [string, unknown][] = [];
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    calls.push(name);
    void args;
    if (input.throws === name) throw new Error('secret network detail');
    if (name === 'get_write_access') return input.responses?.[name] ?? okAccess;
    return input.responses?.[name] ?? { data: null, error: { message: 'secret database detail' } };
  });
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query; }),
    maybeSingle: vi.fn(async () => input.state ?? { data: null, error: null }),
  };
  const from = vi.fn((_table: string) => query);
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: input.userId === null ? null : { id: input.userId ?? userId } }, error: null })) },
    rpc, from,
  } as unknown as SupabaseClient;
  return { client, rpc, from, filters, calls, query };
}

describe('author subscription services (APAGE-02/03)', () => {
  it('reads only the session user row and treats notify=false as inactive', async () => {
    const f = fake({ state: { data: { notify: false }, error: null } });
    expect(await getAuthorSubscriptionState(f.client, authorId)).toEqual({ ok: true, notify: false });
    expect(f.from).toHaveBeenCalledWith('author_subscriptions');
    expect(f.query.select).toHaveBeenCalledWith('notify');
    expect(f.filters).toEqual([['author_id', authorId], ['user_id', userId]]);
    expect(await getAuthorSubscriptionState(fake().client, authorId)).toEqual({ ok: true, notify: false });
  });

  it('retains muted and missing-profile entries with a safe pen name', async () => {
    const f = fake({ responses: { list_my_author_subscriptions: { data: [
      { authorId, penName: '작가', notify: false, subscribedAt: '2026-01-01T00:00:00Z', email: 'private' },
      { authorId: userId, penName: null, notify: true, subscribedAt: '2026-01-02T00:00:00Z' },
    ], error: null } } });
    expect(await listMyAuthorSubscriptions(f.client)).toEqual({ ok: true, items: [
      { authorId, penName: '작가', notify: false, subscribedAt: '2026-01-01T00:00:00Z' },
      { authorId: userId, penName: '알 수 없는 작가', notify: true, subscribedAt: '2026-01-02T00:00:00Z' },
    ] });
    expect(f.rpc).toHaveBeenCalledWith('list_my_author_subscriptions');
    expect(f.from).not.toHaveBeenCalled();
  });

  it.each([true, false])('uses DB boolean %s and reads the latest subscriber count', async (notify) => {
    const f = fake({ responses: {
      toggle_author_subscriptions: { data: notify, error: null },
      get_public_author_stats: { data: [stats], error: null },
    } });
    expect(await toggleAuthorSubscription(f.client, authorId))
      .toEqual({ ok: true, notify, subscriberCount: 7 });
    expect(f.calls).toEqual(['get_write_access', 'toggle_author_subscriptions', 'get_public_author_stats']);
    expect(f.rpc).toHaveBeenCalledWith('get_write_access', { p_user_id: userId });
    expect(f.rpc).toHaveBeenCalledWith('toggle_author_subscriptions', { p_author_id: authorId });
  });

  it('denies a suspended account before the write', async () => {
    const f = fake({ responses: { get_write_access: {
      data: { can_write: false, reason: 'permanent_suspension', sanctioned_until: null }, error: null,
    } } });
    expect(await toggleAuthorSubscription(f.client, authorId)).toMatchObject({ ok: false, code: 'write_suspended' });
    expect(f.calls).toEqual(['get_write_access']);
  });

  it('maps DB write denial and hides other RPC errors', async () => {
    const denied = fake({ responses: { toggle_author_subscriptions: { data: null, error: { message: 'write_access_denied secret' } } } });
    expect(await toggleAuthorSubscription(denied.client, authorId)).toMatchObject({ ok: false, code: 'write_forbidden' });
    const failed = fake({ responses: { toggle_author_subscriptions: { data: null, error: { message: 'private constraint' } } } });
    expect(JSON.stringify(await toggleAuthorSubscription(failed.client, authorId))).not.toMatch(/private|constraint/);
    expect(await toggleAuthorSubscription(fake({ responses: {
      toggle_author_subscriptions: { data: 'true', error: null },
    } }).client, authorId)).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('requires a session for personal reads and writes', async () => {
    const f = fake({ userId: null });
    expect(await getAuthorSubscriptionState(f.client, authorId)).toMatchObject({ ok: false, code: 'auth_required' });
    expect(await listMyAuthorSubscriptions(f.client)).toMatchObject({ ok: false, code: 'auth_required' });
    expect(await toggleAuthorSubscription(f.client, authorId)).toMatchObject({ ok: false, code: 'auth_required' });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('reports list, state and count failures without leaking details', async () => {
    const list = await listMyAuthorSubscriptions(fake({ throws: 'list_my_author_subscriptions' }).client);
    const state = await getAuthorSubscriptionState(fake({ state: { data: null, error: { message: 'secret' } } }).client, authorId);
    const toggle = await toggleAuthorSubscription(fake({ responses: {
      toggle_author_subscriptions: { data: true, error: null },
      get_public_author_stats: { data: null, error: { message: 'secret' } },
    } }).client, authorId);
    expect([list, state, toggle].map((result) => result.ok)).toEqual([false, false, false]);
    expect(JSON.stringify([list, state, toggle])).not.toMatch(/secret/);
  });
});
