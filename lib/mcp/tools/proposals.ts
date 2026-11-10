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

export const saveDraftInputSchema = z.strictObject({
  workId,
  chapterId: z.string().uuid().describe('초안을 제안할 회차의 ID (list_chapters 결과의 id). 새 회차는 만들 수 없습니다.'),
  content: text(100000, '회차 본문 초안 전문(1~100000자). 일부가 아닌 전체 본문을 보내야 하며, 작가가 수락하기 전에는 원문이 바뀌지 않습니다.'),
});

const kbContent = text(50000, '설정 문서 본문 전문(1~50000자). 작가가 수락하기 전에는 설정집이 바뀌지 않습니다.');

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
    content: kbContent,
  }),
]).describe('설정 문서 신규 생성안(mode=create) 또는 수정안(mode=edit)');

const rpcResultSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('pending'),
  expires_at: z.string().min(1),
  superseded_id: z.string().uuid().nullable(),
});

export interface McpProposalDto {
  proposalId: string;
  status: 'pending';
  expiresAt: string;
  supersededProposalId?: string;
  reviewUrl: string;
  message: string;
}

async function propose(
  db: SupabaseClient, targetWorkId: string, fn: string, args: Record<string, string>,
): Promise<McpProposalDto> {
  // Resolved before writing: a proposal must never be saved without a review link to return.
  const origin = getMcpPublicOrigin();
  if (!origin) throw new Error('MCP public origin is not configured');
  const { data, error } = await db.rpc(fn, args);
  if (error) throw mcpRpcError(error);
  const row = rpcResultSchema.parse(data);
  return {
    proposalId: row.id,
    status: 'pending',
    expiresAt: row.expires_at,
    ...(row.superseded_id ? { supersededProposalId: row.superseded_id } : {}),
    reviewUrl: `${origin}/studio/${encodeURIComponent(targetWorkId)}/review/${encodeURIComponent(row.id)}`,
    message: PROPOSAL_MESSAGE,
  };
}

export function registerProposalTools(server: McpToolRegistrar): void {
  server.registerTool('save_draft', {
    title: '회차 초안 제안 저장',
    description: '본인 회차에 초안 전문을 "제안"으로 저장합니다. 본문은 바뀌지 않고, 작가가 스튜디오 리뷰 큐에서 수락해야 반영됩니다. 같은 회차에 다른 내용으로 다시 저장하면 대기 초안이 하나 더 생기고(이전 것은 그대로 남습니다), 같은 내용이면 기존 제안을 그대로 돌려줍니다.',
    inputSchema: saveDraftInputSchema, annotations: MCP_WRITE_ANNOTATIONS,
  }, withMcpWriteTool(saveDraftInputSchema, async (input, { db }) => propose(db, input.workId, 'mcp_propose_chapter_draft', {
    p_work_id: input.workId, p_chapter_id: input.chapterId, p_content: input.content,
  })));
  server.registerTool('propose_kb_document', {
    title: '설정 문서 제안 저장',
    description: '본인 작품 설정집에 새 문서(mode=create) 또는 기존 문서 수정안(mode=edit)을 "제안"으로 저장합니다. 설정집은 바뀌지 않고, 작가가 스튜디오 리뷰 큐에서 수락해야 반영됩니다.',
    inputSchema: proposeKbDocumentInputSchema, annotations: MCP_WRITE_ANNOTATIONS,
  }, withMcpWriteTool(proposeKbDocumentInputSchema, async (input, { db }) => (input.mode === 'create'
    ? propose(db, input.workId, 'mcp_propose_kb_create', {
      p_work_id: input.workId, p_category: input.category, p_name: input.name, p_content: input.content,
    })
    : propose(db, input.workId, 'mcp_propose_kb_edit', {
      p_work_id: input.workId, p_node_id: input.nodeId, p_content: input.content,
    }))));
}
