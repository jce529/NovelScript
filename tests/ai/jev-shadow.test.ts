import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketFor, pickScenario, runShadowPlan, recordDocumentSaveDecision, SHADOW_MAX_CONCURRENCY } from '@/lib/ai/decision/shadow';
import { SHADOW_SCENARIOS } from '@/lib/ai/decision/shadow-scenarios';

const h = vi.hoisted(() => ({ task: vi.fn(), folder: vi.fn() }));
vi.mock('@/lib/ai/decision/plan', () => ({ planTaskAndCategory: h.task, planFolderAndTemplateFromCandidates: h.folder }));
vi.mock('server-only', () => ({}));

function deps(overrides: Record<string, unknown> = {}) {
  const inserted: any[] = [];
  const queries: string[] = [];
  const admin: any = {
    from: vi.fn((table: string) => {
      queries.push(table);
      const chain: any = {
        select: vi.fn(() => chain), gte: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
        insert: vi.fn(async (row: any) => { inserted.push(row); return { error: null }; }),
        then: undefined,
      };
      chain.then = (resolve: any) => resolve({ data: [], error: null, count: 0 });
      return chain;
    }), rpc: vi.fn(async () => ({ error: null })),
  };
  return { inserted, queries, admin, value: { client: { provider: 'jev' }, admin, rng: () => 0.1, now: () => new Date('2026-09-27T12:00:00Z'), sampleRate: 1, dailyMax: 500, modelVersion: 'jev-1', ...overrides } as any };
}

