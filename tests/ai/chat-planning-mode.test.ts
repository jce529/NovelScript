import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Plan 15-04 Task 2: chatAction resolves Jev planning via getAiDocPlanningMode()
 * every request — no code change is needed to turn document planning on/off.
 */

const h = vi.hoisted(() => ({
  sessionUserId: 'session-user' as string | null,
  chatResult: { ok: true, status: 'completed', reply: 'r', remainingBalance: 9 },
  chat: vi.fn(),
  createPlatformProvider: vi.fn(),
  getAiDocPlanningMode: vi.fn(),
  createJevClient: vi.fn(),
  readDecisionFixture: vi.fn(),
  createFixtureDecisionClient: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        h.sessionUserId
          ? { data: { user: { id: h.sessionUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
    from: (table: string) => {
      const query = { select: () => query, eq: () => query, is: () => query, maybeSingle: async () => ({ data: { id: table === 'chapters' ? 'c1' : 'w1' }, error: null }) };
      return query;
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/ai/chat', () => ({ chat: h.chat }));
vi.mock('@/lib/ai/providers/registry', () => ({ createPlatformProvider: h.createPlatformProvider }));
vi.mock('@/lib/access/actions', () => ({ readChapterContent: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ saveChapterContent: vi.fn(), publishChapter: vi.fn(), unpublishChapter: vi.fn() }));
vi.mock('@/lib/ai/mentions', () => ({ searchMentionNodes: vi.fn(), quickAddMentionNode: vi.fn() }));
vi.mock('@/lib/kb/actions', () => ({ saveNodeContent: vi.fn() }));
vi.mock('@/lib/ai/decision/activation', () => ({ getAiDocPlanningMode: h.getAiDocPlanningMode }));
vi.mock('@/lib/ai/decision/jev', () => ({ createJevClient: h.createJevClient }));
vi.mock('@/lib/ai/decision/fixture', () => ({
  readDecisionFixture: h.readDecisionFixture,
  createFixtureDecisionClient: h.createFixtureDecisionClient,
}));

import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { DecisionCallError } from '@/lib/ai/decision/errors';

const SESSION_USER = 'session-user';
const KEY = '6f1c2b1e-3d4a-4b5c-8d9e-0a1b2c3d4e5f';

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    workId: 'w1',
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

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.sessionUserId = SESSION_USER;
  h.chat.mockReset();
  h.chat.mockImplementation(async () => h.chatResult);
  h.createPlatformProvider.mockReset();
  h.createPlatformProvider.mockImplementation(() => ({ provider: 'gemini' }));
  h.getAiDocPlanningMode.mockReset();
  h.getAiDocPlanningMode.mockResolvedValue({ mode: 'off', reasons: ['not_requested'], modelVersion: null });
  h.createJevClient.mockReset();
  h.readDecisionFixture.mockReset();
  h.readDecisionFixture.mockReturnValue(null);
  h.createFixtureDecisionClient.mockReset();
  errorSpy?.mockRestore();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('chatAction planning resolution', () => {
  it('mode off: chat() is called without planning, createJevClient is never called', async () => {
    h.getAiDocPlanningMode.mockResolvedValue({ mode: 'off', reasons: ['not_requested'], modelVersion: null });
    await chatAction(validInput());
    expect(h.createJevClient).not.toHaveBeenCalled();
    const passedInput = h.chat.mock.calls[0][2];
    expect(passedInput.planning).toBeUndefined();
  });

  it('mode shadow: chat() is called without planning (shadow never affects chat result)', async () => {
    h.getAiDocPlanningMode.mockResolvedValue({ mode: 'shadow', reasons: ['shadow_samples_insufficient'], modelVersion: 'jev-1.13.0' });
    await chatAction(validInput());
    expect(h.createJevClient).not.toHaveBeenCalled();
    const passedInput = h.chat.mock.calls[0][2];
    expect(passedInput.planning).toBeUndefined();
  });

  it('mode active: createJevClient is called once and chat() receives planning', async () => {
    h.getAiDocPlanningMode.mockResolvedValue({ mode: 'active', reasons: [], modelVersion: 'jev-1.13.0' });
    const fakeClient = { provider: 'jev', decide: vi.fn() };
    h.createJevClient.mockReturnValue(fakeClient);
    await chatAction(validInput());
    expect(h.createJevClient).toHaveBeenCalledTimes(1);
    const passedInput = h.chat.mock.calls[0][2];
    expect(passedInput.planning).toEqual({ mode: 'active', decisionClient: fakeClient });
  });

  it('active but createJevClient throws DecisionCallError: chat() proceeds without planning, no exception escapes', async () => {
    h.getAiDocPlanningMode.mockResolvedValue({ mode: 'active', reasons: [], modelVersion: 'jev-1.13.0' });
    h.createJevClient.mockImplementation(() => {
      throw new DecisionCallError({ provider: 'jev', status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
    });
    const result = await chatAction(validInput());
    expect(result).toEqual(h.chatResult);
    const passedInput = h.chat.mock.calls[0][2];
    expect(passedInput.planning).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[ai] decision client unavailable', { stage: 'decision_client', kind: 'config' });
  });

  it('development fixture overrides the resolver regardless of its result', async () => {
    h.getAiDocPlanningMode.mockResolvedValue({ mode: 'off', reasons: ['not_requested'], modelVersion: null });
    h.readDecisionFixture.mockReturnValue('high-confidence-document');
    const fixtureClient = { provider: 'jev', decide: vi.fn() };
    h.createFixtureDecisionClient.mockReturnValue(fixtureClient);
    await chatAction(validInput());
    expect(h.getAiDocPlanningMode).not.toHaveBeenCalled();
    const passedInput = h.chat.mock.calls[0][2];
    expect(passedInput.planning).toEqual({ mode: 'active', decisionClient: fixtureClient });
  });
});
