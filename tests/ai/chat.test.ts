import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chat, parseChatResponse } from '../../lib/ai/chat';
import { createMockGeminiClient } from '../../lib/ai/gemini';
import { createChapter } from '../../lib/chapters/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('lib/ai/chat.ts — parseChatResponse (REPLY/DRAFT/DOCUMENT protocol)', () => {
  it('parses a plain [REPLY]-only response (no draft, no proposal)', () => {
    const result = parseChatResponse('[REPLY]\n어떤 전개를 원하세요?\n[/REPLY]');
    expect(result).toEqual({ reply: '어떤 전개를 원하세요?', draft: null, proposal: null });
  });

  it('parses a [REPLY] + [DRAFT] response as a chapter-prose draft', () => {
    const raw = '[REPLY]\n이렇게 이어봤어요.\n[DRAFT]\n태준이 손을 내밀었다.\n[/DRAFT]';
    const result = parseChatResponse(raw);
    expect(result.reply).toBe('이렇게 이어봤어요.');
    expect(result.draft).toBe('태준이 손을 내밀었다.');
    expect(result.proposal).toBeNull();
  });

  it('parses a [REPLY] + [DOCUMENT] response as a KB document proposal', () => {
    const raw = '[REPLY]\n확인했어요.\n[DOCUMENT]\n카테고리: 장소\n이름: 폐허가 된 성당\n내용:\n전쟁으로 무너진 성당.\n[/DOCUMENT]';
    const result = parseChatResponse(raw);
    expect(result.reply).toBe('확인했어요.');
    expect(result.draft).toBeNull();
    expect(result.proposal).toEqual({ category: '장소', name: '폐허가 된 성당', content: '전쟁으로 무너진 성당.' });
  });

  it('falls back to the whole text as the reply when the model ignores the format', () => {
    const result = parseChatResponse('그냥 평범한 대답입니다.');
    expect(result).toEqual({ reply: '그냥 평범한 대답입니다.', draft: null, proposal: null });
  });

  it('never returns a proposal for an invalid/unrecognized category (no garbage KB doc)', () => {
    const raw = '[REPLY]\n정리했어요.\n[DOCUMENT]\n카테고리: 소품\n이름: 뭔가\n내용:\n내용\n[/DOCUMENT]';
    expect(parseChatResponse(raw).proposal).toBeNull();
  });

  it('never returns a proposal when the document block is missing a required field', () => {
    const raw = '[REPLY]\n정리했어요.\n[DOCUMENT]\n카테고리: 인물\n내용:\n이름 없이 내용만\n[/DOCUMENT]';
    expect(parseChatResponse(raw).proposal).toBeNull();
  });
});

