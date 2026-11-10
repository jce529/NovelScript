import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getMcpPublicOrigin } from '@/lib/mcp/auth';
import {
  MCP_WRITE_ANNOTATIONS, mcpRpcError, withMcpWriteTool, type McpToolRegistrar,
} from '@/lib/mcp/tool-runtime';
import { KB_CATEGORIES } from '@/lib/kb/categories';

/**
 * Phase 14 proposal tools (D-P14-06/07). They never change chapters or KB nodes: the only
 * effect is a pending row created by the 0041 bearer RPCs, which re-check the live grant,
 * propose_draft scope, suspension and ownership. Identity, owner and source come from the
 * verified bearer only; none of them is an argument.
 */
export const PROPOSAL_MESSAGE = '작가가 스튜디오 리뷰 큐에서 수락해야 반영돼요. 본문은 바뀌지 않았어요.';

const noNul = (value: string) => !value.includes('\u0000');
const notBlank = (value: string) => value.trim().length > 0;
const text = (max: number, description: string) => z.string().min(1).max(max)
  .refine(noNul, '제어 문자(NUL)는 넣을 수 없습니다.')
  .refine(notBlank, '내용이 비어 있습니다.')
  .describe(description);

const workId = z.string().uuid().describe('제안을 남길 본인 작품의 ID (list_works 결과의 id)');

/** 14-13 패치 입력 한도(D-PATCH-01~04). SQL(0044)도 같은 한도를 다시 검사한다. */
export const PATCH_LIMITS = {
  edits: 20, anchor: 500, replace: 10000, hintPara: 100000, chapter: 100000, kb: 50000,
} as const;

const anchor = (description: string) => z.string().min(1).max(PATCH_LIMITS.anchor)
  .refine(noNul, '제어 문자(NUL)는 넣을 수 없습니다.')
  .describe(description);
const replacement = z.string().max(PATCH_LIMITS.replace)
  .refine(noNul, '제어 문자(NUL)는 넣을 수 없습니다.')
  .describe(`바꿔 넣을 글(0~${PATCH_LIMITS.replace}자, 빈 문자열이면 삭제)`);
const hintPara = z.number().int().min(1).max(PATCH_LIMITS.hintPara).optional()
  .describe('대략적인 문단 번호(선택, 1부터). 위치 판정에는 쓰지 않고 오류 안내에만 참고합니다.');

function editsSchema(maxContent: number) {
  return z.array(z.discriminatedUnion('op', [
    z.strictObject({
      op: z.literal('replace').describe('find와 정확히 한 곳 일치하는 글을 replace로 바꿉니다.'),
      find: anchor(`원문에 정확히 한 번 나오는 바꿀 글(1~${PATCH_LIMITS.anchor}자, 공백·줄바꿈까지 그대로)`),
      replace: replacement,
      hint_para: hintPara,
    }),
    z.strictObject({
      op: z.literal('replace_range').describe('start_text 시작부터 end_text 끝까지를 replace로 바꿉니다.'),
      start_text: anchor(`바꿀 범위의 시작 글(1~${PATCH_LIMITS.anchor}자, 원문에 정확히 한 번)`),
      end_text: anchor(`바꿀 범위의 끝 글(1~${PATCH_LIMITS.anchor}자, 원문에 정확히 한 번, 시작보다 뒤)`),
      replace: replacement,
      hint_para: hintPara,
    }),
    z.strictObject({
      op: z.literal('replaceAll').describe('문서 전체를 content로 바꿉니다. 다른 수정과 함께 쓸 수 없습니다.'),
      content: text(maxContent, `새 본문 전문(1~${maxContent}자)`),
    }),
  ]).describe('수정 하나'))
    .min(1).max(PATCH_LIMITS.edits)
    .refine((edits) => edits.length === 1 || edits.every((edit) => edit.op !== 'replaceAll'),
      'replaceAll은 단독으로만 쓸 수 있습니다.')
    .describe(`바꿀 구간 목록(1~${PATCH_LIMITS.edits}개, 원문 순서대로·겹치지 않게). 좌표는 모두 원문 기준입니다.`);
}

