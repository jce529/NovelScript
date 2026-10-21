import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser, pgPool } from '../helpers/db';

// Live-DB contract for migration 0030. Opt-in: needs SUPABASE_DB_URL and the migration applied (plan 11-12).
const usage = (over: Record<string, unknown> = {}) => ({
  provider: 'openai', model: 'gpt-4o-mini', status: 'completed',
  input_tokens: 10, output_tokens: 20, thoughts_tokens: 0,
  input_reported: true, output_reported: true, ...over,
});

describe.skipIf(!process.env.SUPABASE_DB_URL)('service AI settlement database contract', () => {
  let ownerId = '';
  let db: ReturnType<typeof pgPool>;
  const admin = () => adminClient();
  const settle = (owner: string, key: string, amount: number, u: Record<string, unknown> = usage()) =>
    admin().rpc('settle_service_ai_generation', {
      p_owner_id: owner, p_idempotency_key: key, p_debit_amount: amount, p_ledger_reason: 'AI 생성', p_usage: u,
    });
  const setBalance = async (owner: string, balance: number) => {
    const r = await admin().from('wallets').update({ balance }).eq('id', owner);
    expect(r.error).toBeNull();
  };
  const balanceOf = async (owner: string) =>
    Number((await admin().from('wallets').select('balance').eq('id', owner).single()).data!.balance);
  const usageRows = async (owner: string, key: string) =>
    (await admin().from('ai_usage').select('*').eq('owner_id', owner).eq('idempotency_key', key)).data ?? [];
  const ledgerRows = async (owner: string, key: string) =>
    (await admin().from('ledger_entries').select('*').eq('wallet_id', owner).eq('reference_type', 'ai_generation').eq('reference_id', key)).data ?? [];

  beforeEach(async () => { db = pgPool(2); ownerId = (await createTestUser()).id; });
  afterEach(async () => { if (ownerId) { await deleteTestUser(ownerId); ownerId = ''; } if (db) await db.end(); });

  it('zero cost settles one completed usage row, no ledger row, balance unchanged', async () => {
    await setBalance(ownerId, 50);
    const r = await settle(ownerId, 'zero-1', 0);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ kind: 'settled', debitAmount: 0, remainingBalance: 50 });
    const rows = await usageRows(ownerId, 'zero-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].service_settled_at).not.toBeNull();
    expect(rows[0].key_source).toBe('service');
    expect(await ledgerRows(ownerId, 'zero-1')).toHaveLength(0);
    expect(await balanceOf(ownerId)).toBe(50);
  });

  it('positive cost writes one usage row, one negative ledger row, exact balance', async () => {
    await setBalance(ownerId, 50);
    const r = await settle(ownerId, 'pos-1', 7);
    expect(r.data).toMatchObject({ kind: 'settled', debitAmount: 7, remainingBalance: 43 });
    expect(await usageRows(ownerId, 'pos-1')).toHaveLength(1);
    const ledger = await ledgerRows(ownerId, 'pos-1');
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].delta)).toBe(-7);
    expect(await balanceOf(ownerId)).toBe(43);
  });

  it('concurrent calls for the same owner/key settle once', async () => {
    await setBalance(ownerId, 50);
    const results = await Promise.all([1, 2, 3, 4].map(() => settle(ownerId, 'conc-1', 5)));
    const kinds = results.map((r) => (r.data as { kind: string } | null)?.kind);
    expect(kinds.filter((k) => k === 'settled')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'already_processed')).toHaveLength(3);
    expect(await ledgerRows(ownerId, 'conc-1')).toHaveLength(1);
    expect(await balanceOf(ownerId)).toBe(45);
  });

  it('same key for a different owner is independent', async () => {
    const other = (await createTestUser()).id;
    try {
      await setBalance(ownerId, 20); await setBalance(other, 20);
      expect((await settle(ownerId, 'shared-key', 3)).data).toMatchObject({ kind: 'settled' });
      expect((await settle(other, 'shared-key', 3)).data).toMatchObject({ kind: 'settled' });
    } finally { await deleteTestUser(other); }
  });

  it('resend after the balance reaches zero is already_processed, not insufficient', async () => {
    await setBalance(ownerId, 5);
    expect((await settle(ownerId, 'drain-1', 5)).data).toMatchObject({ kind: 'settled', remainingBalance: 0 });
    const again = await settle(ownerId, 'drain-1', 5);
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ kind: 'already_processed', remainingBalance: 0 });
  });

  it('insufficient balance rolls back; a pre-existing unsettled usage stays unsettled, later success settles once', async () => {
    await setBalance(ownerId, 1);
    const pre = await admin().from('ai_usage').insert({
      owner_id: ownerId, provider: 'openai', model: 'old-model', key_source: 'service', status: 'completed', idempotency_key: 'rb-1',
    });
    expect(pre.error).toBeNull();
    const failed = await settle(ownerId, 'rb-1', 9);
    expect(failed.error).not.toBeNull();
    const rows = await usageRows(ownerId, 'rb-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].service_settled_at).toBeNull();
    expect(rows[0].model).toBe('old-model');
    expect(await ledgerRows(ownerId, 'rb-1')).toHaveLength(0);
    const fresh = await settle(ownerId, 'rb-new', 9);
    expect(fresh.error).not.toBeNull();
    expect(await usageRows(ownerId, 'rb-new')).toHaveLength(0);
    await setBalance(ownerId, 20);
    expect((await settle(ownerId, 'rb-1', 9)).data).toMatchObject({ kind: 'settled', remainingBalance: 11 });
    expect((await settle(ownerId, 'rb-1', 9)).data).toMatchObject({ kind: 'already_processed' });
    expect(await ledgerRows(ownerId, 'rb-1')).toHaveLength(1);
  });

  it('duplicate does not overwrite the first confirmed usage', async () => {
    await setBalance(ownerId, 20);
    await settle(ownerId, 'dup-1', 2);
    const dup = await settle(ownerId, 'dup-1', 2, usage({ provider: 'gemini', model: 'other', input_tokens: 999 }));
    expect(dup.data).toMatchObject({ kind: 'already_processed' });
    const [row] = await usageRows(ownerId, 'dup-1');
    expect(row).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', input_tokens: 10, key_source: 'service' });
  });

  it('rejects invalid payloads (extra fields, refused without reported tokens, negative values)', async () => {
    await setBalance(ownerId, 20);
    expect((await settle(ownerId, 'bad-1', 1, usage({ prompt: 'secret' }))).error).not.toBeNull();
    expect((await settle(ownerId, 'bad-2', 1, usage({ status: 'refused', input_reported: false, output_reported: false }))).error).not.toBeNull();
    expect((await settle(ownerId, 'bad-3', -1)).error).not.toBeNull();
    expect((await settle(ownerId, 'bad-4', 1, usage({ input_tokens: -1 }))).error).not.toBeNull();
    for (const k of ['bad-1', 'bad-2', 'bad-3', 'bad-4']) expect(await usageRows(ownerId, k)).toHaveLength(0);
    expect(await balanceOf(ownerId)).toBe(20);
  });

  it('treats an existing BYOK usage as already processed without charging', async () => {
    await setBalance(ownerId, 20);
    await admin().from('ai_usage').insert({ owner_id: ownerId, provider: 'openai', model: 'm', key_source: 'byok', status: 'completed', idempotency_key: 'byok-1' });
    expect((await settle(ownerId, 'byok-1', 4)).data).toMatchObject({ kind: 'already_processed' });
    expect(await balanceOf(ownerId)).toBe(20);
  });

  it('allows service_role only to execute the RPC', async () => {
    const anon = await anonClient().rpc('settle_service_ai_generation', {
      p_owner_id: ownerId, p_idempotency_key: 'anon-1', p_debit_amount: 0, p_ledger_reason: 'x', p_usage: usage(),
    });
    expect(anon.error).not.toBeNull();
    const grants = await db`
      select grantee from information_schema.routine_privileges
      where routine_schema = 'public' and routine_name = 'settle_service_ai_generation' and privilege_type = 'EXECUTE'`;
    const grantees = grants.map((g) => String(g.grantee));
    expect(grantees).toContain('service_role');
    expect(grantees).not.toContain('anon');
    expect(grantees).not.toContain('authenticated');
    expect(grantees).not.toContain('PUBLIC');
  });

  it('keeps the safe-telemetry shape and accounting-neutral comment', async () => {
    const cols = (await db`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'ai_usage'`).map((r) => String(r.column_name));
    expect(cols).toContain('service_settled_at');
    expect(cols.some((c) => /prompt|response|raw_error|secret/i.test(c))).toBe(false);
    const c = await db`select obj_description('public.ai_usage'::regclass) as comment`;
    expect(String(c[0]?.comment)).toMatch(/not authoritative for settlement or accounting/i);
  });

  it('backfill marks only service usages with a matching ledger row and preserves history (rolled back)', async () => {
    const sql = readFileSync('supabase/migrations/0030_ai_usage_service_settlement.sql', 'utf8');
    const backfill = sql.split('-- BACKFILL-BEGIN')[1]?.split('-- BACKFILL-END')[0]?.trim();
    expect(backfill).toMatch(/^update public\.ai_usage/);
    await setBalance(ownerId, 30);
    const rolledBack = new Error('rollback');
    let observed: Record<string, unknown> = {};
    await db.begin(async (tx) => {
      const ins = (key: string, source: string) => tx`
        insert into public.ai_usage (owner_id, provider, model, key_source, status, idempotency_key)
        values (${ownerId}, 'openai', 'm', ${source}, 'completed', ${key})`;
      await ins('bf-ledger0', 'service'); await ins('bf-ledgerpos', 'service');
      await ins('bf-noledger', 'service'); await ins('bf-byok', 'byok');
      await tx`insert into public.ledger_entries (wallet_id, delta, balance_after, reference_type, reference_id, reason)
        values (${ownerId}, 0, 30, 'ai_generation', 'bf-ledger0', 'old zero'),
               (${ownerId}, -4, 26, 'ai_generation', 'bf-ledgerpos', 'old charge'),
               (${ownerId}, 0, 30, 'ai_generation', 'bf-orphan', 'old zero without usage'),
               (${ownerId}, 0, 30, 'ai_generation', 'bf-byok', 'byok with ledger')`;
      await tx.unsafe(backfill!.replace(/;\s*$/, '') + ` and u.owner_id = '${ownerId}'`);
      const marks = await tx`select idempotency_key, service_settled_at is not null as settled from public.ai_usage where owner_id = ${ownerId}`;
      const ledger = await tx`select count(*)::int as n from public.ledger_entries where wallet_id = ${ownerId}`;
      const orphanUsage = await tx`select count(*)::int as n from public.ai_usage where owner_id = ${ownerId} and idempotency_key = 'bf-orphan'`;
      observed = { marks: Object.fromEntries(marks.map((m) => [m.idempotency_key, m.settled])), ledger: ledger[0].n, orphanUsage: orphanUsage[0].n };
      throw rolledBack;
    }).catch((e) => { if (e !== rolledBack) throw e; });
    expect(observed).toEqual({
      marks: { 'bf-ledger0': true, 'bf-ledgerpos': true, 'bf-noledger': false, 'bf-byok': false },
      ledger: 4,
      orphanUsage: 0,
    });
    expect(await balanceOf(ownerId)).toBe(30);
  });
});
