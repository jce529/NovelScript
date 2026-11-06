import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatInput } from '@/lib/ai/chat';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import { DEFAULT_STYLE_PRESET, createUntrustedBoundary, neutralizeProtocolTags, quoteUntrusted, stripProtocolTags, type ChatTurn } from '@/lib/ai/prompt';
import { isKnownModel } from '@/lib/ai/providers/catalog';
import type { GenerationRoute } from '@/lib/ai/providers/byok';
import type { Selection } from '@/lib/ai/providers/selection';
import type { ProviderClient } from '@/lib/ai/providers/types';
import { getWorkSystemInstruction } from '@/lib/ai/work-instructions';
import { GENRES } from '@/lib/works/genres';
import { getProposalDetail, isUuid, type DetailHunk } from './queries';
import { tokenize } from './paragraph-merge';
import { REFINE_CANDIDATE_MAX, REFINE_ERROR_COPY, REFINE_LIMITS, type RefineChunkResult, type RefineFailureCode } from './refine-shared';

/**
 * 14-08 (D-P14-11) per-chunk `AI와 다듬기` for the review screen. Separate from the MCP
 * write path and from chatAction (no Jev planning, no after() shadow call): it re-derives one
 * chunk of the writer's own live pending proposal on the server, quotes the external AI's text
 * as untrusted data and runs it through the same gateway as the studio AI panel
 * (resolveGenerationRoute + chat(): wallet debit or BYOK key, idempotency, failure kinds).
 *
 * The answer is only a candidate for the 직접 고치기 field: nothing here writes a proposal,
 * a chapter or a document, and the conversation is not stored (history is client state).
 * Chunk text never comes from the client — only the proposal id and hunk index.
 */

export interface RefineDeps {
  /** Writer's browser-session client (RLS: owner rows only). */
  supabase: SupabaseClient;
  /** From the cookie session, never from client input. */
  userId: string;
  /** resolveGenerationRoute bound to the session (service key or the writer's BYOK key). */
  resolveRoute: (selection: Selection) => Promise<GenerationRoute>;
  /** The gateway chat() (preflight, generation, settlement, failure classification). */
  runChat: (client: ProviderClient, input: ChatInput) => Promise<ChatResult>;
  newBoundary?: () => string;
}

const providerEnum = z.enum(['gemini', 'openai', 'anthropic']);
const noNul = (s: string) => !s.includes('\u0000');

// Mirrors chatActionSchema (provider enum, known model, UUID idempotency key, key source),
// which is module-private in the chapter 'use server' file. Strict: chunk text, owner ids and
// anything else the client might add are rejected, not ignored.
const refineInputSchema = z.object({
  proposalId: z.string().refine(isUuid),
  hunkIndex: z.number().int().min(0).max(100_000),
  seenHash: z.string().min(1).max(200),
  message: z.string().max(REFINE_LIMITS.messageChars).refine((s) => s.trim().length > 0 && noNul(s)),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(REFINE_LIMITS.turnChars).refine(noNul),
  }).strict()).max(REFINE_LIMITS.historyTurns),
  providerId: providerEnum,
  model: z.string().max(200),
  keySource: z.enum(['service', 'byok']),
  idempotencyKey: z.string().uuid(),
}).strict().refine((v) => isKnownModel(v.providerId, v.model));

const fail = (code: Exclude<RefineFailureCode, 'chat'>): RefineChunkResult => ({ ok: false, code, error: REFINE_ERROR_COPY[code] });
const chatFail = (chat: ChatResult): RefineChunkResult => ({ ok: false, code: 'chat', error: chat.error ?? CHAT_COPY.unknown, chat });

/** 직접 고치기 exists only on applicable 바뀜/추가 chunks; the same set may be refined. */
export function isRefinableHunk(h: Pick<DetailHunk, 'kind' | 'applicable' | 'anchor'>): boolean {
  return h.applicable && h.anchor !== null && (h.kind === '바뀜' || h.kind === '추가');
}

const stripTail = (s: string) => s.replace(/\s+$/, '');

/**
 * The quoted context: change kind, the paragraph before, the current original (바뀜 only),
 * the external draft and the paragraph after — nothing else from the proposal or the work.
 */
export function buildRefineContext(
  args: { kind: 'chapter_draft' | 'kb_edit'; hunk: DetailHunk; current: string },
  boundary: string,
): string {
  const { hunk, current, kind } = args;
  const tokens = tokenize(current);
  const anchor = hunk.anchor as { start: number; end: number };
  const prev = anchor.start > 0 ? stripTail(tokens[anchor.start - 1] ?? '') : '';
  const next = stripTail(tokens[anchor.end] ?? '');
  const parts = [
    `대상: ${kind === 'chapter_draft' ? '회차 본문' : '설정집 문서'}`,
    `변경 종류: ${hunk.kind}`,
  ];
  if (prev) parts.push(quoteUntrusted('앞 문단', prev, boundary));
  if (hunk.kind === '바뀜') parts.push(quoteUntrusted('지금 원문', stripTail(hunk.currentText), boundary));
  parts.push(quoteUntrusted('외부 AI 초안', stripTail(hunk.after), boundary));
  if (next) parts.push(quoteUntrusted('뒤 문단', next, boundary));
  return parts.join('\n\n');
}

/**
 * `draft ?? reply` as a 직접 고치기 candidate, or null when nothing usable is left.
 * - Every protocol tag nested inside the block is removed (repeated until stable, so removal
 *   cannot assemble a new tag such as `[DR[DRAFT]AFT]`).
 * - Normalized like the accept action's 직접 고침 text (LF, no NUL); trailing newlines dropped.
 * - Capped so the text the panel inserts — candidate + the chunk's trailing newline run
 *   (candidateForEdit) — never exceeds the accept limit (100,000 chapter / 50,000 document).
 */
