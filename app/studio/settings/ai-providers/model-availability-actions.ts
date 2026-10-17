'use server';

import { getServiceAvailability } from '@/lib/ai/providers/service-availability';
import type { ServiceAvailability } from '@/lib/ai/providers/selection';
import { isAccountActive } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';

export type ServiceAvailabilityResult = { ok: true; availability: ServiceAvailability } | { ok: false };

/**
 * Shared editor/settings lookup of which service keys exist (BUG-03 / PROV-05).
 * Takes no client arguments: owner comes from the session and availability from the server env only.
 * Every auth/profile failure collapses to { ok: false } so callers fail closed.
 */
export async function getServiceAvailabilityAction(): Promise<ServiceAvailabilityResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ok: false };
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, deleted_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || !isAccountActive(profile) || profile.role !== 'writer') return { ok: false };
    const snapshot = getServiceAvailability();
    return { ok: true, availability: { gemini: snapshot.gemini === true, openai: snapshot.openai === true, anthropic: snapshot.anthropic === true } };
  } catch {
    return { ok: false };
  }
}
