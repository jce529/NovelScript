import type { TransactionSql } from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';

describe.skipIf(!process.env.SUPABASE_DB_URL)('AI usage database contract', () => {
  let ownerId = '';
  let db: ReturnType<typeof pgPool>;
  const admin = () => adminClient();
  type Probe = (sp: TransactionSql) => PromiseLike<unknown>;
  const denied = async (tx: TransactionSql, probe: Probe) => {
    try { await tx.savepoint(probe); return false; } catch { return true; }
  };

  beforeEach(async () => { db = pgPool(1); ownerId = (await createTestUser()).id; });
  afterEach(async () => { if (ownerId) { await deleteTestUser(ownerId); ownerId = ''; } if (db) await db.end(); });

  it('has only safe telemetry columns and required constraints, indexes, and comment', async () => {
    const columns = await db`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage'`;
    const names = columns.map((row) => String(row.column_name));
    expect(names).toEqual(expect.arrayContaining(['owner_id', 'provider', 'model', 'key_source', 'status', 'input_tokens', 'output_tokens', 'thoughts_tokens', 'idempotency_key', 'work_id', 'chapter_id', 'created_at']));
    expect(names.some((name) => /prompt|response|raw_error|secret/i.test(name))).toBe(false);
    const table = await db`select obj_description('public.ai_usage'::regclass) as comment`;
    expect(String(table[0]?.comment)).toMatch(/not authoritative for settlement or accounting/i);
    const indexes = await db`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'ai_usage'`;
    expect(indexes.some((row) => String(row.indexdef).includes('(owner_id, idempotency_key)'))).toBe(true);
    expect(indexes.some((row) => String(row.indexdef).includes('(owner_id, key_source, created_at)'))).toBe(true);
  });

  it('allows only owner reads and denies authenticated writes', async () => {
    const policies = await db`select policyname, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'ai_usage'`;
    expect(policies).toEqual(expect.arrayContaining([expect.objectContaining({ policyname: 'ai_usage_select_own', cmd: 'SELECT' })]));
    const grants = await db`select privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'ai_usage' and grantee = 'authenticated'`;
    expect(grants.map((row) => String(row.privilege_type))).toEqual(['SELECT']);
    const results = await db.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: ownerId, role: 'authenticated' })}, true)`;
      return [
        await denied(tx, (sp) => sp`insert into public.ai_usage(owner_id, provider, model, key_source, status, idempotency_key) values (${ownerId}, 'openai', 'gpt-4o-mini', 'byok', 'completed', 'deny')`),
        await denied(tx, (sp) => sp`update public.ai_usage set status = 'refused' where owner_id = ${ownerId}`),
        await denied(tx, (sp) => sp`delete from public.ai_usage where owner_id = ${ownerId}`),
      ];
    });
    expect(results).toEqual([true, true, true]);
  });

  it('sets work and chapter references null when their rows are deleted', async () => {
    const work = await admin().from('works').insert({ owner_id: ownerId, title: 'Usage test' }).select('id').single();
    expect(work.error).toBeNull();
    const chapter = await admin().from('chapters').insert({ work_id: work.data!.id, title: 'Usage test chapter', content: '', order_index: 0 }).select('id').single();
    expect(chapter.error).toBeNull();
    const id = crypto.randomUUID();
    const inserted = await admin().from('ai_usage').insert({ owner_id: ownerId, provider: 'openai', model: 'gpt-4o-mini', key_source: 'byok', status: 'completed', work_id: work.data!.id, chapter_id: chapter.data!.id, idempotency_key: id }).select('id').single();
    expect(inserted.error).toBeNull();
    await admin().from('chapters').delete().eq('id', chapter.data!.id);
    await admin().from('works').delete().eq('id', work.data!.id);
    const row = await admin().from('ai_usage').select('work_id, chapter_id').eq('id', inserted.data!.id).single();
    expect(row.data!).toEqual({ work_id: null, chapter_id: null });
    const duplicate = await admin().from('ai_usage').insert({ owner_id: ownerId, provider: 'openai', model: 'gpt-4o-mini', key_source: 'byok', status: 'completed', idempotency_key: id });
    expect(duplicate.error).not.toBeNull();
  });

  it('only marks the matching current BYOK key failed', async () => {
    const provider = 'openai';
    const key = `sk-test-${crypto.randomUUID()}`;
    expect((await admin().rpc('register_byok_key', { p_owner: ownerId, p_provider: provider, p_plaintext: key, p_hint: key.slice(-4), p_models: [] })).error).toBeNull();
    const row = await admin().from('byok_keys').select('id').eq('owner_id', ownerId).eq('provider', provider).single();
    expect(row.error).toBeNull();
    expect((await admin().rpc('mark_byok_failed', { p_owner: ownerId, p_provider: provider, p_expected_key_id: crypto.randomUUID() })).data).toBe(false);
    expect((await admin().from('byok_keys').select('status').eq('id', row.data!.id).single()).data?.status).toBe('connected');
    expect((await admin().rpc('mark_byok_failed', { p_owner: ownerId, p_provider: provider, p_expected_key_id: row.data!.id })).data).toBe(true);
    expect((await admin().from('byok_keys').select('status').eq('id', row.data!.id).single()).data?.status).toBe('failed');
  });
});
