import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  callWhoami, cleanupMcpOAuth, createWriter, issueMcpToken, secondsLeft,
  type IssuedToken, type Writer,
} from '../helpers/mcp-oauth';
import { assertDisposableRef } from '../helpers/disposable-ref';

/**
 * D-12 regression: a token issued BEFORE disconnect must be refused by the real /mcp
 * route on the very next call, while its exp is still in the future.
 * Run only at the 12-06 gate against a disposable project with 0037/0038 applied and the
 * Supabase OAuth server (DCR, authorization path /oauth/consent) enabled.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project.
 */
const ref = process.env.MCP_DISPOSABLE_PROJECT_REF?.trim();
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ready = Boolean(ref && dbUrl && apiUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!ready)('MCP disconnect blocks the same unexpired token on /mcp', () => {
  let writer: Writer;
  const clientIds: string[] = [];

  async function freshToken(): Promise<IssuedToken> {
    const issued = await issueMcpToken(writer);
    clientIds.push(issued.clientId);
    // Precondition for every variant: the token is live and well before exp.
    expect(secondsLeft(issued.claims)).toBeGreaterThan(300);
    const before = await callWhoami(issued.accessToken);
    expect(before).toMatchObject({ status: 200, userId: writer.id, isError: false });
    return issued;
  }

  async function expectBlockedBeforeExp(issued: IssuedToken) {
    const after = await callWhoami(issued.accessToken);
    expect(after.status).toBe(401);
    expect(after.userId).toBeNull();
    expect(after.challenge).toContain('resource_metadata=');
    // The block comes from the live grant check, not from expiry.
    expect(secondsLeft(issued.claims)).toBeGreaterThan(0);
  }

  async function connectionRevokedAt(clientId: string) {
    const { data, error } = await writer.browser.from('mcp_connections')
      .select('revoked_at').eq('oauth_client_id', clientId).maybeSingle();
    expect(error).toBeNull();
    return (data as { revoked_at: string | null } | null)?.revoked_at ?? null;
  }

  beforeAll(async () => {
    assertDisposableRef();
    process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
    writer = await createWriter();
  });
  afterAll(async () => {
    if (writer) await cleanupMcpOAuth(clientIds, [writer]);
  });

  it('variant A: our grant row only (mcp_disconnect) blocks the same token', async () => {
    const issued = await freshToken();
    const { error } = await writer.browser.rpc('mcp_disconnect', { p_client_id: issued.clientId });
    expect(error).toBeNull();
    expect(await connectionRevokedAt(issued.clientId)).not.toBeNull();
    // Supabase consent is still alive, so only our row can be what blocks the call.
    const grants = await writer.browser.auth.oauth.listGrants();
    expect(grants.data?.some((grant) => grant.client.id === issued.clientId)).toBe(true);
    await expectBlockedBeforeExp(issued);
  });

  it('variant B: Supabase revokeGrant only blocks the same token', async () => {
    const issued = await freshToken();
    const { error } = await writer.browser.auth.oauth.revokeGrant({ clientId: issued.clientId });
    expect(error).toBeNull();
    // Our grant row is untouched, so the session/consent check is what blocks the call.
    expect(await connectionRevokedAt(issued.clientId)).toBeNull();
    await expectBlockedBeforeExp(issued);
  });

  it('variant C (production path): both mcp_disconnect and revokeGrant block the same token', async () => {
    const issued = await freshToken();
    expect((await writer.browser.rpc('mcp_disconnect', { p_client_id: issued.clientId })).error).toBeNull();
    expect((await writer.browser.auth.oauth.revokeGrant({ clientId: issued.clientId })).error).toBeNull();
    await expectBlockedBeforeExp(issued);
    // A second call stays blocked (no cached allow).
    expect((await callWhoami(issued.accessToken)).status).toBe(401);
  });

  it('a DB failure on the grant RPC fails closed, and recovery restores the same token', async () => {
    const issued = await freshToken();
    const sql = postgres(dbUrl!, { max: 1, prepare: false });
    try {
      // Simulated outage of the per-call check: the RPC errors for authenticated callers.
      await sql.unsafe('revoke execute on function public.mcp_authorize_call() from authenticated');
      const during = await callWhoami(issued.accessToken);
      expect(during.status).toBe(401);
      expect(during.userId).toBeNull();
    } finally {
      await sql.unsafe('grant execute on function public.mcp_authorize_call() to authenticated');
      await sql.end();
    }
    // Same token, same grant: allowed again, which proves the 401 came from the outage.
    expect(await callWhoami(issued.accessToken)).toMatchObject({ status: 200, userId: writer.id });
  });
});
