import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionClient, DecisionRequest, DecisionResult, DecisionType } from '@/lib/ai/decision/types';
import { DecisionCallError } from '@/lib/ai/decision/errors';
import type { FolderCandidate, TemplateOption } from '@/lib/kb/actions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KB_CATEGORIES } from '@/lib/kb/categories';

const kbMocks = vi.hoisted(() => ({ listFolders: vi.fn(), listTemplates: vi.fn() }));
vi.mock('@/lib/kb/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kb/actions')>();
  return {
    ...actual,
    listCategoryFolderCandidates: kbMocks.listFolders,
    listTemplateOptions: kbMocks.listTemplates,
  };
});

import {
  planFolderAndTemplate,
  planFolderAndTemplateFromCandidates,
  planTaskAndCategory,
} from '@/lib/ai/decision/plan';
import { createFixtureDecisionClient, readDecisionFixture } from '@/lib/ai/decision/fixture';

function result(key: string, confidence = 0.9): DecisionResult {
  return { key, confidence, probabilities: { [key]: confidence }, latencyMs: 12, modelVersion: 'test-model' };
}
function clientFor(decide: (request: DecisionRequest) => Promise<DecisionResult>): DecisionClient {
  return { provider: 'jev', decide };
}
function folder(id: string, path: string, isRoot = false): FolderCandidate {
  return { id, name: path || 'Root', path, isRoot, version: `${id}:${path}` };
}
function template(id: string | null, name: string, scope: TemplateOption['scope'], isDefault = false): TemplateOption {
  return { id, name, scope, content: `content-${name}`, isDefault };
}
const state = { chapterId: 'chapter-1' };
const db = {} as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Jev decision planning', () => {
  it('plans a document and category with separate confidence and call records', async () => {
    const client = clientFor(async (request) => request.decisionType === 'task' ? result('document') : result(KB_CATEGORIES[0], 0.8));
    const plan = await planTaskAndCategory(client, state);
    expect(plan).toMatchObject({ kind: 'document', category: KB_CATEGORIES[0], taskConfidence: 0.9, categoryConfidence: 0.8 });
    expect(plan.calls.map((call) => call.decisionType)).toEqual(['task', 'category']);
    expect(plan.calls.every((call) => call.ok && call.latencyMs === 12 && call.modelVersion === 'test-model')).toBe(true);
  });

  it('clarifies low task confidence without asking for a category', async () => {
    const decide = vi.fn(async () => result('document', 0.3));
    const plan = await planTaskAndCategory(clientFor(decide), state);
    expect(plan).toMatchObject({ kind: 'clarify', taskConfidence: 0.3, categoryConfidence: null });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(plan.calls).toHaveLength(1);
  });

  it('rejects a category key outside the requested candidate set', async () => {
    const plan = await planTaskAndCategory(clientFor(async (request) => request.decisionType === 'task' ? result('document') : result('용')), state);
    expect(plan.kind).toBe('clarify');
    expect(JSON.stringify(plan)).not.toContain('"category":"용"');
  });

  it('returns unavailable only for DecisionCallError and propagates programming errors', async () => {
    const decisionError = new DecisionCallError({ provider: 'jev', status: null, kind: 'unavailable', providerErrorCode: null });
    const unavailable = await planTaskAndCategory(clientFor(async () => { throw decisionError; }), state);
    expect(unavailable).toMatchObject({ kind: 'unavailable', calls: [{ decisionType: 'task', ok: false, errorKind: 'unavailable' }] });
    await expect(planTaskAndCategory(clientFor(async () => { throw new TypeError('bug'); }), state)).rejects.toThrow('bug');
  });

  it('shuffles the actual task candidates sent for different seeds', async () => {
    const requests: DecisionRequest[] = [];
    const client = clientFor(async (request) => { requests.push(request); return result('clarify'); });
    await planTaskAndCategory(client, state, { seed: 1 });
    await planTaskAndCategory(client, state, { seed: 2 });
    expect(requests[0].candidates.map((candidate) => candidate.key)).not.toEqual(requests[1].candidates.map((candidate) => candidate.key));
  });

  it('skips folder decision when only the root exists', async () => {
    const root = folder('root', '', true);
    const plan = await planFolderAndTemplateFromCandidates(clientFor(async () => result('template_1')), {
      state, folders: [root], templates: [template('t1', 'Default', 'work', true)],
    });
    expect(plan).toMatchObject({ folder: root, folderConfidence: null, folderFallback: false });
    expect(plan.calls).toHaveLength(0);
  });

  it('falls back to root on folder errors and low confidence', async () => {
    const root = folder('root', '', true);
    const child = folder('child', 'Child');
    const errClient = clientFor(async () => { throw new DecisionCallError({ provider: 'jev', status: 503, kind: 'unavailable', providerErrorCode: 'HTTP_503' }); });
    const failed = await planFolderAndTemplateFromCandidates(errClient, { state, folders: [child, root], templates: [template(null, 'Default', 'canonical', true)] });
    expect(failed).toMatchObject({ folder: root, folderFallback: true });
    const lowClient = clientFor(async (request) => result(request.decisionType === 'folder' ? 'folder_2' : 'template_1', 0.2));
    const low = await planFolderAndTemplateFromCandidates(lowClient, { state, folders: [root, child], templates: [template(null, 'Default', 'canonical', true)] });
    expect(low).toMatchObject({ folder: root, folderFallback: true });
  });

  it('falls back to the default template on template errors and low confidence', async () => {
    const root = folder('root', '', true);
    const selected = template('custom', 'Custom', 'work');
    const fallback = template(null, 'Default', 'canonical', true);
    const errorClient = clientFor(async (request) => {
      if (request.decisionType === 'folder') return result('folder_1');
      throw new DecisionCallError({ provider: 'jev', status: 503, kind: 'unavailable', providerErrorCode: 'HTTP_503' });
    });
    const failed = await planFolderAndTemplateFromCandidates(errorClient, { state, folders: [root], templates: [selected, fallback] });
    expect(failed).toMatchObject({ template: fallback, templateFallback: true });
    const lowClient = clientFor(async (request) => result(request.decisionType === 'template' ? 'template_1' : 'folder_1', 0.2));
    const low = await planFolderAndTemplateFromCandidates(lowClient, { state, folders: [root], templates: [selected, fallback] });
    expect(low).toMatchObject({ template: fallback, templateFallback: true });
  });

  it('stably sorts folder candidates before assigning opaque keys', async () => {
    const root = folder('root', '', true);
    const a = folder('a', 'A');
    const b = folder('b', 'B');
    const capture = async (folders: FolderCandidate[]) => {
      let request!: DecisionRequest;
      await planFolderAndTemplateFromCandidates(clientFor(async (req) => { request = req; return result('folder_1'); }), {
        state, folders, templates: [template(null, 'Default', 'canonical', true)],
      });
      return request.candidates.map((candidate) => [candidate.key, candidate.path]);
    };
    expect(await capture([root, a, b])).toEqual(await capture([b, a, root]));
  });

  it('returns data integrity errors for every non-ok root lookup without calling Jev', async () => {
    const client = clientFor(vi.fn(async () => result('folder_1')));
    for (const status of ['root_duplicate', 'root_missing', 'query_failed'] as const) {
      kbMocks.listFolders.mockResolvedValueOnce({ status });
      const plan = await planFolderAndTemplate(client, db, { ownerId: 'u', workId: 'w', category: KB_CATEGORIES[0], state });
      expect(plan).toEqual({ kind: 'data_integrity', reason: status });
    }
    expect(client.decide).not.toHaveBeenCalled();
    expect(kbMocks.listTemplates).not.toHaveBeenCalled();
  });

  it('keeps fixture choices within each request candidate set', async () => {
    const client = createFixtureDecisionClient('high-confidence-document');
    for (const decisionType of ['task', 'category', 'folder', 'template'] as const satisfies readonly DecisionType[]) {
      const candidates = [{ key: 'only_choice' }];
      const answer = await client.decide({ decisionType, requestId: 'id', state, candidates });
      expect(candidates.some((candidate) => candidate.key === answer.key)).toBe(true);
    }
    expect(readDecisionFixture({ NODE_ENV: 'production', DECISION_FIXTURE: 'clarify' })).toBeNull();
    expect(readDecisionFixture({ NODE_ENV: 'development', DECISION_FIXTURE: 'clarify' })).toBe('clarify');
  });
});
