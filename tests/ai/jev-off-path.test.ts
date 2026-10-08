import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Plan 15-09 Task 1: proves server-side Jev inertness when planning mode is
 * 'off', across every entry point that could reach Jev — chatAction,
 * loadSavePlanAction, saveDocumentProposalAction, and the QuickAdd path
 * (listCategoryFoldersAction + quickAddMentionAction). Asserted via spies on
 * createJevClient/createFixtureDecisionClient and a global fetch spy scoped
 * to the TypeSafe AI host — never via a browser Network tab.
 */

const h = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  chatResult: { ok: true, status: 'completed', reply: 'r', remainingBalance: 9 },
  chat: vi.fn(),
  createPlatformProvider: vi.fn(),
  getAiDocPlanningMode: vi.fn(),
  createJevClient: vi.fn(),
  createFixtureDecisionClient: vi.fn(),
  after: vi.fn(),
  listCategoryFolderCandidates: vi.fn(),
  validateTargetFolder: vi.fn(),
  validateTargetTemplate: vi.fn(),
  listTemplateOptions: vi.fn(),
  createNode: vi.fn(),
  quickAddMentionNode: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: h.after }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sessionUserId
          ? { data: { user: { id: h.sessionUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: { id: table === 'chapters' ? 'c1' : WORK_ID }, error: null }) };
      return query;
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/ai/providers/registry', () => ({ createPlatformProvider: h.createPlatformProvider }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: h.quickAddMentionNode }));
vi.mock('@/lib/kb/actions', () => ({
  listCategoryFolderCandidates: h.listCategoryFolderCandidates,
  validateTargetFolder: h.validateTargetFolder,
  validateTargetTemplate: h.validateTargetTemplate,
  listTemplateOptions: h.listTemplateOptions,
  createNode: h.createNode,
  formatFolderPath: (category: string, path: string, sep: string) => (path ? `${category}${sep}${path}` : category),
  TEMPLATE_REVALIDATION_FAILED: '저장 템플릿이 변경되었어요. 다시 선택해주세요.',
}));
vi.mock('@/lib/ai/decision/activation', () => ({ getAiDocPlanningMode: h.getAiDocPlanningMode }));
vi.mock('@/lib/ai/decision/jev', () => ({ createJevClient: h.createJevClient }));
vi.mock('@/lib/ai/decision/fixture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/decision/fixture')>()),
  createFixtureDecisionClient: h.createFixtureDecisionClient,
}));
vi.mock('@/lib/ai/decision/shadow', () => ({ runShadowPlan: vi.fn(), recordDocumentSaveDecision: vi.fn() }));
vi.mock('@/lib/ai/document-regenerate', () => ({ regenerateDocumentWithTemplate: vi.fn() }));

import { chatAction, loadSavePlanAction, saveDocumentProposalAction, listCategoryFoldersAction, quickAddMentionAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';

const SESSION_USER = 'session-user';
const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';
const WORK_ID = '11111111-1111-4111-8111-111111111111';
const FOLDER_ID = '22222222-2222-4222-8222-222222222222';

function chatInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: WORK_ID,
    chapterId: 'c1',
    providerId: 'gemini', model: 'gemini-3.5-flash',
    mentionedNodeIds: [],
    presetLevel: 'balanced',
    styleId: 'default',
    genre: 'fantasy',
    precedingText: '',
    chatHistory: [{ role: 'user', content: 'hi' }],
    idempotencyKey: KEY,
    ...overrides,
  } as unknown as Parameters<typeof chatAction>[0];
}

let originalFetch: typeof fetch;
let fetchSpy: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