describe('shadow plan', () => {
  beforeEach(() => { h.task.mockReset(); h.folder.mockReset(); });
  it('buckets by request metadata with length boundaries', () => {
    expect(bucketFor({ requestLength: 10, hasChapterContext: false, mentionedFactCount: 0 })).toBe('short:noctx:nomention');
    expect(bucketFor({ requestLength: 40, hasChapterContext: true, mentionedFactCount: 1 })).toBe('medium:ctx:mention');
    expect(bucketFor({ requestLength: 200, hasChapterContext: false, mentionedFactCount: 0 })).toBe('long:noctx:nomention');
  });
  it('has at least three valid synthetic cases per bucket and no UUIDs', () => {
    const buckets = new Set(SHADOW_SCENARIOS.map(s => s.bucket));
    expect(buckets.size).toBe(12);
    for (const bucket of buckets) {
      const cases = SHADOW_SCENARIOS.filter(s => s.bucket === bucket);
      expect(cases.length).toBeGreaterThanOrEqual(3);
      for (const scenario of cases) {
        expect(scenario).toMatchObject({ id: expect.any(String), bucket, state: expect.any(Object), expectedTask: expect.any(String), folders: expect.any(Array), templates: expect.any(Array) });
        expect(scenario.folders.filter(f => f.isRoot)).toHaveLength(1);
        expect(scenario.templates.filter(t => t.isDefault)).toHaveLength(1);
        expect(JSON.stringify(scenario)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      }
    }
  });
  it('picks deterministically within requested bucket', () => {
    const b = 'short:noctx:nomention' as const;
    expect(pickScenario(b, 'seed')).toBe(pickScenario(b, 'seed'));
    expect(pickScenario(b, 'seed').bucket).toBe(b);
  });
  it('skips unsampled traffic', async () => {
    const d = deps({ rng: () => 0.5, sampleRate: 0.05 });
    expect(await runShadowPlan(d.value, { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 10, hasChapterContext: false, mentionedFactCount: 0 })).toEqual({ skipped: 'not_sampled' });
    expect(h.task).not.toHaveBeenCalled(); expect(d.inserted).toHaveLength(0);
    const capped = deps({ rng: () => 0.3, sampleRate: 100 });
    expect(await runShadowPlan(capped.value, { ownerId: 'o', workId: 'w', requestKey: 'cap', requestLength: 10, hasChapterContext: false, mentionedFactCount: 0 })).toEqual({ skipped: 'not_sampled' });
  });
  it('enforces daily, circuit and concurrency limits', async () => {
    const trigger = { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 10, hasChapterContext: false, mentionedFactCount: 0 };
    const daily = deps({ dailyMax: 0, rng: () => 0.1 }); expect(await runShadowPlan(daily.value, trigger)).toEqual({ skipped: 'daily_budget' });
    const circuit = deps(); circuit.admin.from = vi.fn(() => { const c: any = { select: () => c, gte: () => c, order: () => c, limit: () => c }; c.then = (r: any) => r({ data: Array.from({ length: 20 }, (_, i) => ({ status: i < 10 ? 'error' : 'ok' })), error: null }); return c; });
    expect(await runShadowPlan(circuit.value, trigger)).toEqual({ skipped: 'circuit_open' });
    expect(SHADOW_MAX_CONCURRENCY).toBe(2);
    const concurrent = deps();
    let release!: (value: any) => void;
    h.task.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const first = runShadowPlan(concurrent.value, trigger);
    const second = runShadowPlan(concurrent.value, { ...trigger, requestKey: 'second' });
    await Promise.resolve(); await Promise.resolve();
    expect(await runShadowPlan(concurrent.value, { ...trigger, requestKey: 'third' })).toEqual({ skipped: 'concurrency' });
    release({ kind: 'reply', taskConfidence: .8, categoryConfidence: null, calls: [] });
    await Promise.all([first, second]);
  });
  it('sends synthetic scenario state and records accurate calls and confidences', async () => {
    const d = deps();
    const scenario = pickScenario('short:noctx:nomention', 'k');
    h.task.mockResolvedValue({ kind: 'document', category: scenario.expectedCategory!, taskConfidence: .8, categoryConfidence: .7, calls: [{ ok: true, latencyMs: 12, errorKind: null }] });
    h.folder.mockResolvedValue({ folderFallback: false, templateFallback: true, calls: [{ ok: true, latencyMs: 8, errorKind: null }, { ok: true, latencyMs: 5, errorKind: null }] });
    await runShadowPlan(d.value, { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 2, hasChapterContext: false, mentionedFactCount: 0 });
    expect(h.task).toHaveBeenCalledWith(d.value.client, scenario.state);
    expect(h.folder).toHaveBeenCalledWith(d.value.client, { state: scenario.state, folders: scenario.folders, templates: scenario.templates });
    expect(d.inserted[0]).toMatchObject({ applied: false, call_count: 3, latency_ms: 25, task_confidence: .8, category_confidence: .7, task_correct: scenario.expectedTask === 'document' });
  });
  it('records unavailable decision errors and swallows non-decision exceptions', async () => {
    const d = deps(); h.task.mockResolvedValue({ kind: 'unavailable', calls: [{ ok: false, latencyMs: 4, errorKind: 'timeout' }] });
    await runShadowPlan(d.value, { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 2, hasChapterContext: false, mentionedFactCount: 0 });
    expect(d.inserted[0]).toMatchObject({ status: 'error', error_kind: 'timeout' });
    h.task.mockRejectedValue(new Error('provider secret')); await expect(runShadowPlan(d.value, { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 2, hasChapterContext: false, mentionedFactCount: 0 })).resolves.toBeUndefined();
  });
  it('purges probabilistically', async () => {
    const d = deps({ rng: () => 0.005 }); h.task.mockResolvedValue({ kind: 'reply', taskConfidence: .9, categoryConfidence: null, calls: [] });
    await runShadowPlan(d.value, { ownerId: 'o', workId: 'w', requestKey: 'k', requestLength: 2, hasChapterContext: false, mentionedFactCount: 0 });
    expect(d.admin.rpc).toHaveBeenCalledWith('purge_ai_doc_plan_logs', { p_retention_days: 90 });
  });
  it('records only recommendations and computes save decisions', async () => {
    const d = deps();
    await recordDocumentSaveDecision(d.admin, { ownerId: 'o', workId: 'w', nodeId: 'n', actualFolderId: 'f', actualTemplateId: 't', regenerated: false });
    expect(d.inserted).toHaveLength(0);
    await recordDocumentSaveDecision(d.admin, { ownerId: 'o', workId: 'w', nodeId: 'n', recommendedFolderId: 'rf', actualFolderId: 'f', recommendedTemplateId: 'rt', actualTemplateId: 't', regenerated: true });
    expect(d.inserted[0]).toMatchObject({ node_id: 'n', folder_changed: true, template_changed: true, accepted: false, regenerated: true });
  });
});
