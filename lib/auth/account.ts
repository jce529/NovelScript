import type { SupabaseClient } from '@supabase/supabase-js';

/** D-08: soft delete only. Ledger/wallet rows are append-only and are never touched
 * here — see docs/4 §4.4 and 01-RESEARCH.md Pattern 5. */
export async function softDeleteAccount(admin: SupabaseClient, userId: string) {
  const { error } = await admin
    .from('profiles')
    .update({ pen_name_bio: null, deleted_at: new Date().toISOString() })
    .eq('id', userId)
    .is('deleted_at', null);

  if (error) throw error;

  // Best-effort global session revocation. Checked the installed SDK
  // (@supabase/auth-js GoTrueAdminApi.d.ts): `signOut(jwt, scope?)` takes a session
  // JWT, not a user id — there is no user-id-scoped global sign-out in this version.
  // Explicitly revoking an already-issued JWT is therefore not available here for v1.
  // The isAccountActive() gate below is the authoritative access-blocking mechanism:
  // any code path that loads a profile (e.g. app/account/page.tsx) must check it and
  // treat a soft-deleted profile as logged out regardless of JWT validity.
}

export interface ProfileActiveCheck {
  deleted_at: string | null;
}

/** Gate for the DAL/session-check path: a soft-deleted account must be treated as
 * logged out even if its access token JWT has not yet expired. */
export function isAccountActive(profile: ProfileActiveCheck): boolean {
  return profile.deleted_at === null;
}
