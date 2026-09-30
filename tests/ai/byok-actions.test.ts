import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkKeyFormat: vi.fn(), validateByokKey: vi.fn(), supabaseRpc: vi.fn(), adminRpc: vi.fn(),
  consoleLog: vi.fn(), consoleError: vi.fn(),
}));

vi.mock('@/lib/ai/providers/byok-validate', () => ({ checkKeyFormat: mocks.checkKeyFormat, validateByokKey: mocks.validateByokKey }));
import { deleteByokKey, recheckByokKey, registerByokKey } from '@/lib/ai/providers/byok';

const deps = { supabase: { rpc: mocks.supabaseRpc }, admin: { rpc: mocks.adminRpc } } as never;
const ownerId = '00000000-0000-4000-8000-000000000001';

describe('BYOK actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks();
    mocks.checkKeyFormat.mockImplementation((key: string) => key.length >= 16 ? { ok: true, key } : { ok: false });
    mocks.validateByokKey.mockResolvedValue({ ok: true, modelIds: ['gpt-4o-mini'] });
    mocks.supabaseRpc.mockResolvedValue({ data: true, error: null });
    mocks.adminRpc.mockResolvedValue({ data: `sk-test-${'x'.repeat(20)}`, error: null });
  });
  it('rejects malformed input without validation or registration RPC', async () => {
    const result = await registerByokKey(deps, ownerId, 'openai', 'bad');
    expect(result).toMatchObject({ ok: false, reason: 'format' });
    expect(mocks.validateByokKey).not.toHaveBeenCalled();
    expect(mocks.supabaseRpc).not.toHaveBeenCalledWith('register_byok_key', expect.anything());
  });
  it('returns throttled without validation when the claim is denied', async () => {
    mocks.supabaseRpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await registerByokKey(deps, ownerId, 'openai', 'sk-test-valid-key-123')).toMatchObject({ ok: false, reason: 'throttled' });
    expect(mocks.validateByokKey).not.toHaveBeenCalled();
  });
  it('does not register when provider validation fails', async () => {
    mocks.validateByokKey.mockResolvedValue({ ok: false, reason: 'invalid' });
    await registerByokKey(deps, ownerId, 'openai', 'sk-test-valid-key-123');
    expect(mocks.supabaseRpc).not.toHaveBeenCalledWith('register_byok_key', expect.anything());
  });
  it('stores only the final four character hint and the catalog intersection', async () => {
    mocks.validateByokKey.mockResolvedValue({ ok: true, modelIds: ['gpt-4o-mini', 'outside-catalog'] });
    const key = 'sk-test-valid-key-1234';
    const result = await registerByokKey(deps, ownerId, 'openai', key);
    expect(result.ok).toBe(true);
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('register_byok_key', expect.objectContaining({ p_hint: '1234', p_models: ['gpt-4o-mini'] }));
    expect(JSON.stringify(mocks.supabaseRpc.mock.calls)).not.toContain(key);
  });
  it('keeps a generated plaintext sentinel out of result, logs, and thrown errors', async () => {
    const sentinel = `sk-test-${crypto.randomUUID()}`;
    mocks.checkKeyFormat.mockReturnValue({ ok: true, key: sentinel });
    mocks.validateByokKey.mockRejectedValue(new Error(sentinel));
    vi.spyOn(console, 'log').mockImplementation(mocks.consoleLog);
    vi.spyOn(console, 'error').mockImplementation(mocks.consoleError);
    const result = await registerByokKey(deps, ownerId, 'openai', sentinel).then((value: unknown) => value, (error: unknown) => error);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify([mocks.consoleLog.mock.calls, mocks.consoleError.mock.calls])).not.toContain(sentinel);
  });
  it('does not fetch or validate during recheck when its claim is denied', async () => {
    mocks.supabaseRpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await recheckByokKey(deps, ownerId, 'openai')).toMatchObject({ ok: false, reason: 'throttled' });
    expect(mocks.adminRpc).not.toHaveBeenCalledWith('get_byok_secret', expect.anything());
    expect(mocks.validateByokKey).not.toHaveBeenCalled();
  });
  it.each(['invalid', 'forbidden'] as const)('marks a recheck %s result as failed', async (reason) => {
    mocks.validateByokKey.mockResolvedValue({ ok: false, reason });
    await recheckByokKey(deps, ownerId, 'openai');
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('set_byok_status', expect.objectContaining({ p_status: 'failed' }));
  });
  it.each(['rate_limited', 'unavailable'] as const)('preserves status after a recheck %s result', async (reason) => {
    mocks.validateByokKey.mockResolvedValue({ ok: false, reason });
    await recheckByokKey(deps, ownerId, 'openai');
    expect(mocks.supabaseRpc).not.toHaveBeenCalledWith('set_byok_status', expect.anything());
  });
  it('announces the service model when deletion changes the default', async () => {
    mocks.supabaseRpc.mockResolvedValue({ data: true, error: null });
    const result = await deleteByokKey(deps, ownerId, 'openai');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('GPT-4o mini');
    expect(result.message).toContain('[서비스 키]');
  });
});