export function refineCandidate(
  result: Pick<ChatResult, 'draft' | 'reply'>, kind: 'chapter_draft' | 'kb_edit', hunkAfter: string,
): string | null {
  let text = (result.draft ?? result.reply ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  for (let prev = ''; prev !== text;) {
    prev = text;
    text = stripProtocolTags(text);
  }
  const tail = hunkAfter.match(/\n*$/)?.[0] ?? '';
  const max = Math.max(0, REFINE_CANDIDATE_MAX[kind] - tail.length);
  const candidate = text.replace(/\n+$/, '').slice(0, max).replace(/\n+$/, '');
  return candidate.trim() === '' ? null : candidate;
}

/** Failure outcome without any generated text. */
function sanitizeFailure(result: ChatResult): ChatResult {
  const { reply: _reply, draft: _draft, proposal: _proposal, ...rest } = result; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { ...rest, ok: false };
}

export async function refineChunk(deps: RefineDeps, raw: unknown): Promise<RefineChunkResult> {
  const parsed = refineInputSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid_input');
  const input = parsed.data;
  const { supabase, userId } = deps;
  if (!isUuid(userId)) return fail('unauthenticated');

  // 1. The writer's own proposal; a foreign id is indistinguishable from a missing one.
  let workId: string;
  try {
    const { data, error } = await supabase.from('mcp_proposals').select('work_id')
      .eq('id', input.proposalId).eq('owner_id', userId).maybeSingle();
    if (error) return fail('failed');
    if (!data) return fail('not_found');
    workId = (data as { work_id: string }).work_id;
  } catch {
    return fail('failed');
  }

  // 2. Re-derive the chunk exactly like the review screen (owned work, live pending, target ok).
  const detailResult = await getProposalDetail(supabase, userId, workId, input.proposalId);
  if (!detailResult.ok) return fail(detailResult.reason === 'not_found' ? 'not_found' : 'failed');
  const detail = detailResult.detail;
  if (detail.status !== 'pending' || detail.kind === 'kb_create' || detail.target.state !== 'ok'
    || detail.currentContent === null || detail.seenHash === null) {
    return fail('not_refinable');
  }
  if (detail.seenHash !== input.seenHash) return fail('stale');
  const hunk = detail.hunks.find((h) => h.index === input.hunkIndex);
  if (!hunk || !isRefinableHunk(hunk)) return fail('not_refinable');
  const kind = detail.kind;

  // 3. Trusted context the writer owns: work genre and the stored work instruction (intermediate).
  const [work, instruction] = await Promise.all([
    supabase.from('works').select('genre').eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle()
      .then((r) => r, () => ({ data: null, error: true })),
    getWorkSystemInstruction(supabase, { ownerId: userId, workId }),
  ]);
  if (work.error || !work.data || !instruction.ok) return fail('failed');
  const genre = (work.data as { genre: string | null }).genre ?? GENRES[0];

  // 4. Same route resolution as chatAction: service key or BYOK, replacement proposal on a bad key.
  const selection: Selection = { providerId: input.providerId, model: input.model, keySource: input.keySource };
  let route: GenerationRoute;
  try {
    route = await deps.resolveRoute(selection);
  } catch {
    // Never log or return the raw error: it may carry the API key (D-11).
    console.error('[ai] refine route unavailable', { provider: input.providerId, idempotencyKey: input.idempotencyKey });
    return chatFail({ ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config });
  }
  if (route.kind === 'replacement_required') {
    return chatFail({
      kind: 'replacement_required', ok: false, status: 'failed', failureKind: 'unavailable',
      replacement: route.replacement as ChatResult['replacement'],
      original: { providerId: input.providerId, model: input.model }, error: CHAT_COPY.unavailable,
    });
  }

  // 5. One gateway call. Explicit field list (never spread input).
  const boundary = (deps.newBoundary ?? createUntrustedBoundary)();
  const chatHistory: ChatTurn[] = [
    ...input.history.map((turn) => ({ role: turn.role, content: neutralizeProtocolTags(turn.content) })),
    { role: 'user', content: neutralizeProtocolTags(input.message) },
  ];
  const result = await deps.runChat(route.client, {
    ownerId: userId,
    workId,
    ...(kind === 'chapter_draft' ? { chapterId: detail.target.chapterId ?? undefined } : { nodeId: detail.target.nodeId ?? undefined }),
    contextKind: 'refine',
    providerId: input.providerId,
    model: input.model,
    mentionedNodeIds: [],
    presetLevel: 'intermediate',
    styleId: DEFAULT_STYLE_PRESET,
    genre,
    precedingText: buildRefineContext({ kind, hunk, current: detail.currentContent }, boundary),
    chatHistory,
    idempotencyKey: input.idempotencyKey,
    customInstruction: null,
    workSystemInstruction: instruction.instruction,
    route,
  });

  if (!result.ok || result.status !== 'completed') return chatFail(sanitizeFailure(result));
  const candidate = refineCandidate(result, kind, hunk.after);
  // Only protocol tags / blank: nothing to offer (the gateway already settled this send).
  if (candidate === null) return fail('empty_answer');
  return {
    ok: true,
    reply: result.reply ?? '',
    candidate,
    wasCapped: result.wasCapped ?? false,
    ...(result.cappedReason ? { cappedReason: result.cappedReason } : {}),
    ...(result.remainingBalance !== undefined ? { remainingBalance: result.remainingBalance } : {}),
  };
}
