import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound, unstable_rethrow } from 'next/navigation';
import type { AdminActor, AdminResult } from '@/lib/admin/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Administrator trust boundary (D-01..D-03, T-07-01).
 *
 * Every call re-derives identity from the request session and re-reads active membership
 * through the server-only service-role client. There is deliberately no memoization
 * (not even React `cache`): a revocation takes effect on the very next invocation, and a
 * layout-level check never stands in for the check inside an exported Server Action.
 *
 * The actor ID is always taken from `auth.getUser()` - callers cannot pass one in.
 */

export interface AdminAuthDeps {
  /** Cookie/session-scoped client used only to resolve the authenticated user. */
  getSessionClient: () => Promise<SupabaseClient>;
  /** Service-role client; returned to the caller only after authorization succeeds. */
  getAdminClient: () => SupabaseClient;
}

export type AdminDenialReason = 'unauthenticated' | 'not_admin' | 'unavailable';

export type AdminCheck =
  | { ok: true; actor: AdminActor; admin: SupabaseClient }
  | { ok: false; reason: AdminDenialReason };

export interface AdminContext {
  actor: AdminActor;
  admin: SupabaseClient;
}

const defaultDeps: AdminAuthDeps = {
  getSessionClient: createClient,
  getAdminClient: createAdminClient,
};

export async function checkAdmin(deps: AdminAuthDeps = defaultDeps): Promise<AdminCheck> {
  let userId: string;
  try {
    const session = await deps.getSessionClient();
    const { data, error } = await session.auth.getUser();
    if (error || !data?.user) return { ok: false, reason: 'unauthenticated' };
    userId = data.user.id;
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, reason: 'unavailable' };
  }

  try {
    const admin = deps.getAdminClient();

    const profile = await admin
      .from('profiles')
      .select('id, role, deleted_at')
      .eq('id', userId)
      .maybeSingle();
    if (profile.error) return { ok: false, reason: 'unavailable' };
    if (!profile.data || profile.data.deleted_at !== null) return { ok: false, reason: 'not_admin' };

    const membership = await admin
      .from('admin_users')
      .select('id')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (membership.error) return { ok: false, reason: 'unavailable' };
    if (!membership.data) return { ok: false, reason: 'not_admin' };

    return {
      ok: true,
      actor: { userId, isWriter: profile.data.role === 'writer' },
      admin,
    };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, reason: 'unavailable' };
  }
}

export class AdminAccessDenied extends Error {
  constructor(readonly reason: AdminDenialReason) {
    super('admin_access_denied');
    this.name = 'AdminAccessDenied';
  }
}

/** Throws AdminAccessDenied instead of returning a privileged client. */
export async function requireAdmin(deps: AdminAuthDeps = defaultDeps): Promise<AdminContext> {
  const check = await checkAdmin(deps);
  if (!check.ok) throw new AdminAccessDenied(check.reason);
  return { actor: check.actor, admin: check.admin };
}

/**
 * For /admin Server Components. Unauthenticated and non-admin requests get the standard
 * 404 so the surface is indistinguishable from a missing route (D-03). An authorization
 * backend failure throws a generic error rather than rendering admin content.
 */
export async function requireAdminPage(deps: AdminAuthDeps = defaultDeps): Promise<AdminContext> {
  const check = await checkAdmin(deps);
  if (!check.ok) {
    if (check.reason === 'unavailable') throw new Error('admin_authorization_unavailable');
    notFound();
  }
  return { actor: check.actor, admin: check.admin };
}

/**
 * For exported admin Server Actions. The operation runs only after a fresh check; denied
 * callers receive a generic `not_found` result that reveals nothing and mutates nothing.
 */
export async function withAdminAction<T>(
  operation: (ctx: AdminContext) => Promise<AdminResult<T>>,
  deps: AdminAuthDeps = defaultDeps
): Promise<AdminResult<T>> {
  const check = await checkAdmin(deps);
  if (!check.ok) {
    return { ok: false, error: check.reason === 'unavailable' ? 'unavailable' : 'not_found' };
  }
  return operation({ actor: check.actor, admin: check.admin });
}