async function runFullFlow() {
  expect(await chatAction(chatInput())).toEqual(h.chatResult);
  expect((await loadSavePlanAction(WORK_ID, '인물')).status).toBe('ok');
  expect(await saveDocumentProposalAction({
    workId: WORK_ID,
    proposal: { category: '인물', name: '문서', content: '내용' },
    targetFolderId: FOLDER_ID,
    templateId: null,
    regenerated: false,
  })).toEqual({ ok: true, nodeId: 'node-1' });
  expect((await listCategoryFoldersAction(WORK_ID, '인물')).status).toBe('ok');
  expect(await quickAddMentionAction(WORK_ID, '인물', '이름')).toEqual({ ok: true, nodeId: 'node-2' });
  expect(h.chat).toHaveBeenCalledTimes(1);
  expect(h.listCategoryFolderCandidates).toHaveBeenCalledTimes(2);
  expect(h.createNode).toHaveBeenCalledTimes(1);
  expect(h.quickAddMentionNode).toHaveBeenCalledTimes(1);
}

function expectNoVendorActivity() {
  expect(h.createJevClient).not.toHaveBeenCalled();
  expect(h.createFixtureDecisionClient).not.toHaveBeenCalled();
  expect(h.after).not.toHaveBeenCalled();
  const baseUrl = process.env.TYPESAFE_API_BASE_URL;
  const vendorCalls = fetchSpy.mock.calls.filter(([url]) =>
    String(url).includes('api.typesafe.ai') || (baseUrl && String(url).startsWith(baseUrl)));
  expect(vendorCalls).toHaveLength(0);
}

beforeEach(() => {
  vi.stubEnv('DECISION_FIXTURE', undefined);
  vi.stubEnv('TYPESAFE_API_BASE_URL', 'https://custom-jev.example/v1/systemone');
  h.sessionUserId = SESSION_USER;
  h.chat.mockReset(); h.chat.mockResolvedValue(h.chatResult);
  h.createPlatformProvider.mockReset(); h.createPlatformProvider.mockImplementation(() => ({ provider: 'gemini' }));
  h.getAiDocPlanningMode.mockReset(); h.getAiDocPlanningMode.mockResolvedValue({ mode: 'off', reasons: ['not_requested'], modelVersion: null });
  h.createJevClient.mockReset();
  h.createFixtureDecisionClient.mockReset();
  h.after.mockReset();
  h.listCategoryFolderCandidates.mockReset(); h.listCategoryFolderCandidates.mockResolvedValue({ status: 'ok', root: { id: FOLDER_ID, name: '인물', isRoot: true, path: '', version: 'v1' }, candidates: [{ id: FOLDER_ID, name: '인물', isRoot: true, path: '', version: 'v1' }] });
  h.validateTargetFolder.mockReset(); h.validateTargetFolder.mockResolvedValue({ ok: true, folder: { id: FOLDER_ID, name: '인물', isRoot: true, path: '', version: 'v1' } });
  h.validateTargetTemplate.mockReset(); h.validateTargetTemplate.mockResolvedValue({ ok: true, template: { id: null, name: '기본', scope: 'canonical', content: '# t', isDefault: true } });
  h.listTemplateOptions.mockReset(); h.listTemplateOptions.mockResolvedValue([{ id: null, name: '기본', scope: 'canonical', content: '# t', isDefault: true }]);
  h.createNode.mockReset(); h.createNode.mockResolvedValue({ ok: true, nodeId: 'node-1' });
  h.quickAddMentionNode.mockReset(); h.quickAddMentionNode.mockResolvedValue({ ok: true, nodeId: 'node-2' });

  originalFetch = global.fetch;
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  global.fetch = fetchSpy as unknown as typeof fetch;
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  errorSpy.mockRestore();
  vi.unstubAllEnvs();
});

describe('off-path: server never reaches Jev', () => {
  it('mode off, no fixture: zero createJevClient calls, zero typesafe.ai fetches, zero after() registrations', async () => {
    await runFullFlow();
    expectNoVendorActivity();
  });

  it('production + DECISION_FIXTURE set: fixture is ignored, still zero Jev activity', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DECISION_FIXTURE', 'high-confidence-document');
    await runFullFlow();
    expectNoVendorActivity();
  });
});
