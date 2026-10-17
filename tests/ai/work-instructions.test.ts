import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ checkWriteAccess: vi.fn() }));
vi.mock('@/lib/auth/write-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/write-access')>();
  return { ...actual, checkWriteAccess: mocks.checkWriteAccess };
});

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getWorkSystemInstruction,
  saveWorkSystemInstruction,
  WORK_INSTRUCTION_MAX_LENGTH,
} from '@/lib/ai/work-instructions';

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORK_A = '22222222-2222-4222-8222-222222222222';
const WORK_B = '33333333-3333-4333-8333-333333333333';

type Result = { data: unknown; error: unknown };
type Call = { table: string; method: string; args: unknown[] };

/** Chainable PostgREST fake. Terminal results are queued per table. */
function fakeClient(results: Record<string, Result[]>) {
  const calls: Call[] = [];
  const store = new Map<string, string>();
  const client = {
    from(table: string) {
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      const record = (method: string) => (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'upsert') {
          const row = args[0] as { work_id: string; instruction: string };
          chain.__pending = () => row;
        }
        return chain;
      };
      for (const m of ['select', 'eq', 'is', 'upsert']) chain[m] = record(m);
      const terminal = (method: string) => async (...args: unknown[]) => {
        calls.push({ table, method, args });
        const next = results[table]?.shift() ?? { data: null, error: null };
        if (!next.error && chain.__pending) {
          const row = chain.__pending() as { work_id: string; instruction: string };
          store.set(row.work_id, row.instruction);
        }
        return next;
      };
      chain.maybeSingle = terminal('maybeSingle');
      chain.single = terminal('single');
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, store };
}

const owned = (id = WORK_A): Result => ({ data: { id }, error: null });

