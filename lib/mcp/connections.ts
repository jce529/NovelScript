import type { SupabaseClient } from '@supabase/supabase-js';

/** Only the fields needed by the settings UI leave this data access layer. */
export interface McpConnection {
  clientId: string;
  clientName: string;
  redirectHost: string;
  connectedAt: string;
  lastUsedAt: string | null;
}

export type ListMcpConnectionsResult =
  | { ok: true; connections: McpConnection[] }
  | { ok: false; connections: [] };

type ConnectionRow = {
  oauth_client_id: string;
  client_name: string;
  redirect_host: string;
  connected_at: string;
  last_used_at: string | null;
};

/** Call with the browser session client and the user ID derived from that session. */
export async function listMcpConnections(supabase: SupabaseClient, userId: string): Promise<ListMcpConnectionsResult> {
  try {
    const { data, error } = await supabase.from('mcp_connections')
      .select('oauth_client_id, client_name, redirect_host, connected_at, last_used_at')
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error || !Array.isArray(data)) return { ok: false, connections: [] };

    const connections = (data as ConnectionRow[]).map((row) => ({
      clientId: row.oauth_client_id,
      clientName: row.client_name,
      redirectHost: row.redirect_host,
      connectedAt: row.connected_at,
      lastUsedAt: row.last_used_at,
    }));
    connections.sort((a, b) => {
      const aActivity = Date.parse(a.lastUsedAt ?? a.connectedAt);
      const bActivity = Date.parse(b.lastUsedAt ?? b.connectedAt);
      return bActivity - aActivity || Date.parse(b.connectedAt) - Date.parse(a.connectedAt);
    });
    return { ok: true, connections };
  } catch {
    return { ok: false, connections: [] };
  }
}

export type ActiveConnectionLookup = 'owned' | 'missing' | 'error';

/** A missing row covers both foreign and already revoked IDs without revealing which. */
export async function findActiveMcpConnection(
  supabase: SupabaseClient, userId: string, clientId: string,
): Promise<ActiveConnectionLookup> {
  try {
    const { data, error } = await supabase.from('mcp_connections')
      .select('oauth_client_id')
      .eq('user_id', userId)
      .eq('oauth_client_id', clientId)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) return 'error';
    return data ? 'owned' : 'missing';
  } catch {
    return 'error';
  }
}

/** DB revocation is the access-control boundary. Never call OAuth cleanup first. */
export async function revokeMcpConnectionInDatabase(supabase: SupabaseClient, clientId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('mcp_disconnect', { p_client_id: clientId });
    return !error;
  } catch {
    return false;
  }
}
