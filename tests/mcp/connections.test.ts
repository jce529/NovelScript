import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClient }));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));

import { listMcpConnections } from '@/lib/mcp/connections';
import { disconnectMcpConnectionAction } from '@/app/studio/settings/mcp-connections/actions';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const clientA = '10000000-0000-4000-8000-000000000001';
const clientB = '10000000-0000-4000-8000-000000000002';
const clientC = '10000000-0000-4000-8000-000000000003';

type Row = {
  user_id: string; oauth_client_id: string; client_name: string; redirect_host: string;
  connected_at: string; last_used_at: string | null; revoked_at: string | null; scopes: string[];
};

function connection(userId: string, clientId: string, connectedAt: string, lastUsedAt: string | null = null, revokedAt: string | null = null): Row {
  return {
    user_id: userId, oauth_client_id: clientId, client_name: 'Claude', redirect_host: 'claude.ai',
    connected_at: connectedAt, last_used_at: lastUsedAt, revoked_at: revokedAt, scopes: ['read', 'propose_draft'],
  };
}

function fakeSession(rows: Row[], options: { userId?: string | null; role?: string; profileError?: boolean; rpcError?: boolean; grantError?: boolean } = {}) {
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, args: { p_client_id: string }) => {
    events.push('mcp_disconnect');
    if (options.rpcError) return { error: { message: 'private database detail' } };
    for (const row of rows) {
      if (row.user_id === (options.userId === undefined ? owner : options.userId) && row.oauth_client_id === args.p_client_id && row.revoked_at === null) {
        row.revoked_at = '2026-10-25T00:00:00Z';
      }
    }
    return { error: null };
  });
  const revokeGrant = vi.fn(async (_args: { clientId: string }) => {
    void _args;
    events.push('revokeGrant');
    return { error: options.grantError ? { message: 'private auth detail' } : null };
  });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: (_columns: string) => { void _columns; return query; },
      eq: (column: string, value: unknown) => { filters[column] = value; return query; },
      is: (column: string, value: unknown) => { filters[column] = value; return query; },
      maybeSingle: async () => {
        if (table === 'profiles') return { data: options.profileError ? null : { role: options.role ?? 'writer', deleted_at: null }, error: options.profileError ? { message: 'private profile detail' } : null };
        return { data: rows.find((row) => Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value)) ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => resolve({ data: rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value)), error: null }),
    };
    return query;
  });
  const supabase = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.userId === null ? null : { id: options.userId ?? owner } } })), oauth: { revokeGrant } },
    from, rpc,
  };
  return { supabase, events, rpc, revokeGrant, from };
}

describe('MCP connection settings', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('lists only active owner rows by last activity, falling back to connection time, without scope', async () => {
    const rows = [
      connection(owner, clientA, '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z'),
      connection(owner, clientB, '2026-10-23T00:00:00Z'),
      connection(owner, clientC, '2026-10-24T00:00:00Z', null, '2026-10-25T00:00:00Z'),
      connection(other, clientC, '2026-10-25T00:00:00Z'),
    ];
    const { supabase, from } = fakeSession(rows);
    const result = await listMcpConnections(supabase as never, owner);
    expect(result).toMatchObject({ ok: true, connections: [{ clientId: clientB }, { clientId: clientA }] });
    expect(JSON.stringify(result)).not.toContain('scopes');
    expect(JSON.stringify(result)).not.toContain('revoked_at');
    expect(from).toHaveBeenCalledWith('mcp_connections');
  });

  it('shows only the new DCR client after reconnecting with the same name and host', async () => {
    const rows = [
      connection(owner, clientA, '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z', '2026-10-24T00:00:00Z'),
      connection(owner, clientB, '2026-10-24T00:00:00Z'),
    ];
    const { supabase } = fakeSession(rows);
    expect(await listMcpConnections(supabase as never, owner)).toMatchObject({
      ok: true, connections: [{ clientId: clientB }],
    });
  });

  it('disconnects an owned connection in database-first order', async () => {
    const rows = [connection(owner, clientA, '2026-10-01T00:00:00Z')];
    const fake = fakeSession(rows);
    h.createClient.mockResolvedValue(fake.supabase);
    const result = await disconnectMcpConnectionAction(clientA);
    expect(result.status).toBe('disconnected');
    expect(fake.events).toEqual(['mcp_disconnect', 'revokeGrant']);
    expect(fake.rpc).toHaveBeenCalledWith('mcp_disconnect', { p_client_id: clientA });
    expect(fake.revokeGrant).toHaveBeenCalledWith({ clientId: clientA });
    expect(rows[0].revoked_at).not.toBeNull();
    expect(h.revalidatePath).toHaveBeenCalledWith('/studio/settings/mcp-connections');
  });

  it('reports partial cleanup after database revocation when revokeGrant fails', async () => {
    const rows = [connection(owner, clientA, '2026-10-01T00:00:00Z')];
    const fake = fakeSession(rows, { grantError: true });
    h.createClient.mockResolvedValue(fake.supabase);
    const result = await disconnectMcpConnectionAction(clientA);
    expect(result).toMatchObject({ ok: false, status: 'partial' });
    expect(fake.events).toEqual(['mcp_disconnect', 'revokeGrant']);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain('private');
    expect(h.revalidatePath).toHaveBeenCalledWith('/studio/settings/mcp-connections');
  });

  it.each([null, 'reader'])('rejects session without a writer (%s)', async (role) => {
    const fake = fakeSession([connection(owner, clientA, '2026-10-01T00:00:00Z')], role === null ? { userId: null } : { role });
    h.createClient.mockResolvedValue(fake.supabase);
    expect((await disconnectMcpConnectionAction(clientA)).ok).toBe(false);
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.revokeGrant).not.toHaveBeenCalled();
  });

  it('rejects malformed UUID before either revocation step', async () => {
    const fake = fakeSession([]);
    h.createClient.mockResolvedValue(fake.supabase);
    expect((await disconnectMcpConnectionAction('not-a-uuid')).status).toBe('invalid');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.revokeGrant).not.toHaveBeenCalled();
  });

  it('does nothing for another user ID or a repeated disconnect', async () => {
    const rows = [connection(other, clientB, '2026-10-01T00:00:00Z'), connection(owner, clientA, '2026-10-01T00:00:00Z', null, '2026-10-02T00:00:00Z')];
    const fake = fakeSession(rows);
    h.createClient.mockResolvedValue(fake.supabase);
    expect((await disconnectMcpConnectionAction(clientB)).status).toBe('already_disconnected');
    expect((await disconnectMcpConnectionAction(clientA)).status).toBe('already_disconnected');
    expect(rows[0].revoked_at).toBeNull();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.revokeGrant).not.toHaveBeenCalled();
  });

  it('stops before revokeGrant on database failure', async () => {
    const fake = fakeSession([connection(owner, clientA, '2026-10-01T00:00:00Z')], { rpcError: true });
    h.createClient.mockResolvedValue(fake.supabase);
    const result = await disconnectMcpConnectionAction(clientA);
    expect(result).toMatchObject({ ok: false, status: 'error' });
    expect(fake.events).toEqual(['mcp_disconnect']);
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