describe('lib/ai/chat.ts — chat() (this session: unified chat, D-13 wallet lifecycle reused)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let chapterId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data: work } = await admin.rpc('create_work', {
      p_owner_id: owner.id, p_title: '테스트 작품 (chat)', p_synopsis: null, p_cover_image_url: null, p_genre: null,
    });
    workId = work as string;
    const chapter = await createChapter(admin, { ownerId: owner.id, workId, title: '1화' });
    chapterId = chapter.chapterId!;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('debits the wallet with ACTUAL usage and returns the parsed reply/draft (Pitfall 2)', async () => {
    await admin.rpc('apply_wallet_delta', { p_wallet_id: owner.id, p_delta: 1000, p_reference_type: 'test_grant', p_reference_id: 'grant-1', p_reason: 'test' });
    const { data: before } = await admin.from('wallets').select('balance').eq('id', owner.id).single();

    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 50 }),
      generateContent: async () => ({
        text: '[REPLY]\n이렇게 이어봤어요.\n[DRAFT]\n생성된 문단\n[/DRAFT]',
        finishReason: 'STOP', promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300,
      }),
    });

    const result = await chat(admin, client, {
      ownerId: owner.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지',
      precedingText: '어느 날...', chatHistory: [{ role: 'user', content: '이어서 써줘' }],
    });

    expect(result.ok).toBe(true);
    expect(result.reply).toBe('이렇게 이어봤어요.');
    expect(result.draft).toBe('생성된 문단');
    expect(result.proposal).toBeNull();

    const { data: after } = await admin.from('wallets').select('balance').eq('id', owner.id).single();
    // computeDebitAmount({modelTier:'lite', promptTokenCount:100, candidatesTokenCount:200})
    // = ceil(100*0.00021 + 200*0.00126) = ceil(0.273) = 1
    expect(Number(before!.balance) - Number(after!.balance)).toBe(1);
  });

  it('returns a friendly ok:false (no wallet debit) instead of throwing when generateContent rejects (rate limit / transient 503)', async () => {
    const freshUser = await createTestUser();
    await admin.rpc('apply_wallet_delta', { p_wallet_id: freshUser.id, p_delta: 1000, p_reference_type: 'test_grant', p_reference_id: 'grant-2', p_reason: 'test' });
    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 50 }),
      generateContent: async () => { throw new Error('503 UNAVAILABLE'); },
    });

    const result = await chat(admin, client, {
      ownerId: freshUser.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지',
      precedingText: '어느 날...', chatHistory: [{ role: 'user', content: '이어서 써줘' }],
    });

    expect(result).toEqual({ ok: false, error: expect.any(String) });
    const { data: balance } = await admin.from('wallets').select('balance').eq('id', freshUser.id).single();
    expect(Number(balance!.balance)).toBe(1000);
    await deleteTestUser(freshUser.id);
  });

  it('stops BEFORE calling generateContent when the balance is already exhausted (D-13 hard-stop)', async () => {
    const freshUser = await createTestUser();
    let called = false;
    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 10 }),
      generateContent: async () => { called = true; return { text: 'x', finishReason: 'STOP', promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }; },
    });

    const result = await chat(admin, client, {
      ownerId: freshUser.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지',
      precedingText: '', chatHistory: [{ role: 'user', content: '안녕' }],
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
        return { text: `[REPLY]\n일부만 생성됨\n[/REPLY]`, finishReason: 'MAX_TOKENS', promptTokenCount: 500, candidatesTokenCount: params.maxOutputTokens, totalTokenCount: 500 + params.maxOutputTokens };
      },
    });

    const result = await chat(admin, client, {
      ownerId: lowBalanceUser.id, workId, chapterId, modelTier: 'pro',
      mentionedNodeIds: [], presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지',
      precedingText: '', chatHistory: [{ role: 'user', content: '이어서 써줘' }],
    });

    expect(capturedMaxOutputTokens).toBe(710);
    expect(result.ok).toBe(true);
    expect(result.wasCapped).toBe(true);
    expect(result.reply).toBe('일부만 생성됨');
    await deleteTestUser(lowBalanceUser.id);
  });

  it('returns a document proposal (not a draft) when the AI decides to propose a KB document', async () => {
    const client = createMockGeminiClient({
      countTokens: async () => ({ totalTokens: 50 }),
      generateContent: async () => ({
        text: '[REPLY]\n이런 인물은 어떨까요?\n[DOCUMENT]\n카테고리: 인물\n이름: 오수진\n내용:\n다정한 동료.\n[/DOCUMENT]',
        finishReason: 'STOP', promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300,
      }),
    });

    const result = await chat(admin, client, {
      ownerId: owner.id, workId, chapterId, modelTier: 'lite',
      mentionedNodeIds: [], presetLevel: 'freeform', styleId: 'concise-hemingway', genre: '판타지',
      precedingText: '', chatHistory: [{ role: 'user', content: '동료 인물 하나 만들어줘' }],
    });

    expect(result.ok).toBe(true);
    expect(result.draft).toBeNull();
    expect(result.proposal).toEqual({ category: '인물', name: '오수진', content: '다정한 동료.' });
  });
});
