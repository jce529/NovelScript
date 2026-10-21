import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), get: vi.fn(), save: vi.fn(), revalidate: vi.fn(), client: {} as Record<string, unknown>,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => { mocks.client.auth = { getUser: mocks.getUser }; return mocks.client; },
}));
vi.mock('@/lib/ai/work-instructions', () => ({
  getWorkSystemInstruction: mocks.get,
  saveWorkSystemInstruction: mocks.save,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import {
  loadWorkSystemInstructionAction,
  saveWorkSystemInstructionAction,
} from '@/app/studio/[workId]/ai-settings-actions';

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORK = '22222222-2222-4222-8222-222222222222';

describe('work AI settings server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } } });
    mocks.get.mockResolvedValue({ ok: true, instruction: '반말' });
    mocks.save.mockResolvedValue({ ok: true, instruction: '반말' });
  });

  it('rejects unauthenticated load and save', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await loadWorkSystemInstructionAction(WORK)).ok).toBe(false);
    expect((await saveWorkSystemInstructionAction(WORK, 'x')).ok).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('treats an auth lookup error as unauthenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt' } });
    expect((await loadWorkSystemInstructionAction(WORK)).ok).toBe(false);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('loads with the session owner id', async () => {
    expect(await loadWorkSystemInstructionAction(WORK)).toEqual({ ok: true, instruction: '반말' });
    expect(mocks.get).toHaveBeenCalledWith(mocks.client, { ownerId: OWNER, workId: WORK });
  });

  it('saves with the session owner id only and revalidates the work layout', async () => {
    const result = await saveWorkSystemInstructionAction(WORK, '반말');
    expect(result).toEqual({ ok: true, instruction: '반말' });
    expect(mocks.save).toHaveBeenCalledWith(mocks.client, { ownerId: OWNER, workId: WORK, instruction: '반말' });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/studio/${WORK}`, 'layout');
  });

  it('ignores any extra client arguments such as ownerId', async () => {
    const save = saveWorkSystemInstructionAction as unknown as (...args: unknown[]) => Promise<unknown>;
    await save(WORK, 'x', { ownerId: 'attacker', systemInstruction: 'override' });
    expect(mocks.save).toHaveBeenCalledWith(mocks.client, { ownerId: OWNER, workId: WORK, instruction: 'x' });
  });

  it('returns the DAL denial for a suspended account or foreign work without revalidating', async () => {
    mocks.save.mockResolvedValue({ ok: false, error: '계정 이용이 제한되어 있어요.' });
    expect(await saveWorkSystemInstructionAction(WORK, 'x')).toEqual({ ok: false, error: '계정 이용이 제한되어 있어요.' });
    mocks.save.mockResolvedValue({ ok: false, error: '작품을 찾을 수 없어요.' });
    expect(await saveWorkSystemInstructionAction(WORK, 'x')).toEqual({ ok: false, error: '작품을 찾을 수 없어요.' });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('does not turn a load DB error into an empty-instruction success', async () => {
    mocks.get.mockResolvedValue({ ok: false, error: '불러오지 못했어요.' });
    expect(await loadWorkSystemInstructionAction(WORK)).toEqual({ ok: false, error: '불러오지 못했어요.' });
  });

  it('fails closed when the DAL throws', async () => {
    mocks.get.mockRejectedValue(new Error('boom'));
    mocks.save.mockRejectedValue(new Error('boom'));
    const load = await loadWorkSystemInstructionAction(WORK);
    const save = await saveWorkSystemInstructionAction(WORK, 'x');
    expect(load.ok).toBe(false);
    expect(save.ok).toBe(false);
    expect(JSON.stringify([load, save])).not.toContain('boom');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
