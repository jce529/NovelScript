import { afterEach, describe, expect, it, vi } from 'vitest';
import { kstMonthUtcRange, loadMonthlyByokUsage, recordAiUsage } from '@/lib/ai/usage';

function queryResult(data: unknown, error: unknown = null) {
  const state = { filters: [] as unknown[][], selected: '' };
  const query: Record<string, unknown> = {
    select: vi.fn((columns: string) => { state.selected = columns; return query; }),
    insert: vi.fn(() => query),
    eq: vi.fn((...args: unknown[]) => { state.filters.push(['eq', ...args]); return query; }),
    gte: vi.fn((...args: unknown[]) => { state.filters.push(['gte', ...args]); return query; }),
    lt: vi.fn((...args: unknown[]) => { state.filters.push(['lt', ...args]); return query; }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
    state,
  };
  return query;
}

afterEach(() => vi.restoreAllMocks());

describe('kstMonthUtcRange', () => {
  it('uses the KST month for January month end and February start', () => {
    expect(kstMonthUtcRange(new Date('2026-01-31T14:59:59.999Z'))).toEqual({
      startUtc: '2025-12-31T15:00:00.000Z', endUtc: '2026-01-31T15:00:00.000Z',
    });
    expect(kstMonthUtcRange(new Date('2026-01-31T15:00:00.000Z'))).toEqual({
      startUtc: '2026-01-31T15:00:00.000Z', endUtc: '2026-02-28T15:00:00.000Z',
    });
  });

  it('handles year boundaries and leap February', () => {
    expect(kstMonthUtcRange(new Date('2026-12-31T15:00:00.000Z'))).toEqual({
      startUtc: '2026-12-31T15:00:00.000Z', endUtc: '2027-01-31T15:00:00.000Z',
    });
    expect(kstMonthUtcRange(new Date('2024-02-15T00:00:00.000Z')).endUtc).toBe('2024-02-29T15:00:00.000Z');
  });
});

describe('recordAiUsage', () => {
  const input = {
    ownerId: 'owner-1', provider: 'openai' as const, model: 'gpt-4o-mini', keySource: 'byok' as const,
    status: 'completed' as const, idempotencyKey: 'request-1',
    usage: { inputTokens: 12, outputTokens: 8, thoughtsTokens: null, reported: { input: true, output: true } },
  };

  it('writes completed usage with thoughtsTokens defaulted to zero', async () => {
    const query = queryResult(null);
    const admin = { from: vi.fn(() => query) };
    await expect(recordAiUsage(admin as never, input)).resolves.toEqual({ ok: true, recorded: true });
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: 'owner-1', provider: 'openai', model: 'gpt-4o-mini', key_source: 'byok', status: 'completed',
      input_tokens: 12, output_tokens: 8, thoughts_tokens: 0, input_reported: true, output_reported: true,
      idempotency_key: 'request-1',
    }));
  });

  it('records refused results only when at least one usage field was reported', async () => {
    const query = queryResult(null);
    await expect(recordAiUsage({ from: () => query } as never, { ...input, status: 'refused' })).resolves.toMatchObject({ recorded: true });
    const noUsageQuery = queryResult(null);
    await expect(recordAiUsage({ from: () => noUsageQuery } as never, {
      ...input, status: 'refused', usage: { ...input.usage, reported: { input: false, output: false } },
    })).resolves.toEqual({ ok: true, recorded: false, reason: 'not_recordable' });
    expect(noUsageQuery.insert).not.toHaveBeenCalled();
  });

  it('does not write non-recordable failures', async () => {
    const query = queryResult(null);
    await expect(recordAiUsage({ from: () => query } as never, { ...input, status: 'failed' })).resolves.toMatchObject({ recorded: false });
    expect(query.insert).not.toHaveBeenCalled();
  });

  it('treats duplicate idempotency keys as a successful no-op', async () => {
    const query = queryResult(null, { code: '23505', message: 'sensitive database detail' });
    await expect(recordAiUsage({ from: () => query } as never, input)).resolves.toEqual({ ok: true, recorded: false, reason: 'duplicate' });
  });

  it('isolates insert exceptions and never logs raw errors', async () => {
    const error = new Error('provider response contains private data');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordAiUsage({ from: () => { throw error; } } as never, input)).resolves.toEqual({ ok: false, recorded: false, reason: 'unavailable' });
    expect(log).toHaveBeenCalledWith('[ai] usage write failed', expect.objectContaining({ stage: 'insert', provider: 'openai', idempotencyKey: 'request-1' }));
    expect(JSON.stringify(log.mock.calls)).not.toContain(error.message);
  });
});

describe('loadMonthlyByokUsage', () => {
  const rows = [
    { provider: 'openai', model: 'gpt-4o-mini', status: 'completed', input_tokens: 2, output_tokens: 3 },
    { provider: 'openai', model: 'gpt-4o-mini', status: 'refused', input_tokens: 1, output_tokens: 0 },
    { provider: 'openai', model: 'gpt-5.6-terra', status: 'completed', input_tokens: 5, output_tokens: 8 },
    { provider: 'gemini', model: 'gemini-3.5-flash', status: 'completed', input_tokens: 4, output_tokens: 6 },
  ];

  it('filters by owner, BYOK source, and the half-open KST month range, then aggregates and sorts', async () => {
    const query = queryResult(rows);
    const result = await loadMonthlyByokUsage({ from: vi.fn(() => query) } as never, 'owner-1', new Date('2026-02-15T00:00:00Z'));
    expect((query as { state: { filters: unknown } }).state.filters).toEqual([
      ['eq', 'owner_id', 'owner-1'], ['eq', 'key_source', 'byok'],
      ['gte', 'created_at', '2026-01-31T15:00:00.000Z'], ['lt', 'created_at', '2026-02-28T15:00:00.000Z'],
    ]);
    expect(result).toEqual({ ok: true, providers: [
      { provider: 'openai', calls: 3, inputTokens: 8, outputTokens: 11, models: [
        { model: 'gpt-4o-mini', calls: 2, inputTokens: 3, outputTokens: 3 },
        { model: 'gpt-5.6-terra', calls: 1, inputTokens: 5, outputTokens: 8 },
      ] },
      { provider: 'gemini', calls: 1, inputTokens: 4, outputTokens: 6, models: [
        { model: 'gemini-3.5-flash', calls: 1, inputTokens: 4, outputTokens: 6 },
      ] },
    ] });
  });

  it('sorts tied model call counts by label and isolates malformed rows or query errors', async () => {
    const tied = queryResult([
      { provider: 'openai', model: 'z-model', status: 'completed', input_tokens: 1, output_tokens: 0 },
      { provider: 'openai', model: 'a-model', status: 'completed', input_tokens: 1, output_tokens: 0 },
    ]);
    const result = await loadMonthlyByokUsage({ from: () => tied } as never, 'owner-1');
    expect(result.ok && result.providers[0].models.map(({ model }) => model)).toEqual(['a-model', 'z-model']);
    await expect(loadMonthlyByokUsage({ from: () => queryResult([{ ...rows[0], input_tokens: -1 }]) } as never, 'owner-1'))
      .resolves.toEqual({ ok: false, reason: 'invalid_data' });
    await expect(loadMonthlyByokUsage({ from: () => queryResult(null, { message: 'private' }) } as never, 'owner-1'))
      .resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});