const baseHash = (reader: string) => z.string().regex(/^[0-9a-f]{64}$/)
  .describe(`${reader} 응답의 contentHash(소문자 hex 64자). 그 뒤 원문이 바뀌었으면 거절되고 최신 해시를 돌려줍니다.`);

/** edits와 content 중 정확히 하나만 받는다(D-PATCH-04). */
const exactlyOneBody = (value: { edits?: unknown; content?: unknown }) => (value.edits === undefined) !== (value.content === undefined);
const EXACTLY_ONE = 'edits와 content 중 하나만 보내야 합니다.';

export const saveDraftInputSchema = z.strictObject({
  workId,
  chapterId: z.string().uuid().describe('초안을 제안할 회차의 ID (list_chapters 결과의 id). 새 회차는 만들 수 없습니다.'),
  baseHash: baseHash('get_chapter'),
  edits: editsSchema(PATCH_LIMITS.chapter).optional(),
  content: text(PATCH_LIMITS.chapter, `(이전 방식) 회차 본문 전문(1~${PATCH_LIMITS.chapter}자). edits 대신 보내면 replaceAll 하나로 처리합니다.`)
    .optional(),
}).refine(exactlyOneBody, EXACTLY_ONE);

const kbContent = text(PATCH_LIMITS.kb, '설정 문서 본문 전문(1~50000자). 작가가 수락하기 전에는 설정집이 바뀌지 않습니다.');

export const proposeKbDocumentInputSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('create').describe('새 설정 문서를 제안합니다.'),
    workId,
    category: z.enum(KB_CATEGORIES)
      .describe('새 문서의 분류. 인물·장소·사건·세력·아이템 중 하나입니다. 폴더는 작가가 수락할 때 고릅니다.'),
    name: z.string().min(1).max(100)
      .refine(noNul, '제어 문자(NUL)는 넣을 수 없습니다.')
      .refine(notBlank, '이름이 비어 있습니다.')
      .describe('새 설정 문서의 이름(1~100자)'),
    content: kbContent,
  }),
  z.strictObject({
    mode: z.literal('edit').describe('기존 설정 문서의 수정안을 제안합니다.'),
    workId,
    nodeId: z.string().uuid().describe('수정안을 낼 본인 작품 설정 문서의 ID (search_kb 결과의 id)'),
    baseHash: baseHash('get_kb_document'),
    edits: editsSchema(PATCH_LIMITS.kb).optional(),
    content: text(PATCH_LIMITS.kb, `(이전 방식) 설정 문서 본문 전문(1~${PATCH_LIMITS.kb}자). edits 대신 보내면 replaceAll 하나로 처리합니다.`)
      .optional(),
  }).refine(exactlyOneBody, EXACTLY_ONE),
]).describe('설정 문서 신규 생성안(mode=create) 또는 수정안(mode=edit)');

type PatchEdit = NonNullable<z.output<typeof saveDraftInputSchema>['edits']>[number];

/** 기존 content 입력은 replaceAll 하나로 흡수한다(D-PATCH-04). */
function toEdits(input: { edits?: readonly PatchEdit[]; content?: string }): PatchEdit[] {
  return input.edits ? [...input.edits] : [{ op: 'replaceAll', content: input.content ?? '' }];
}

const rpcResultSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('pending'),
  expires_at: z.string().min(1),
  superseded_id: z.string().uuid().nullable(),
});

/** 변경 구간 앞뒤 미리보기 한도(문단 240자, 앞뒤 각 2문단). 길이는 SQL과 같은 코드포인트 기준. */
const PREVIEW_PARAGRAPH_CHARS = 240;
const previewParagraph = z.strictObject({
  text: z.string().refine((value) => [...value].length <= PREVIEW_PARAGRAPH_CHARS && !value.includes('\u0000')),
  truncated: z.boolean(),
});
const previewSchema = z.array(z.strictObject({
  editIndex: z.number().int().min(0).max(PATCH_LIMITS.edits - 1),
  before: z.array(previewParagraph).max(2),
  after: z.array(previewParagraph).max(2),
})).max(PATCH_LIMITS.edits);

export type McpProposalPreviewParagraph = { text: string; truncated: boolean };
export type McpProposalPreview = { editIndex: number; before: McpProposalPreviewParagraph[]; after: McpProposalPreviewParagraph[] };

