import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));

import { notFound } from 'next/navigation';
import {
  AdminAccessDenied,
  checkAdmin,
  requireAdmin,
  requireAdminPage,
  withAdminAction,
  type AdminAuthDeps,
} from '../../lib/admin/auth';

const userId = '10000000-0000-4000-8000-000000000001';
type Result = { data: unknown; error: { message: string } | null };

interface World {
  user: { id: string } | null;
  sessionThrows?: boolean;
  profile: Result;
  membership: Result;
}

function makeDeps(world: World) {
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const getUser = vi.fn(async () => {
    if (world.sessionThrows) throw new Error('cookie store unavailable');
    return world.user
      ? { data: { user: world.user }, error: null }
      : { data: { user: null }, error: { message: 'Auth session missing!' } };
  });
  const from = vi.fn((table: string) => {
    const call = { table, filters: [] as [string, string, unknown][] };
    calls.push(call);
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { call.filters.push(['eq', column, value]); return builder; },
      is: (column: string, value: unknown) => { call.filters.push(['is', column, value]); return builder; },
      maybeSingle: async () => (table === 'profiles' ? world.profile : world.membership),
    };
    return builder;
  });
  const admin = { from } as unknown as SupabaseClient;
  const getAdminClient = vi.fn(() => admin);
  const deps: AdminAuthDeps = {
    getSessionClient: async () => ({ auth: { getUser } }) as unknown as SupabaseClient,
    getAdminClient,
  };
  return { deps, admin, calls, getUser, from, getAdminClient };
}

const ok = (data: unknown): Result => ({ data, error: null });
const activeProfile = (role: 'reader' | 'writer') => ok({ id: userId, role, deleted_at: null });
const membership = ok({ id: '50000000-0000-4000-8000-000000000001' });

