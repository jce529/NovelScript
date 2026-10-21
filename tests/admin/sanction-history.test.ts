import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/navigation', () => ({ notFound: vi.fn() }));

import type { AdminAuthDeps } from '../../lib/admin/auth';
import { getUserSanctionHistory, listSanctionUsers } from '../../lib/admin/queries';

const adminId = '10000000-0000-4000-8000-000000000003';
const readerId = '10000000-0000-4000-8000-000000000002';
const writerId = '10000000-0000-4000-8000-000000000001';

type RpcResult = { data: unknown; error: { message: string } | null };

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

const userRow = (over: Record<string, unknown> = {}) => ({
  user_id: writerId, role: 'writer', pen_name: '작가', effective_kind: 'suspension',
  sanctioned_until: '2026-12-01T00:00:00+00:00', latest_at: '2026-10-01T00:00:00+00:00',
  expected_seq: '9007199254740993', total_users: 2, password_hash: 'secret', email: 'a@b.c', ...over,
});

describe('listSanctionUsers', () => {
  it('maps readers and writers, effective sanction and exact seq text', async () => {
    const { deps, rpc } = world({
      rpc: () => ok([
        userRow(),
        userRow({ user_id: readerId, role: 'reader', pen_name: null, effective_kind: 'none', sanctioned_until: null,
          expected_seq: '3' }),
        userRow({ effective_kind: 'permanent_suspension', sanctioned_until: null }),
      ]),
    });
    const result = await listSanctionUsers({ page: 2 }, deps);
    expect(rpc).toHaveBeenCalledWith('list_sanction_users', { p_limit: 26, p_offset: 25 });
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.items).toEqual([
      { userId: writerId, role: 'writer', penName: '작가',
        effectiveSanction: { kind: 'suspension', sanctionedUntil: '2026-12-01T00:00:00+00:00' },
        expectedSeq: '9007199254740993', latestAt: '2026-10-01T00:00:00+00:00' },
      { userId: readerId, role: 'reader', penName: null,
        effectiveSanction: { kind: 'none', sanctionedUntil: null }, expectedSeq: '3',
        latestAt: '2026-10-01T00:00:00+00:00' },
      { userId: writerId, role: 'writer', penName: '작가',
        effectiveSanction: { kind: 'permanent_suspension', sanctionedUntil: null },
        expectedSeq: '9007199254740993', latestAt: '2026-10-01T00:00:00+00:00' },
    ]);
    expect(result.data.totalCount).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/secret|a@b\.c/);
  });

  it('reports hasNext on the 26th row, empty past the end, and hides errors', async () => {
    const full = Array.from({ length: 26 }, () => userRow());
    const next = await listSanctionUsers({}, world({ rpc: () => ok(full) }).deps);
    if (!next.ok) throw new Error('expected ok');
    expect(next.data.items).toHaveLength(25);
    expect(next.data.hasNext).toBe(true);
    expect(await listSanctionUsers({ page: 9 }, world({ rpc: () => ok([]) }).deps)).toEqual({
      ok: true, data: { items: [], page: 9, pageSize: 25, totalCount: 0, hasNext: false },
    });
    expect(await listSanctionUsers({}, world({ rpc: () => ({ data: null, error: { message: 'secret' } }) }).deps))
      .toEqual({ ok: false, error: 'unavailable' });
  });

  it.each([{ page: 0 }, { page: 'x' }, { page: 1.5 }])('rejects invalid page %j without RPC', async (input) => {
    const { deps, rpc } = world();
    expect(await listSanctionUsers(input, deps)).toEqual({ ok: false, error: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

const event = (over: Record<string, unknown> = {}) => ({
  seq: '12', id: '80000000-0000-4000-8000-000000000001', kind: 'warning', public_reason: '경고',
  internal_note: '내부', ends_at: null, created_at: '2026-10-01T00:00:00+00:00', actor_id: adminId,
  admin_action_id: '50000000-0000-4000-8000-000000000009', metadata: {}, total_events: 3, token: 'secret', ...over,
});

describe('getUserSanctionHistory', () => {
  it('validates the user id before any RPC', async () => {
    const { deps, rpc } = world();
    expect(await getUserSanctionHistory({ userId: 'nope' }, deps)).toEqual({ ok: false, error: 'validation_failed' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps warning, suspension, permanent, lift and duration-change metadata with whitelisting', async () => {
    const { deps, rpc } = world({
      rpc: () => ok([
        event({ seq: '15', kind: 'suspension', ends_at: '2026-12-31T00:00:00+00:00',
          metadata: { operation: 'change_duration', change_id: 'c1', previous_ends_at: '2026-11-01T00:00:00+00:00',
            new_ends_at: '2026-12-31T00:00:00+00:00', expected_seq: '14', lift_action_id: 'x', ip: '1.2.3.4' } }),
        event({ seq: '14', kind: 'lift', public_reason: '해제', metadata: { operation: 'change_duration', change_id: 'c1' } }),
        event({ seq: '13', kind: 'permanent_suspension', actor_id: null, admin_action_id: null, metadata: null }),
        event(),
      ]),
    });
    const result = await getUserSanctionHistory({ userId: readerId, page: 1 }, deps);
    expect(rpc).toHaveBeenCalledWith('get_user_sanction_history', { p_user_id: readerId, p_limit: 26, p_offset: 0 });
    if (!result.ok) throw new Error('expected ok');
    const items = result.data.items;
    expect(items.map((i) => [i.seq, i.kind])).toEqual([
      ['15', 'suspension'], ['14', 'lift'], ['13', 'permanent_suspension'], ['12', 'warning'],
    ]);
    expect(items[0]).toMatchObject({
      endsAt: '2026-12-31T00:00:00+00:00', internalNote: '내부',
      metadata: { operation: 'change_duration', changeId: 'c1', previousEndsAt: '2026-11-01T00:00:00+00:00',
        newEndsAt: '2026-12-31T00:00:00+00:00' },
    });
    expect(items[2]).toMatchObject({ actorId: null, adminActionId: null, metadata: {} });
    expect(items[3].metadata).toEqual({});
    expect(result.data.totalCount).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/secret|lift_action_id|1\.2\.3\.4|expected_seq/);
  });

  it('drops unknown kinds, returns empty pages and hides errors', async () => {
    const odd = await getUserSanctionHistory({ userId: readerId }, world({ rpc: () => ok([event({ kind: 'ban' })]) }).deps);
    if (!odd.ok) throw new Error('expected ok');
    expect(odd.data.items).toEqual([]);
    expect(await getUserSanctionHistory({ userId: readerId, page: 4 }, world({ rpc: () => ok([]) }).deps)).toEqual({
      ok: true, data: { items: [], page: 4, pageSize: 25, totalCount: 0, hasNext: false },
    });
    expect(await getUserSanctionHistory({ userId: readerId },
      world({ rpc: () => ({ data: null, error: { message: 'secret' } }) }).deps)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('rejects non-admins before the history RPC', async () => {
    const { deps, rpc } = world({ admin: false });
    expect(await getUserSanctionHistory({ userId: readerId }, deps)).toEqual({ ok: false, error: 'not_found' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