export interface McpProposalDto {
  proposalId: string;
  status: 'pending';
  expiresAt: string;
  supersededProposalId?: string;
  reviewUrl: string;
  message: string;
  preview?: McpProposalPreview[];
}

/** RPC가 준 미리보기를 한도 안에서만 새 객체로 옮긴다. 형식이 어긋나면 미리보기만 뺀다. */
function readPreview(data: unknown): McpProposalPreview[] | undefined {
  if (!data || typeof data !== 'object' || !Object.hasOwn(data, 'preview')) return undefined;
  const parsed = previewSchema.safeParse((data as { preview: unknown }).preview);
  if (!parsed.success) return undefined;
  const copy = (items: McpProposalPreviewParagraph[]) => items.map(({ text: value, truncated }) => ({ text: value, truncated }));
  return parsed.data.map((item) => ({ editIndex: item.editIndex, before: copy(item.before), after: copy(item.after) }));
}

async function propose(
  db: SupabaseClient, targetWorkId: string, fn: string, args: Record<string, unknown>,
): Promise<McpProposalDto> {
  // Resolved before writing: a proposal must never be saved without a review link to return.
  const origin = getMcpPublicOrigin();
  if (!origin) throw new Error('MCP public origin is not configured');
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mcpRpcError(error);
  const row = rpcResultSchema.parse(data);
  const preview = readPreview(data);
  return {
    proposalId: row.id,
    status: 'pending',
    expiresAt: row.expires_at,
    ...(row.superseded_id ? { supersededProposalId: row.superseded_id } : {}),
    reviewUrl: `${origin}/studio/${encodeURIComponent(targetWorkId)}/review/${encodeURIComponent(row.id)}`,
    message: PROPOSAL_MESSAGE,
    ...(preview ? { preview } : {}),
  };
}

const SEAM_LINE = '수정 구간의 앞뒤 문장과 연결되는지 확인하세요.';

export function registerProposalTools(server: McpToolRegistrar): void {
  server.registerTool('save_draft', {
    title: '회차 초안 제안 저장',
    description: [
      '본인 회차 초안을 "제안"으로 저장합니다. get_chapter의 contentHash를 baseHash로, 바꿀 구간만 edits로 보내세요.',
      SEAM_LINE,
      '본문은 바뀌지 않고 작가가 스튜디오 리뷰 큐에서 수락해야 반영됩니다. 다른 내용으로 다시 저장하면 대기 초안이 하나 더 생기고, 같은 내용이면 기존 제안을 돌려줍니다.',
    ].join('\n'),
    inputSchema: saveDraftInputSchema, annotations: MCP_WRITE_ANNOTATIONS,
  }, withMcpWriteTool(saveDraftInputSchema, async (input, { db }) => propose(db, input.workId, 'mcp_propose_chapter_draft', {
    p_work_id: input.workId, p_chapter_id: input.chapterId, p_base_hash: input.baseHash, p_edits: toEdits(input),
  })));
  server.registerTool('propose_kb_document', {
    title: '설정 문서 제안 저장',
    description: [
      '본인 작품 설정집에 새 문서(mode=create, content) 또는 수정안(mode=edit)을 "제안"으로 저장합니다. 수정안은 get_kb_document의 contentHash를 baseHash로, 바꿀 구간만 edits로 보내세요.',
      SEAM_LINE,
      '설정집은 바뀌지 않고 작가가 스튜디오 리뷰 큐에서 수락해야 반영됩니다.',
    ].join('\n'),
    inputSchema: proposeKbDocumentInputSchema, annotations: MCP_WRITE_ANNOTATIONS,
  }, withMcpWriteTool(proposeKbDocumentInputSchema, async (input, { db }) => (input.mode === 'create'
    ? propose(db, input.workId, 'mcp_propose_kb_create', {
      p_work_id: input.workId, p_category: input.category, p_name: input.name, p_content: input.content,
    })
    : propose(db, input.workId, 'mcp_propose_kb_edit', {
      p_work_id: input.workId, p_node_id: input.nodeId, p_base_hash: input.baseHash, p_edits: toEdits(input),
    }))));
}
