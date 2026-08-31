import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generate, estimateCost } from '../../lib/ai/generate';
import { createMockGeminiClient } from '../../lib/ai/gemini';
import { createChapter } from '../../lib/chapters/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('lib/ai/generate.ts — generate() (EDIT-04, D-13)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let chapterId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data: work } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (generate-action)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = work as string;
    const chapter = await createChapter(admin, { ownerId: owner.id, workId, title: '1화' });
    chapterId = chapter.chapterId!;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('debits the wallet with ACTUAL usage after the call, never the pre-call estimate (Pitfall 2)', async () => {
    await admin.rpc('apply_wallet_delta', { p_wallet_id: owner.id, p_delta: 1000, p_reference_type: 'test_grant', p_reference_id: 'grant-1', p_reason: 'test' });
    const { data: before } = await admin.from('wallets').select('balance').eq('id', owner.id).single();

    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 50 }),
      generateContent: async () => ({ text: '생성된 문단', finishReason: 'STOP', promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 }),
    });

    const result = await generate(admin, client, {
      ownerId: owner.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'intermediate', customInstruction: null,
      styleId: 'concise-hemingway', genre: '판타지', precedingText: '어느 날...',
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBe('생성된 문단');

    const { data: after } = await admin.from('wallets').select('balance').eq('id', owner.id).single();
    // computeDebitAmount({modelTier:'lite', promptTokenCount:100, candidatesTokenCount:200})
    // = ceil(100*0.00021 + 200*0.00126) = ceil(0.273) = 1
    expect(Number(before!.balance) - Number(after!.balance)).toBe(1);
  });

  it('stops BEFORE calling generateContent when the balance is already exhausted (D-13 hard-stop)', async () => {
    const freshUser = await createTestUser();
    let called = false;
    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 10 }),
      generateContent: async () => { called = true; return { text: 'x', finishReason: 'STOP', promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }; },
    });

    const result = await generate(admin, client, {
      ownerId: freshUser.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'intermediate', customInstruction: null,
      styleId: 'concise-hemingway', genre: '판타지', precedingText: '',
    });

    expect(called).toBe(false);
    expect(result).toEqual({ ok: false, error: expect.any(String), wasCapped: true, remainingBalance: 0 });
    await deleteTestUser(freshUser.id);
  });

  it('caps maxOutputTokens from the remaining balance BEFORE the call fires (D-13 partial-generation case)', async () => {
    const lowBalanceUser = await createTestUser();
    await admin.rpc('apply_wallet_delta', { p_wallet_id: lowBalanceUser.id, p_delta: 1, p_reference_type: 'test_grant', p_reference_id: 'low-1', p_reason: 'test' });

    let capturedMaxOutputTokens: number | null = null;
    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 500 }),
      generateContent: async (params) => {
        capturedMaxOutputTokens = params.maxOutputTokens;
        return { text: '일부만 생성됨', finishReason: 'MAX_TOKENS', promptTokenCount: 500, candidatesTokenCount: params.maxOutputTokens, totalTokenCount: 500 + params.maxOutputTokens };
      },
    });

    const result = await generate(admin, client, {
      ownerId: lowBalanceUser.id, workId, chapterId, modelTier: 'pro',
      mentionedNodeIds: [], presetLevel: 'intermediate', customInstruction: null,
      styleId: 'concise-hemingway', genre: '판타지', precedingText: '',
    });

    expect(capturedMaxOutputTokens).toBe(710);
    expect(result.ok).toBe(true);
    expect(result.wasCapped).toBe(true);
    expect(result.text).toBe('일부만 생성됨');
    await deleteTestUser(lowBalanceUser.id);
  });
});

describe('lib/ai/generate.ts — estimateCost() (EDIT-05)', () => {
  it('returns the countTokens totalTokens verbatim, with no wallet interaction', async () => {
    const admin = adminClient();
    const owner = await createTestUser();
    const client = createMockGeminiClient({ countTokens: async () => ({ totalTokens: 1234 }) });

    const result = await estimateCost(admin, client, {
      ownerId: owner.id, workId: '00000000-0000-0000-0000-000000000000', modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'beginner', customInstruction: null,
      styleId: 'concise-hemingway', genre: '판타지', precedingText: '',
    });

    expect(result).toEqual({ ok: true, estimatedTokens: 1234 });
    await deleteTestUser(owner.id);
  });
});
