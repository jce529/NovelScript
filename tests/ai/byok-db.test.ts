import type { TransactionSql } from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';

describe.skipIf(!process.env.SUPABASE_DB_URL)('BYOK database and Vault contract', () => {
  let ownerId = '';
  let otherId = '';
  const provider = 'openai';
  let secret = '';
  let secretId = '';
  let admin: ReturnType<typeof adminClient>;
  let db: ReturnType<typeof pgPool>;

  beforeEach(async () => { admin = adminClient(); db = pgPool(1); ownerId = (await createTestUser()).id; });
  afterEach(async () => {
    if (otherId) { await deleteTestUser(otherId); otherId = ''; }
    if (ownerId) { await deleteTestUser(ownerId); ownerId = ''; }
    if (db) await db.end();
  });
  const register = async (owner = ownerId, apiKey = `sk-test-${crypto.randomUUID()}`) => {
    secret = apiKey;
    const result = await admin.rpc('register_byok_key', { p_owner: owner, p_provider: provider, p_plaintext: apiKey, p_hint: apiKey.slice(-4), p_models: ['gpt-4o-mini'] });
    const row = await admin.from('byok_keys').select('secret_id').eq('owner_id', owner).eq('provider', provider).maybeSingle();
    if (row.data?.secret_id) secretId = String(row.data.secret_id);
    return result;
  };
  // postgres.js does not surface raw SAVEPOINT SQL errors to try/catch; tx.savepoint() does.
  type Probe = (sp: TransactionSql) => PromiseLike<unknown>;
  const isDenied = async (tx: TransactionSql, run: Probe) => {
    try { await tx.savepoint(run); return false; } catch { return true; }
  };
  const secretCount = async () => Number((await db`select count(*)::int as count from vault.secrets where id = ${secretId}`)[0]?.count ?? 0);

  it('creates one Vault secret and metadata row through service registration', async () => {
    const result = await register(); expect(result.error).toBeNull();
    const { data, error } = await admin.from('byok_keys').select('id, owner_id, provider, secret_id, masked_hint, status, model_ids').eq('owner_id', ownerId).eq('provider', provider).single();
    expect(error).toBeNull(); expect(data).toMatchObject({ owner_id: ownerId, provider, secret_id: secretId, status: 'connected', model_ids: ['gpt-4o-mini'] });
  });
  it('lets the service role decrypt a registered key', async () => {
    expect((await register()).error).toBeNull();
    const { data, error } = await admin.rpc('get_byok_secret', { p_owner: ownerId, p_provider: provider, p_include_failed: false });
    expect(error).toBeNull(); expect(data).toBe(secret);
  });
  it('rejects duplicate owner/provider registration without orphaning a secret', async () => {
    expect((await register()).error).toBeNull(); const before = await secretCount();
    expect((await register(ownerId, `sk-test-${crypto.randomUUID()}`)).error).not.toBeNull();
    expect(await secretCount()).toBe(before);
  });
  it('blocks normal decrypt for failed keys and permits explicit recheck decrypt', async () => {
    expect((await register()).error).toBeNull();
    expect((await admin.rpc('set_byok_status', { p_owner: ownerId, p_provider: provider, p_status: 'failed', p_models: [] })).error).toBeNull();
    expect((await admin.rpc('get_byok_secret', { p_owner: ownerId, p_provider: provider, p_include_failed: false })).data).toBeNull();
    expect((await admin.rpc('get_byok_secret', { p_owner: ownerId, p_provider: provider, p_include_failed: true })).data).toBe(secret);
  });
  it('deletes metadata and its Vault secret together', async () => {
    expect((await register()).error).toBeNull();
    expect((await admin.rpc('delete_byok_key', { p_owner: ownerId, p_provider: provider })).error).toBeNull();
    expect((await admin.from('byok_keys').select('id').eq('owner_id', ownerId)).data).toEqual([]);
    expect(await secretCount()).toBe(0);
  });
  it('changes a deleted BYOK default to service and returns true', async () => {
    expect((await register()).error).toBeNull();
    await admin.from('profiles').update({ default_provider: provider, default_model: 'gpt-4o-mini', default_key_source: 'byok' }).eq('id', ownerId);
    expect((await admin.rpc('delete_byok_key', { p_owner: ownerId, p_provider: provider })).data).toBe(true);
    expect((await admin.from('profiles').select('default_key_source').eq('id', ownerId).single()).data?.default_key_source).toBe('service');
  });
  it('claims validation at most twice in the configured window', async () => {
    const claims = await Promise.all([1, 2, 3].map(() => admin.rpc('claim_byok_validation', { p_owner: ownerId, p_limit: 2, p_window_seconds: 60 })));
    const granted = claims.map((claim) => claim.data);
    expect(granted.filter((value) => value === true)).toHaveLength(2);
    expect(granted.filter((value) => value === false)).toHaveLength(1);
  });
  it('denies anon execution of all five service RPCs', async () => {
    const anon = anonClient();
    const calls = [
      anon.rpc('register_byok_key', { p_owner: ownerId, p_provider: provider, p_plaintext: 'never-log-this-secret', p_hint: 'cret', p_models: [] }),
      anon.rpc('get_byok_secret', { p_owner: ownerId, p_provider: provider, p_include_failed: false }),
      anon.rpc('set_byok_status', { p_owner: ownerId, p_provider: provider, p_status: 'failed', p_models: [] }),
      anon.rpc('delete_byok_key', { p_owner: ownerId, p_provider: provider }),
      anon.rpc('claim_byok_validation', { p_owner: ownerId, p_limit: 2, p_window_seconds: 60 }),
    ];
    expect((await Promise.all(calls)).every((result) => result.error)).toBe(true);
  });
  it('denies authenticated execution of all five service RPCs', async () => {
    const denied = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      const queries: Probe[] = [
        (sp) => sp`select register_byok_key(${ownerId}::uuid, ${provider}, 'never-log-this-secret', 'cret', '{}')`,
        (sp) => sp`select get_byok_secret(${ownerId}::uuid, ${provider})`,
        (sp) => sp`select set_byok_status(${ownerId}::uuid, ${provider}, 'failed', '{}')`,
        (sp) => sp`select delete_byok_key(${ownerId}::uuid, ${provider})`,
        (sp) => sp`select claim_byok_validation(${ownerId}::uuid, 2, 60)`,
      ];
      const results: boolean[] = [];
      for (const query of queries) results.push(await isDenied(tx, query));
      return results;
    });
    expect(denied).toEqual([true, true, true, true, true]);
  });
  it('denies authenticated RPC, decrypted view, and secret_id access', async () => {
    expect((await register()).error).toBeNull();
    const results = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      const out: boolean[] = [];
      for (const query of <Probe[]>[
        (sp) => sp`select * from vault.decrypted_secrets`,
        (sp) => sp`select secret_id from byok_keys`,
        (sp) => sp`select get_byok_secret(${ownerId}::uuid, ${provider})`,
      ]) out.push(await isDenied(tx, query));
      return out;
    });
    expect(results).toEqual([true, true, true]);
  });
  it('allows authenticated users to read public metadata for themselves but not others', async () => {
    expect((await register()).error).toBeNull(); otherId = (await createTestUser()).id;
    expect((await register(otherId)).error).toBeNull();
    const result = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      return tx`select owner_id, masked_hint, status, model_ids from byok_keys order by owner_id`;
    });
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ owner_id: ownerId, status: 'connected' });
  });
  it('denies authenticated direct INSERT, UPDATE, and DELETE on metadata', async () => {
    const result = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      const denied: boolean[] = [];
      for (const operation of <Probe[]>[
        (sp) => sp`insert into byok_keys(owner_id, provider, secret_id, masked_hint, status, model_ids) values (${ownerId}, 'openai', gen_random_uuid(), '1234', 'connected', '{}')`,
        (sp) => sp`update byok_keys set status = 'failed' where owner_id = ${ownerId}`,
        (sp) => sp`delete from byok_keys where owner_id = ${ownerId}`,
      ]) denied.push(await isDenied(tx, operation));
      return denied;
    });
    expect(result).toEqual([true, true, true]);
  });
  it('allows authenticated users to update their default_key_source', async () => {
    const result = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      return tx`update profiles set default_key_source = 'service' where id = ${ownerId} returning default_key_source`;
    });
    expect(result[0]?.default_key_source).toBe('service');
  });
});
