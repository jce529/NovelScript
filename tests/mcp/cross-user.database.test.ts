import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  callWhoami, cleanupMcpOAuth, createWriter, issueMcpToken, restRows, secondsLeft,
  type IssuedToken, type Writer,
} from '../helpers/mcp-oauth';
import { assertDisposableRef } from '../helpers/disposable-ref';

/**
 * Cross-user / cross-client isolation for /mcp with real Supabase OAuth tokens.
 * Run only at the 12-06 gate against a disposable project with 0037/0038 applied and the
 * Supabase OAuth server enabled. SUPABASE_DB_URL marks this file for vitest's serialized
 * db project.
 */
const ref = process.env.MCP_DISPOSABLE_PROJECT_REF?.trim();
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ready = Boolean(ref && dbUrl && apiUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!ready)('MCP cross-user and cross-client isolation', () => {
  let writerA: Writer;
  let writerB: Writer;
  let aX: IssuedToken; // writer A via client X
  let aY: IssuedToken; // writer A via client Y (separate active grant)
  let bZ: IssuedToken; // writer B via client Z
  const clientIds: string[] = [];

  beforeAll(async () => {
    assertDisposableRef();
    process.env.MCP_PUBLIC_ORIGIN ??= 'http://localhost:3000';
    writerA = await createWriter();
    writerB = await createWriter();
    // Distinct client names so D-20 auto-revoke (same writer/name/host) does not fire.
    aX = await issueMcpToken(writerA, { clientName: 'mcp-test-A-X' });
    aY = await issueMcpToken(writerA, { clientName: 'mcp-test-A-Y' });
    bZ = await issueMcpToken(writerB, { clientName: 'mcp-test-B-Z' });
    clientIds.push(aX.clientId, aY.clientId, bZ.clientId);
    for (const token of [aX, aY, bZ]) expect(secondsLeft(token.claims)).toBeGreaterThan(300);
  });
  afterAll(async () => {
    await cleanupMcpOAuth(clientIds, [writerA, writerB].filter(Boolean));
  });

  it('each token resolves only to its own owner', async () => {
    expect(await callWhoami(aX.accessToken)).toMatchObject({ status: 200, userId: writerA.id });
    expect(await callWhoami(aY.accessToken)).toMatchObject({ status: 200, userId: writerA.id });
    expect(await callWhoami(bZ.accessToken)).toMatchObject({ status: 200, userId: writerB.id });
  });

  it('B token cannot reach A through tool arguments', async () => {
    const result = await callWhoami(bZ.accessToken, { userId: writerA.id });
    expect(result.userId).not.toBe(writerA.id);
    if (!result.isError) expect(result.userId).toBe(writerB.id);
  });

  it('A OAuth token cannot read B connection rows (or its own) over REST', async () => {
    for (const query of [`oauth_client_id=eq.${bZ.clientId}&select=*`, `user_id=eq.${writerB.id}&select=*`, 'select=*']) {
      const result = await restRows('mcp_connections', query, aX.accessToken);
      expect([200, 403]).toContain(result.status);
      if (result.status === 200) expect(result.rows).toEqual([]);
    }
  });

  it('B OAuth token cannot read A resources over REST', async () => {
    for (const [table, query] of [
      ['mcp_connections', `user_id=eq.${writerA.id}&select=*`],
      ['wallets', `id=eq.${writerA.id}&select=*`],
    ] as const) {
      const result = await restRows(table, query, bZ.accessToken);
      expect([200, 403]).toContain(result.status);
      if (result.status === 200) expect(result.rows).toEqual([]);
    }
  });

  it("A browser session sees only A's connection rows", async () => {
    const { data, error } = await writerA.browser.from('mcp_connections').select('user_id, oauth_client_id');
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<{ user_id: string; oauth_client_id: string }>;
    expect(rows.every((row) => row.user_id === writerA.id)).toBe(true);
    expect(rows.some((row) => row.oauth_client_id === bZ.clientId)).toBe(false);
  });

  it("A cannot disconnect B's connection; B keeps working", async () => {
    const { error } = await writerA.browser.rpc('mcp_disconnect', { p_client_id: bZ.clientId });
    expect(error).toBeNull(); // no-op: the update is scoped to A's rows
    expect(await callWhoami(bZ.accessToken)).toMatchObject({ status: 200, userId: writerB.id });
  });

  it('a client X token cannot authenticate with the same writer\'s client Y grant', async () => {
    // Approved at Supabase but without our grant row, while A's Y grant is active.
    const w = await issueMcpToken(writerA, { clientName: 'mcp-test-A-W', connect: false });
    clientIds.push(w.clientId);
    expect(secondsLeft(w.claims)).toBeGreaterThan(0);
    expect((await callWhoami(w.accessToken)).status).toBe(401);
    expect(await callWhoami(aY.accessToken)).toMatchObject({ status: 200, userId: writerA.id });
  });

  it("B cannot ride A's client grant by authorizing the same client ID", async () => {
    // B uses A's registered client X but has no grant row for it.
    const bX = await issueMcpToken(writerB, { clientId: aX.clientId, clientName: 'mcp-test-A-X', connect: false });
    expect(bX.claims.client_id).toBe(aX.clientId);
    expect((await callWhoami(bX.accessToken)).status).toBe(401);
  });

  it('revoking one client blocks only that client token', async () => {
    expect((await writerA.browser.rpc('mcp_disconnect', { p_client_id: aX.clientId })).error).toBeNull();
    expect((await callWhoami(aX.accessToken)).status).toBe(401);
    expect(secondsLeft(aX.claims)).toBeGreaterThan(0);
    expect(await callWhoami(aY.accessToken)).toMatchObject({ status: 200, userId: writerA.id });
    expect(await callWhoami(bZ.accessToken)).toMatchObject({ status: 200, userId: writerB.id });
  });
});
