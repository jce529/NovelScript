'use server';

import { checkAdmin } from '@/lib/admin/auth';

/**
 * Profile-menu admin entry eligibility (ADMIN-01). Reuses the fresh, unmemoized
 * checkAdmin guard and exposes only a boolean: no admin client, actor, membership row
 * or denial reason leaves the server. The flag controls display only; /admin pages and
 * actions still run their own fresh guard. Denials and lookup failures fail closed.
 */
export async function getAdminMenuEligibilityAction(): Promise<{ allowed: boolean }> {
  const check = await checkAdmin();
  return { allowed: check.ok };
}