describe('checkAdmin', () => {
  it('denies anonymous callers without touching the service-role client', async () => {
    const { deps, getAdminClient } = makeDeps({ user: null, profile: activeProfile('writer'), membership });
    expect(await checkAdmin(deps)).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(getAdminClient).not.toHaveBeenCalled();
  });

  it('denies readers and writers without active membership', async () => {
    for (const role of ['reader', 'writer'] as const) {
      const { deps } = makeDeps({ user: { id: userId }, profile: activeProfile(role), membership: ok(null) });
      expect(await checkAdmin(deps)).toEqual({ ok: false, reason: 'not_admin' });
    }
  });

  it('looks up only non-revoked membership for the session user', async () => {
    const { deps, calls } = makeDeps({ user: { id: userId }, profile: activeProfile('reader'), membership });
    await checkAdmin(deps);
    expect(calls).toEqual([
      { table: 'profiles', filters: [['eq', 'id', userId]] },
      { table: 'admin_users', filters: [['eq', 'user_id', userId], ['is', 'revoked_at', null]] },
    ]);
  });

  it('keeps writer identity for an administrator who is also a writer', async () => {
    const { deps, admin } = makeDeps({ user: { id: userId }, profile: activeProfile('writer'), membership });
    const result = await checkAdmin(deps);
    expect(result).toEqual({ ok: true, actor: { userId, isWriter: true }, admin });
  });

  it('treats a revoked membership (no active row) as non-admin', async () => {
    const { deps } = makeDeps({ user: { id: userId }, profile: activeProfile('writer'), membership: ok(null) });
    expect((await checkAdmin(deps)).ok).toBe(false);
  });

  it('denies a soft-deleted administrator before checking membership', async () => {
    const { deps, calls } = makeDeps({
      user: { id: userId },
      profile: ok({ id: userId, role: 'writer', deleted_at: '2026-09-01T00:00:00Z' }),
      membership,
    });
    expect(await checkAdmin(deps)).toEqual({ ok: false, reason: 'not_admin' });
    expect(calls.map((c) => c.table)).toEqual(['profiles']);
  });

  it('fails closed on database or session failures', async () => {
    const profileDown = makeDeps({ user: { id: userId }, profile: { data: null, error: { message: 'down' } }, membership });
    expect(await checkAdmin(profileDown.deps)).toEqual({ ok: false, reason: 'unavailable' });
    const membershipDown = makeDeps({
      user: { id: userId }, profile: activeProfile('writer'), membership: { data: null, error: { message: 'down' } },
    });
    expect(await checkAdmin(membershipDown.deps)).toEqual({ ok: false, reason: 'unavailable' });
    const sessionDown = makeDeps({ user: { id: userId }, sessionThrows: true, profile: activeProfile('writer'), membership });
    expect(await checkAdmin(sessionDown.deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('rechecks on every invocation so revocation applies immediately', async () => {
    const world: World = { user: { id: userId }, profile: activeProfile('writer'), membership };
    const { deps, getUser, from } = makeDeps(world);
    expect((await checkAdmin(deps)).ok).toBe(true);
    world.membership = ok(null);
    expect((await checkAdmin(deps)).ok).toBe(false);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledTimes(4);
  });
});

describe('requireAdmin / requireAdminPage', () => {
  beforeEach(() => {
    vi.mocked(notFound).mockClear();
  });

  it('throws AdminAccessDenied instead of returning a privileged client', async () => {
    const { deps } = makeDeps({ user: null, profile: activeProfile('writer'), membership });
    await expect(requireAdmin(deps)).rejects.toBeInstanceOf(AdminAccessDenied);
  });

  it('returns trusted actor and admin client for active administrators', async () => {
    const { deps, admin } = makeDeps({ user: { id: userId }, profile: activeProfile('reader'), membership });
    expect(await requireAdmin(deps)).toEqual({ actor: { userId, isWriter: false }, admin });
  });

  it('renders 404 for anonymous and non-admin page requests', async () => {
    for (const world of [
      { user: null, profile: activeProfile('writer'), membership },
      { user: { id: userId }, profile: activeProfile('writer'), membership: ok(null) },
    ]) {
      await expect(requireAdminPage(makeDeps(world).deps)).rejects.toThrow('404');
    }
    expect(notFound).toHaveBeenCalledTimes(2);
  });

  it('does not render admin content when authorization is unavailable', async () => {
    const { deps } = makeDeps({ user: { id: userId }, profile: { data: null, error: { message: 'x' } }, membership });
    await expect(requireAdminPage(deps)).rejects.toThrow('admin_authorization_unavailable');
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe('withAdminAction', () => {
  it.each([
    ['anonymous', { user: null, profile: activeProfile('writer'), membership }, 'not_found'],
    ['reader', { user: { id: userId }, profile: activeProfile('reader'), membership: ok(null) }, 'not_found'],
    ['writer', { user: { id: userId }, profile: activeProfile('writer'), membership: ok(null) }, 'not_found'],
    ['db failure', { user: { id: userId }, profile: activeProfile('writer'), membership: { data: null, error: { message: 'x' } } }, 'unavailable'],
  ] as const)('never runs the operation for %s callers', async (_label, world, error) => {
    const operation = vi.fn(async () => ({ ok: true as const, data: 'mutated' }));
    const { deps } = makeDeps(world as World);
    expect(await withAdminAction(operation, deps)).toEqual({ ok: false, error });
    expect(operation).not.toHaveBeenCalled();
  });

  it('passes only the session-derived actor to the operation', async () => {
    const { deps, admin } = makeDeps({ user: { id: userId }, profile: activeProfile('writer'), membership });
    const operation = vi.fn(async ({ actor }: { actor: { userId: string } }) => ({ ok: true as const, data: actor.userId }));
    expect(await withAdminAction(operation, deps)).toEqual({ ok: true, data: userId });
    expect(operation).toHaveBeenCalledWith({ actor: { userId, isWriter: true }, admin });
  });
});
