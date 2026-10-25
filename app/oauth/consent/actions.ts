'use server';

import { redirect } from 'next/navigation';
import { isAccountActive } from '@/lib/auth/account';
import { allowedOAuthRedirectHost } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';

export type ConsentActionResult = { ok: false };

async function checkRequest(authorizationId: string) {
  if (!authorizationId || authorizationId.length > 512) return null;
  const supabase = await createClient();
  const { data: details, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (detailsError || !details || !('authorization_id' in details) || details.authorization_id !== authorizationId) return null;
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || details.user.id !== user.id) return null;
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role, deleted_at').eq('id', user.id).maybeSingle();
  if (profileError || !profile || !isAccountActive(profile)) return null;
  const host = allowedOAuthRedirectHost(details.redirect_uri);
  if (!host) return null;
  return { supabase, details, role: profile.role, host };
}

export async function approveConsent(authorizationId: string): Promise<ConsentActionResult> {
  let destination: string | null = null;
  try {
    const request = await checkRequest(authorizationId);
    if (!request || request.role !== 'writer') return { ok: false };
    const { supabase, details, host } = request;
    const { data: revokedIds, error: connectError } = await supabase.rpc('mcp_connect', {
      p_client_id: details.client.id,
      p_client_name: details.client.name,
      p_redirect_host: host,
      p_scopes: ['read', 'propose_draft'],
    });
    if (connectError || !Array.isArray(revokedIds)) return { ok: false };
    for (const clientId of revokedIds) {
      try {
        const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
        if (error) console.warn('Previous OAuth grant revocation failed');
      } catch {
        console.warn('Previous OAuth grant revocation failed');
      }
    }
    let approval: Awaited<ReturnType<typeof supabase.auth.oauth.approveAuthorization>> | null = null;
    try { approval = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }); } catch { /* rollback below */ }
    if (!approval || approval.error || !approval.data?.redirect_url || allowedOAuthRedirectHost(approval.data.redirect_url) !== host) {
      // A grant row was created before Supabase completed consent. Make it unusable.
      try {
        const { error: disconnectError } = await supabase.rpc('mcp_disconnect', { p_client_id: details.client.id });
        if (disconnectError) console.warn('OAuth consent rollback failed');
      } catch { console.warn('OAuth consent rollback failed'); }
      try {
        const { error: revokeError } = await supabase.auth.oauth.revokeGrant({ clientId: details.client.id });
        if (revokeError) console.warn('OAuth consent rollback failed');
      } catch { console.warn('OAuth consent rollback failed'); }
      return { ok: false };
    }
    destination = approval.data.redirect_url;
  } catch {
    return { ok: false };
  }
  // Next's redirect throws for control flow, so keep it outside error handling.
  redirect(destination);
}

export async function denyConsent(authorizationId: string): Promise<ConsentActionResult> {
  let destination: string | null = null;
  try {
    const request = await checkRequest(authorizationId);
    if (!request) return { ok: false };
    const { data, error } = await request.supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    if (error || !data?.redirect_url || allowedOAuthRedirectHost(data.redirect_url) !== request.host) return { ok: false };
    destination = data.redirect_url;
  } catch {
    return { ok: false };
  }
  redirect(destination);
}