describe('getWorkSystemInstruction', () => {
  it('returns an empty instruction when no row exists', async () => {
    const { client, calls } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: null, error: null }] });
    expect(await getWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A })).toEqual({ ok: true, instruction: '' });
    expect(calls).toEqual(expect.arrayContaining([
      { table: 'works', method: 'eq', args: ['id', WORK_A] },
      { table: 'works', method: 'eq', args: ['owner_id', OWNER] },
      { table: 'works', method: 'is', args: ['deleted_at', null] },
      { table: 'work_ai_instructions', method: 'eq', args: ['work_id', WORK_A] },
      { table: 'work_ai_instructions', method: 'maybeSingle', args: [] },
    ]));
  });

  it('returns the stored instruction', async () => {
    const { client } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: { instruction: '존댓말 금지' }, error: null }] });
    expect(await getWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A })).toEqual({ ok: true, instruction: '존댓말 금지' });
  });

  it('separates DB errors from an empty instruction', async () => {
    const { client } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: null, error: { message: 'boom' } }] });
    const result = await getWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('boom');
  });

  it('blocks reads when ownership or deleted_at check fails', async () => {
    const { client, calls } = fakeClient({ works: [{ data: null, error: null }] });
    const result = await getWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A });
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.table === 'work_ai_instructions')).toBe(false);
  });

  it('fails when the ownership lookup itself errors', async () => {
    const { client, calls } = fakeClient({ works: [{ data: null, error: { message: 'down' } }] });
    expect((await getWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A })).ok).toBe(false);
    expect(calls.some((c) => c.table === 'work_ai_instructions')).toBe(false);
  });

  it('rejects non-uuid input without touching the DB', async () => {
    const { client, calls } = fakeClient({});
    expect((await getWorkSystemInstruction(client, { ownerId: OWNER, workId: 'nope' })).ok).toBe(false);
    expect((await getWorkSystemInstruction(client, { ownerId: 'x', workId: WORK_A })).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('saveWorkSystemInstruction', () => {
  beforeEach(() => {
    mocks.checkWriteAccess.mockReset();
    mocks.checkWriteAccess.mockResolvedValue({ ok: true });
  });

  it('checks write access, re-checks ownership and upserts on work_id', async () => {
    const { client, calls } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: { instruction: '짧게' }, error: null }] });
    const result = await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: '  짧게  ' });
    expect(result).toEqual({ ok: true, instruction: '짧게' });
    expect(mocks.checkWriteAccess).toHaveBeenCalledWith(client, OWNER);
    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert?.table).toBe('work_ai_instructions');
    const [row, options] = upsert!.args as [Record<string, unknown>, Record<string, unknown>];
    expect(row).toMatchObject({ work_id: WORK_A, instruction: '짧게' });
    expect(typeof row.updated_at).toBe('string');
    expect(options).toEqual({ onConflict: 'work_id' });
    const ownershipIdx = calls.findIndex((c) => c.table === 'works');
    expect(ownershipIdx).toBeGreaterThanOrEqual(0);
    expect(ownershipIdx).toBeLessThan(calls.indexOf(upsert!));
  });

  it('saving work A does not touch work B', async () => {
    const { client, store } = fakeClient({
      works: [owned(WORK_A), owned(WORK_B)],
      work_ai_instructions: [{ data: { instruction: 'A' }, error: null }, { data: { instruction: 'B' }, error: null }],
    });
    await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: 'A' });
    await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_B, instruction: 'B' });
    await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: 'A2' });
    expect(store.get(WORK_B)).toBe('B');
  });

  it('treats empty or whitespace-only input as clearing the instruction', async () => {
    const { client, calls } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: { instruction: '' }, error: null }] });
    expect(await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: '   ' })).toEqual({ ok: true, instruction: '' });
    const upsert = calls.find((c) => c.method === 'upsert');
    expect((upsert!.args[0] as { instruction: string }).instruction).toBe('');
  });

  it('accepts exactly 4000 characters and rejects 4001', async () => {
    expect(WORK_INSTRUCTION_MAX_LENGTH).toBe(4000);
    const ok = fakeClient({ works: [owned()], work_ai_instructions: [{ data: { instruction: 'x'.repeat(4000) }, error: null }] });
    expect((await saveWorkSystemInstruction(ok.client, { ownerId: OWNER, workId: WORK_A, instruction: 'x'.repeat(4000) })).ok).toBe(true);

    const tooLong = fakeClient({});
    expect((await saveWorkSystemInstruction(tooLong.client, { ownerId: OWNER, workId: WORK_A, instruction: 'x'.repeat(4001) })).ok).toBe(false);
    expect(tooLong.calls).toHaveLength(0);
  });

  it('rejects non-string instructions', async () => {
    const { client, calls } = fakeClient({});
    for (const bad of [null, undefined, 42, { text: 'x' }]) {
      const result = await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: bad as unknown as string });
      expect(result.ok).toBe(false);
    }
    expect(calls).toHaveLength(0);
    expect(mocks.checkWriteAccess).not.toHaveBeenCalled();
  });

  it('returns the write denial and never writes for a suspended account', async () => {
    mocks.checkWriteAccess.mockResolvedValue({ ok: false, code: 'write_suspended', error: '제한', permanent: false, sanctionedUntil: null });
    const { client, calls } = fakeClient({});
    const result = await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: 'x' });
    expect(result).toEqual({ ok: false, error: '제한' });
    expect(calls).toHaveLength(0);
  });

  it('blocks writes when the ownership re-check fails', async () => {
    const { client, calls } = fakeClient({ works: [{ data: null, error: null }] });
    expect((await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: 'x' })).ok).toBe(false);
    expect(calls.some((c) => c.method === 'upsert')).toBe(false);
  });

  it('does not report success when the upsert fails', async () => {
    const { client, store } = fakeClient({ works: [owned()], work_ai_instructions: [{ data: null, error: { message: 'rls' } }] });
    const result = await saveWorkSystemInstruction(client, { ownerId: OWNER, workId: WORK_A, instruction: 'new' });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('rls');
    expect(store.has(WORK_A)).toBe(false);
  });
});
