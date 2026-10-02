import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toggleLike } from '../../lib/reader/likes';
import { toggleBookmark } from '../../lib/reader/bookmarks';
import { toggleSubscription } from '../../lib/reader/subscriptions';

const workId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const OK_ACCESS = { data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null };

/** Fake client: get_write_access answers `access`, the toggle RPC answers `toggle`, selects answer `select`. */
function fake(opts: { access?: unknown; toggle?: unknown; select?: unknown; toggleThrows?: boolean }) {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'get_write_access') return opts.access ?? OK_ACCESS;
      if (opts.toggleThrows) throw new Error('network down: secret detail');
      return opts.toggle;
    },
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => opts.select ?? { data: null, error: null };
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const toggles = [
  ['like', toggleLike, 'liked', 'toggle_work_likes'],
  ['bookmark', toggleBookmark, 'bookmarked', 'toggle_work_bookmarks'],
  ['subscription', toggleSubscription, 'subscribed', 'toggle_work_subscriptions'],
] as const;

describe.each(toggles)('%s toggle failure handling (BUG-01/02)', (_n, run, key, rpcName) => {
  const call = (client: SupabaseClient) => run(client, { workId, userId }) as Promise<Record<string, unknown>>;

  it('uses only the DB-returned boolean on success', async () => {
    for (const state of [true, false]) {
      const { client, calls } = fake({ toggle: { data: state, error: null } });
      expect(await call(client)).toEqual({ [key]: state });
      expect(calls).toContain(rpcName);
    }
  });

  it('reports an RPC error as a failure without a guessed state or DB text', async () => {
    const { client } = fake({ toggle: { data: null, error: { message: 'duplicate key value violates constraint' } } });
    const result = await call(client);
    expect(result[key]).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/duplicate|constraint/);
  });

  it('reports a thrown RPC or a malformed payload as a failure', async () => {
    const thrown = await call(fake({ toggleThrows: true }).client);
    expect(thrown.error).toBeTruthy();
    expect(thrown.error).not.toMatch(/secret/);
    expect(thrown[key]).toBeUndefined();
    const malformed = await call(fake({ toggle: { data: 'yes', error: null } }).client);
    expect(malformed.error).toBeTruthy();
    expect(malformed[key]).toBeUndefined();
  });

  it('maps the DB write_access_denied exception to a denial', async () => {
    const { client } = fake({ toggle: { data: null, error: { message: 'P0001: write_access_denied' } } });
    const result = await call(client);
    expect(result.denied).toMatchObject({ code: 'write_forbidden' });
    expect(result.error).toBeUndefined();
  });

  it('pre-check denial skips the toggle RPC and reports the current state', async () => {
    const { client, calls } = fake({
      access: { data: { can_write: false, reason: 'permanent_suspension', sanctioned_until: null }, error: null },
      select: { data: { work_id: workId }, error: null },
    });
    const result = await call(client);
    expect(result.denied).toMatchObject({ code: 'write_suspended' });
    expect(result[key]).toBe(true);
    expect(calls).toEqual(['get_write_access']);
  });

  it('omits the state when the denial-path read fails', async () => {
    const { client } = fake({
      access: { data: { can_write: false, reason: 'suspended', sanctioned_until: null }, error: null },
      select: { data: null, error: { message: 'boom' } },
    });
    const result = await call(client);
    expect(result.denied).toBeDefined();
    expect(result[key]).toBeUndefined();
  });
});
