import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, anonClient, createTestUser, deleteTestUser, signedInClient } from '../helpers/db';

/**
 * 04-08 work_ai_instructions RLS (migration 0026).
 *
 * Opt-in: 0026 is applied to the shared Supabase project only at the 04-12 checkpoint, so this
 * suite runs only when RUN_WORK_AI_INSTRUCTIONS_DB=1 is set alongside the usual DB env.
 * Until then it is skipped and must not be reported as passing.
 */
const enabled = process.env.RUN_WORK_AI_INSTRUCTIONS_DB === '1' && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!enabled)('work_ai_instructions RLS (0026)', () => {
  const admin = adminClient();
  const userIds: string[] = [];
  const workIds: string[] = [];
  let ownerA: SupabaseClient;
  let ownerB: SupabaseClient;
  let workA1 = '';
  let workA2 = '';
  let workDeleted = '';

  async function insertWork(ownerId: string, title: string) {
    const { data, error } = await admin.from('works').insert({ owner_id: ownerId, title }).select('id').single();
    if (error) throw error;
    workIds.push(data.id);
    return data.id as string;
  }

  beforeAll(async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    userIds.push(a.id, b.id);
    ownerA = await signedInClient(a);
    ownerB = await signedInClient(b);
    workA1 = await insertWork(a.id, 'Instruction A1');
    workA2 = await insertWork(a.id, 'Instruction A2');
    workDeleted = await insertWork(a.id, 'Instruction deleted');
    await admin.from('work_ai_instructions').insert({ work_id: workDeleted, instruction: 'hidden' });
    const { error } = await admin.from('works').update({ deleted_at: new Date().toISOString() }).eq('id', workDeleted);
    if (error) throw error;
  });

  afterAll(async () => {
    if (workIds.length) {
      await admin.from('work_ai_instructions').delete().in('work_id', workIds);
      await admin.from('works').delete().in('id', workIds);
    }
    for (const id of userIds) await deleteTestUser(id).catch(() => {});
  });

  it('keeps per-work values separate for the owner', async () => {
    const save1 = await ownerA.from('work_ai_instructions')
      .upsert({ work_id: workA1, instruction: 'A1 tone', updated_at: new Date().toISOString() }, { onConflict: 'work_id' });
    expect(save1.error).toBeNull();
    const save2 = await ownerA.from('work_ai_instructions')
      .upsert({ work_id: workA2, instruction: 'A2 tone', updated_at: new Date().toISOString() }, { onConflict: 'work_id' });
    expect(save2.error).toBeNull();

    const read1 = await ownerA.from('work_ai_instructions').select('instruction').eq('work_id', workA1).maybeSingle();
    const read2 = await ownerA.from('work_ai_instructions').select('instruction').eq('work_id', workA2).maybeSingle();
    expect(read1.data?.instruction).toBe('A1 tone');
    expect(read2.data?.instruction).toBe('A2 tone');
  });

  it('hides and protects the row from another owner', async () => {
    const read = await ownerB.from('work_ai_instructions').select('instruction').eq('work_id', workA1).maybeSingle();
    expect(read.data).toBeNull();

    const insert = await ownerB.from('work_ai_instructions')
      .upsert({ work_id: workA1, instruction: 'hijack' }, { onConflict: 'work_id' });
    expect(insert.error).not.toBeNull();

    await ownerB.from('work_ai_instructions').update({ instruction: 'hijack' }).eq('work_id', workA1);
    await ownerB.from('work_ai_instructions').delete().eq('work_id', workA1);
    const check = await admin.from('work_ai_instructions').select('instruction').eq('work_id', workA1).single();
    expect(check.data?.instruction).toBe('A1 tone');
  });

  it('denies anon reads and writes', async () => {
    const anon = anonClient();
    const read = await anon.from('work_ai_instructions').select('instruction').eq('work_id', workA1);
    expect(read.data ?? []).toEqual([]);
    const write = await anon.from('work_ai_instructions').insert({ work_id: workA2, instruction: 'anon' });
    expect(write.error).not.toBeNull();
  });

  it('enforces the 4000 character CHECK in the database', async () => {
    const ok = await ownerA.from('work_ai_instructions')
      .upsert({ work_id: workA2, instruction: 'x'.repeat(4000) }, { onConflict: 'work_id' });
    expect(ok.error).toBeNull();
    const tooLong = await admin.from('work_ai_instructions')
      .upsert({ work_id: workA2, instruction: 'x'.repeat(4001) }, { onConflict: 'work_id' });
    expect(tooLong.error).not.toBeNull();
  });

  it('blocks reads and writes for a soft-deleted work', async () => {
    const read = await ownerA.from('work_ai_instructions').select('instruction').eq('work_id', workDeleted).maybeSingle();
    expect(read.data).toBeNull();
    const write = await ownerA.from('work_ai_instructions')
      .upsert({ work_id: workDeleted, instruction: 'revived' }, { onConflict: 'work_id' });
    expect(write.error).not.toBeNull();
    const check = await admin.from('work_ai_instructions').select('instruction').eq('work_id', workDeleted).single();
    expect(check.data?.instruction).toBe('hidden');
  });
});
