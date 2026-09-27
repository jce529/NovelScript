import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));

import { preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { createFakeLedgerAdmin, type FakeLedgerOptions } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

const OWNER = '10000000-0000-4000-8000-000000000001';
const KEY = '60000000-0000-4000-8000-000000000001';
const identity = { ownerId: OWNER, idempotencyKey: KEY, modelTier: 'lite' as const };
const session = (access: 'ok' | 'suspended' = 'ok') => ({
  rpc: async () => ({ data: access === 'ok'
    ? { can_write: true, reason: 'ok', sanctioned_until: null }
    : { can_write: false, reason: 'suspended', sanctioned_until: '2030-01-01T00:00:00+00:00' }, error: null }),
}) as unknown as SupabaseClient;

function setup(opts: FakeLedgerOptions) {
  const admin = createFakeLedgerAdmin(opts);
  adminState.client = admin.client;
  return admin;
}

beforeEach(() => vi.restoreAllMocks());

describe('paid generation lifecycle', () => {
  it('denies writes before reading the wallet', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const result = await preflightPaidGeneration(session('suspended'), identity);
    expect(result).toMatchObject({ ok: false, chatResult: { status: 'failed', failureKind: 'write_denied' } });
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('returns already_processed for an existing ledger key', async () => {
    setup({ balances: { [OWNER]: 100 }, ledger: [{ wallet_id: OWNER, reference_type: 'ai_generation', reference_id: KEY }] });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toMatchObject({ ok: false, chatResult: { status: 'already_processed' } });
  });

  it('caps a zero balance before generation', async () => {
    setup({ balances: { [OWNER]: 0 } });
    await expect(preflightPaidGeneration(session(), identity)).resolves.toEqual({
      ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'insufficient_balance', error: CHAT_COPY.insufficient_balance, wasCapped: true, remainingBalance: 0 },
    });
  });

  it('does not debit a ProviderCallError', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const client = createMockProvider() as unknown as ProviderClient;
    const settled = await settlePaidGeneration(client, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => {
      throw new ProviderCallError({ provider: 'gemini', status: 429, kind: 'rate_limited', providerErrorCode: 'RESOURCE_EXHAUSTED' });
    });
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'rate_limited' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
  });

  it('settles the original result once with the supplied ledger reason', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const result = okResult('body', 10, 10);
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'document:1' }, async () => result);
    expect(settled).toMatchObject({ kind: 'completed', result });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toEqual([['apply_wallet_delta', expect.objectContaining({
      p_reference_type: 'ai_generation', p_reference_id: KEY, p_reason: 'document:1',
    })]]);
  });

  it('does not debit when the post-generation write check is denied', async () => {
    const admin = setup({ balances: { [OWNER]: 100 }, access: 'suspended' });
    const ctx = { admin: admin.client, walletBalance: 100, model: 'model', maxOutputTokens: 1 };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, ctx, { ...identity, ledgerReason: 'test' }, async () => okResult());
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { failureKind: 'write_denied' } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(0);
  });

  it('debits a structured refusal and returns it as terminal', async () => {
    const admin = setup({ balances: { [OWNER]: 100 } });
    const pre = await preflightPaidGeneration(session(), identity);
    if (!pre.ok) throw new Error('preflight failed');
    const refusal = { ...okResult(), refusal: { stage: 'input' as const, reasonCode: 'SAFETY' as const }, finishReason: 'refusal' as const };
    const settled = await settlePaidGeneration(createMockProvider() as unknown as ProviderClient, pre.ctx, { ...identity, ledgerReason: 'test' }, async () => refusal);
    expect(settled).toMatchObject({ kind: 'terminal', chatResult: { status: 'refused', refusal: { reasonCode: 'SAFETY' } } });
    expect(admin.rpc.mock.calls.filter(c => c[0] === 'apply_wallet_delta')).toHaveLength(1);
  });
});
