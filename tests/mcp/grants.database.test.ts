import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * 12-02 DB contract. Run only at 12-06 against a disposable project with 0037/0038
 * applied and a real writer OAuth token. The entire fixture is rolled back.
 * SUPABASE_DB_URL marks this file for vitest's serialized db project.
 */
const ref = process.env.MCP_DISPOSABLE_PROJECT_REF?.trim();
const dbUrl = process.env.SUPABASE_DB_URL;
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const oauthToken = process.env.MCP_TEST_OAUTH_ACCESS_TOKEN;
const browserToken = process.env.MCP_TEST_BROWSER_ACCESS_TOKEN;

type Claims = { sub: string; client_id?: string; session_id?: string };
function tokenClaims(token: string): Claims {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Claims;
}

describe.skipIf(!ref || !dbUrl || !oauthToken || !browserToken)('MCP grants on disposable Supabase', () => {
  let sql: ReturnType<typeof postgres>;
  let claims: Claims;
  let browser: Claims;
  const query = (text: string, params: unknown[] = []) =>
    sql.unsafe(text, params as postgres.ParameterOrJSON<never>[]);

  async function asUser(identity: Claims) {
    await query('reset role');
    await query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(identity)]);
    await query("select set_config('request.jwt.claim.sub', $1, false)", [identity.sub]);
    await query('set role authenticated');
  }
  async function connect(clientId: string, name = 'Claude', host = 'claude.ai') {
    await asUser(browser);
    const [row] = await query(
      "select public.mcp_connect($1::uuid, $2, $3, array['read','propose_draft']) as revoked",
      [clientId, name, host],
    );
    await query('reset role');
    return row.revoked as string[];
  }
  async function authorize(identity: Claims = claims) {
    await asUser(identity);
    const rows = await query('select * from public.mcp_authorize_call()');
    await query('reset role');
    return rows;
  }

  beforeAll(async () => {
    const urlRef = new URL(apiUrl ?? '').hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
    const pg = new URL(dbUrl!);
    if (!ref || ref !== urlRef || !(`${pg.hostname} ${decodeURIComponent(pg.username)}`.includes(ref))) {
      throw new Error('MCP disposable ref must match both Supabase API and DB URLs');
    }
    claims = tokenClaims(oauthToken!);
    browser = tokenClaims(browserToken!);
    if (!claims.sub || !claims.client_id || !claims.session_id
      || browser.sub !== claims.sub || !browser.session_id || browser.client_id) {
      throw new Error('Expected live OAuth and browser tokens for the same writer');
    }
    sql = postgres(dbUrl!, { max: 1, prepare: false });
    await query('begin');
    const [schema] = await query("select to_regclass('public.mcp_connections') is not null as ready");
    expect(schema.ready).toBe(true);
    const [live] = await query(`select
      exists(select 1 from auth.sessions s where s.id = $1::uuid and s.user_id = $2::uuid and s.oauth_client_id = $3::uuid) as session_ok,
      exists(select 1 from auth.oauth_consents c where c.user_id = $2::uuid and c.client_id = $3::uuid and c.revoked_at is null) as consent_ok,
      exists(select 1 from auth.sessions s where s.id = $4::uuid and s.user_id = $2::uuid and s.oauth_client_id is null) as browser_ok`,
    [claims.session_id, claims.sub, claims.client_id, browser.session_id]);
    expect(live).toMatchObject({ session_ok: true, consent_ok: true, browser_ok: true });
  });
  afterAll(async () => {
    if (sql) { try { await query('rollback'); } finally { await sql.end(); } }
  });
  beforeEach(async () => {
    await query('savepoint fixture');
    await query("update public.profiles set role = 'writer', deleted_at = null where id = $1::uuid", [claims.sub]);
  });
  afterEach(async () => { await query('reset role'); await query('rollback to savepoint fixture'); });

  it('grants execution only to authenticated callers', async () => {
    for (const signature of [
      'public.mcp_connect(uuid,text,text,text[])',
      'public.mcp_disconnect(uuid)',
      'public.mcp_authorize_call()',
    ]) {
      const [permissions] = await query(`select
        has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated_ok,
        has_function_privilege('anon', $1, 'EXECUTE') as anon_ok,
        exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) a
                where p.oid = $1::regprocedure and a.grantee = 0
                  and a.privilege_type = 'EXECUTE') as public_ok`, [signature]);
      expect(permissions).toMatchObject({ authenticated_ok: true, anon_ok: false, public_ok: false });
    }
  });

  it('returns exactly one row for an active grant and zero for a browser or other client', async () => {
    expect(await connect(claims.client_id!)).toEqual([]);
    const rows = await authorize();
    expect(rows).toHaveLength(1); // Guards the RETURNS TABLE/column ambiguity regression.
    expect(rows[0]).toMatchObject({ out_user_id: claims.sub, out_scopes: ['read', 'propose_draft'] });
    expect(await authorize({ sub: claims.sub })).toHaveLength(0);
    expect(await authorize({ ...claims, client_id: crypto.randomUUID() })).toHaveLength(0);
  });

  it('denies a revoked grant and a disconnected grant immediately', async () => {
    await connect(claims.client_id!);
    await query('update public.mcp_connections set revoked_at = now() where user_id = $1::uuid', [claims.sub]);
    expect(await authorize()).toHaveLength(0);
    await connect(claims.client_id!);
    await asUser(browser);
    await query('select public.mcp_disconnect($1::uuid)', [claims.client_id]);
    await query('reset role');
    expect(await authorize()).toHaveLength(0);
  });

  it('denies deleted sessions, revoked consent, and deleted profiles', async () => {
    await connect(claims.client_id!);
    await query('delete from auth.sessions where id = $1::uuid', [claims.session_id]);
    expect(await authorize()).toHaveLength(0);
    // The savepoint restores the session before checking the other independent gates.
    await query('rollback to savepoint fixture');
    await query('savepoint fixture');
    await query("update public.profiles set role = 'writer' where id = $1::uuid", [claims.sub]);
    await connect(claims.client_id!);
    await query('update auth.oauth_consents set revoked_at = now() where user_id = $1::uuid and client_id = $2::uuid',
      [claims.sub, claims.client_id]);
    expect(await authorize()).toHaveLength(0);
    await query('rollback to savepoint fixture');
    await query('savepoint fixture');
    await query("update public.profiles set role = 'writer', deleted_at = null where id = $1::uuid", [claims.sub]);
    await connect(claims.client_id!);
    await query('update public.profiles set deleted_at = now() where id = $1::uuid', [claims.sub]);
    expect(await authorize()).toHaveLength(0);
  });

  it('allows sanctioned read and throttles last_used_at to roughly 60 seconds', async () => {
    await connect(claims.client_id!);
    await query("select set_config('app.sanction_cache_writer', 'on', false)");
    await query("update public.profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 day' where id = $1::uuid", [claims.sub]);
    const first = await authorize();
    expect(first).toHaveLength(1);
    const [used] = await query('select last_used_at from public.mcp_connections where user_id = $1::uuid and oauth_client_id = $2::uuid',
      [claims.sub, claims.client_id]);
    expect(used.last_used_at).not.toBeNull();
    // 이 파일은 한 트랜잭션 안에서 돌아 now()가 고정이다. 그래서 값을 과거로 직접 옮겨 두고
    // 스로틀 경계(60초) 안/밖에서 승인 호출이 값을 바꾸는지를 비교한다.
    await query("update public.mcp_connections set last_used_at = now() - interval '30 seconds' where user_id = $1::uuid", [claims.sub]);
    expect(await authorize()).toHaveLength(1);
    const [withinWindow] = await query(
      "select last_used_at = now() - interval '30 seconds' as unchanged from public.mcp_connections where user_id = $1::uuid and oauth_client_id = $2::uuid",
      [claims.sub, claims.client_id]);
    expect(withinWindow.unchanged).toBe(true); // 60초 안: 갱신하지 않는다
    await query("update public.mcp_connections set last_used_at = now() - interval '61 seconds' where user_id = $1::uuid", [claims.sub]);
    expect(await authorize()).toHaveLength(1);
    const [outsideWindow] = await query(
      'select last_used_at = now() as refreshed from public.mcp_connections where user_id = $1::uuid and oauth_client_id = $2::uuid',
      [claims.sub, claims.client_id]);
    expect(outsideWindow.refreshed).toBe(true); // 60초 밖: 갱신한다
  });

  it('reconnect revokes the previous same-name/host client and returns its ID', async () => {
    const previous = crypto.randomUUID();
    await connect(previous);
    expect(await connect(claims.client_id!)).toEqual([previous]);
    const [old] = await query('select revoked_at from public.mcp_connections where oauth_client_id = $1::uuid', [previous]);
    expect(old.revoked_at).not.toBeNull();
    expect(await authorize()).toHaveLength(1);
    expect(await connect(claims.client_id!)).toEqual([]);
  });
});
