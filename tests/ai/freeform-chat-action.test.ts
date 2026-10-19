import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_COPY } from '@/lib/ai/chat-result';

/*
 * 04-09 Server Action boundary for the two instructions (EDIT-03/EDIT-04):
 * - customInstruction: client-supplied, validated (string|null|undefined, <= 4000 chars), freeform only.
 * - workSystemInstruction: read on the server via getWorkSystemInstruction after the ownership
 *   check. A forged request value (or ownerId) never reaches chat()/regenerate.
 * chat()/regenerate are mocked here; the real systemInstruction capture lives in
 * freeform-generation / document-plan-generation / document-regenerate tests.
 */

const h = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  chatResult: { ok: true, status: 'completed', reply: 'r', remainingBalance: 9 },
  regenResult: { ok: true, content: 'c', name: 'n' },
  chat: vi.fn(),
  regenerate: vi.fn(),
  resolveRoute: vi.fn(),
  getWorkInstruction: vi.fn(),
  queries: [] as { table: string; calls: unknown[][] }[],
  client: { provider: 'gemini', generateContent: vi.fn() },
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sessionUserId
          ? { data: { user: { id: h.sessionUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: (table: string) => {
      const record = { table, calls: [] as unknown[][] };
      h.queries.push(record);
      const query: Record<string, unknown> = {
        select: (...a: unknown[]) => { record.calls.push(['select', ...a]); return query; },
        eq: (...a: unknown[]) => { record.calls.push(['eq', ...a]); return query; },
        is: (...a: unknown[]) => { record.calls.push(['is', ...a]); return query; },
        maybeSingle: async () => ({ data: { id: 'owned-resource' }, error: null }),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/ai/document-regenerate', () => ({ regenerateDocumentWithTemplate: h.regenerate }));
vi.mock('@/lib/ai/work-instructions', () => ({ getWorkSystemInstruction: h.getWorkInstruction }));
vi.mock('@/lib/ai/providers/byok', () => ({ resolveGenerationRoute: h.resolveRoute }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: vi.fn() }));
vi.mock('@/lib/kb/actions', () => ({ saveNodeContent: vi.fn() }));
vi.mock('@/lib/ai/decision/activation', () => ({ getAiDocPlanningMode: vi.fn(async () => ({ mode: 'off' })) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { chatAction, regenerateDocumentWithTemplateAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';

const SESSION_USER = '10000000-0000-4000-8000-000000000001';
const WORK_ID = '20000000-0000-4000-8000-000000000001';
const CHAPTER_ID = '30000000-0000-4000-8000-000000000001';
const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';
const STORED = 'STORED-WORK-SENTINEL: 주인공은 존댓말을 쓴다.';
const FORGED = 'FORGED-WORK-SENTINEL';
const CUSTOM = 'CUSTOM-SENTINEL: 현재형으로 쓰세요.';

function chatInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: WORK_ID,
    chapterId: CHAPTER_ID,
    providerId: 'gemini',
    model: 'gemini-3.5-flash',
    mentionedNodeIds: [],
    presetLevel: 'freeform',
    styleId: 'concise-hemingway',
    genre: '판타지',
    precedingText: '',
    chatHistory: [{ role: 'user', content: '이어서 써줘' }],
    idempotencyKey: KEY,
    ...overrides,
  } as unknown as Parameters<typeof chatAction>[0];
}

function regenInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: WORK_ID,
    proposal: { category: '인물', name: '유리', content: '# 유리\n## 성격\n차분함' },
    templateId: '40000000-0000-4000-8000-000000000001',
    targetFolderId: '50000000-0000-4000-8000-000000000001',
    folderVersion: 'v1',
    providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service',
    idempotencyKey: KEY, presetLevel: 'freeform', styleId: 'concise-hemingway', genre: '판타지',
    ...overrides,
  };
}

const forwarded = () => h.chat.mock.calls[0][2] as Record<string, unknown>;
const regenForwarded = () => h.regenerate.mock.calls[0][2] as Record<string, unknown>;

beforeEach(() => {
  h.sessionUserId = SESSION_USER;
  h.queries = [];
  h.chat.mockReset();
  h.chat.mockImplementation(async () => h.chatResult);
  h.regenerate.mockReset();
  h.regenerate.mockImplementation(async () => h.regenResult);
  h.getWorkInstruction.mockReset();
  h.getWorkInstruction.mockResolvedValue({ ok: true, instruction: STORED });
  h.resolveRoute.mockReset();
  h.resolveRoute.mockImplementation(async ({ selection }: { selection: { providerId: string; model: string; keySource: string } }) => ({ kind: selection.keySource, selection, client: h.client, keyId: 'server-key' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('chatAction freeform customInstruction validation', () => {
  it.each([
    ['absent', {}, null],
    ['null', { customInstruction: null }, null],
    ['4000 chars', { customInstruction: 'a'.repeat(4000) }, 'a'.repeat(4000)],
    ['normal text', { customInstruction: CUSTOM }, CUSTOM],
  ] as const)('accepts %s and forwards the parsed value', async (_label, extra, expected) => {
    const result = await chatAction(chatInput(extra));
    expect(result).toBe(h.chatResult);
    expect(h.chat).toHaveBeenCalledTimes(1);
    expect(forwarded().customInstruction ?? null).toBe(expected);
  });

  it.each([
    ['4001 chars', { customInstruction: 'a'.repeat(4001) }],
    ['number', { customInstruction: 42 }],
    ['object', { customInstruction: { text: 'x' } }],
    ['array', { customInstruction: ['x'] }],
  ])('rejects %s as invalid_input before route, lookup or provider', async (_label, extra) => {
    const result = await chatAction(chatInput(extra));
    expect(result).toEqual({ ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input });
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.resolveRoute).not.toHaveBeenCalled();
    expect(h.getWorkInstruction).not.toHaveBeenCalled();
  });

  it('drops customInstruction outside freeform', async () => {
    await chatAction(chatInput({ presetLevel: 'intermediate', customInstruction: CUSTOM }));
    expect(forwarded().customInstruction ?? null).toBeNull();
  });
});

describe('chatAction server-read work instruction', () => {
  it('reads the stored instruction for the session owner after the deleted_at ownership check', async () => {
    await chatAction(chatInput());
    expect(h.getWorkInstruction).toHaveBeenCalledTimes(1);
    expect(h.getWorkInstruction.mock.calls[0][1]).toEqual({ ownerId: SESSION_USER, workId: WORK_ID });
    const works = h.queries.find((q) => q.table === 'works')!;
    expect(works.calls).toContainEqual(['eq', 'owner_id', SESSION_USER]);
    expect(works.calls).toContainEqual(['is', 'deleted_at', null]);
    expect(forwarded().workSystemInstruction).toBe(STORED);
  });

  it('replaces a forged workSystemInstruction and ownerId with the server values', async () => {
    await chatAction(chatInput({ workSystemInstruction: FORGED, ownerId: 'attacker-id', presetLevel: 'intermediate' }));
    expect(forwarded().workSystemInstruction).toBe(STORED);
    expect(forwarded().ownerId).toBe(SESSION_USER);
    expect(JSON.stringify(h.chat.mock.calls)).not.toContain(FORGED);
    expect(JSON.stringify(h.chat.mock.calls)).not.toContain('attacker-id');
  });

  it('forwards an empty value when no instruction row exists', async () => {
    h.getWorkInstruction.mockResolvedValue({ ok: true, instruction: '' });
    await chatAction(chatInput({ workSystemInstruction: FORGED }));
    expect(forwarded().workSystemInstruction).toBe('');
  });

  it('fails before route resolution and provider call when the lookup errors', async () => {
    h.getWorkInstruction.mockResolvedValue({ ok: false, error: '추가 지시를 불러오지 못했어요.' });
    const result = await chatAction(chatInput());
    expect(result).toMatchObject({ ok: false, status: 'failed', failureKind: 'unknown' });
    expect(h.chat).not.toHaveBeenCalled();
    expect(h.resolveRoute).not.toHaveBeenCalled();
  });

  it('beginner skips the lookup and forwards no instructions, even forged ones', async () => {
    await chatAction(chatInput({ presetLevel: 'beginner', customInstruction: CUSTOM, workSystemInstruction: FORGED }));
    expect(h.getWorkInstruction).not.toHaveBeenCalled();
    expect(forwarded().workSystemInstruction ?? '').toBe('');
    expect(forwarded().customInstruction ?? null).toBeNull();
    expect(JSON.stringify(h.chat.mock.calls)).not.toContain(FORGED);
  });

  it('works for the 설정 문서 (nodeId) chat path too', async () => {
    await chatAction(chatInput({ chapterId: undefined, nodeId: '60000000-0000-4000-8000-000000000001', customInstruction: CUSTOM }));
    expect(forwarded()).toMatchObject({ contextKind: 'document', customInstruction: CUSTOM, workSystemInstruction: STORED });
  });
});

describe('regenerateDocumentWithTemplateAction instructions', () => {
  it('forwards the validated customInstruction and the server-read work instruction', async () => {
    const result = await regenerateDocumentWithTemplateAction(regenInput({ customInstruction: CUSTOM }));
    expect(result).toBe(h.regenResult);
    expect(h.getWorkInstruction.mock.calls[0][1]).toEqual({ ownerId: SESSION_USER, workId: WORK_ID });
    expect(regenForwarded()).toMatchObject({ customInstruction: CUSTOM, workSystemInstruction: STORED, ownerId: SESSION_USER });
    const works = h.queries.find((q) => q.table === 'works')!;
    expect(works.calls).toContainEqual(['is', 'deleted_at', null]);
  });

  it('overrides a forged workSystemInstruction/ownerId', async () => {
    await regenerateDocumentWithTemplateAction(regenInput({ workSystemInstruction: FORGED, ownerId: 'attacker-id' }));
    expect(regenForwarded()).toMatchObject({ workSystemInstruction: STORED, ownerId: SESSION_USER });
    expect(JSON.stringify(h.regenerate.mock.calls)).not.toContain(FORGED);
    expect(JSON.stringify(h.regenerate.mock.calls)).not.toContain('attacker-id');
  });

  it('rejects an oversized customInstruction before route or lookup', async () => {
    const result = await regenerateDocumentWithTemplateAction(regenInput({ customInstruction: 'a'.repeat(4001) }));
    expect(result).toEqual({ ok: false, failureKind: 'invalid_input', error: CHAT_COPY.invalid_input });
    expect(h.regenerate).not.toHaveBeenCalled();
    expect(h.getWorkInstruction).not.toHaveBeenCalled();
  });

  it('fails before route and provider/debit when the lookup errors', async () => {
    h.getWorkInstruction.mockResolvedValue({ ok: false, error: 'x' });
    const result = await regenerateDocumentWithTemplateAction(regenInput());
    expect(result).toMatchObject({ ok: false, failureKind: 'unknown' });
    expect(h.regenerate).not.toHaveBeenCalled();
    expect(h.resolveRoute).not.toHaveBeenCalled();
  });

  it('beginner skips the lookup and forwards no instructions', async () => {
    await regenerateDocumentWithTemplateAction(regenInput({ presetLevel: 'beginner', customInstruction: CUSTOM, workSystemInstruction: FORGED }));
    expect(h.getWorkInstruction).not.toHaveBeenCalled();
    expect(regenForwarded().workSystemInstruction ?? '').toBe('');
    expect(regenForwarded().customInstruction ?? null).toBeNull();
  });
});
