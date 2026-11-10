import 'server-only';
import type { AuthInfo, McpServer } from '@modelcontextprotocol/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { readMcpAuthExtra } from '@/lib/mcp/auth';
import { createMcpDbClient } from '@/lib/mcp/db-client';

/** The SDK's registerTool contract; tools remain unregistered until 13-05. */
export type McpToolRegistrar = Pick<McpServer, 'registerTool'>;
export type McpToolContext = { http?: { authInfo?: AuthInfo } };
export type McpToolSession = { db: SupabaseClient; userId: string };
export type McpToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
export type McpPage<T> = { items: T[]; offset: number; limit: number; nextOffset: number | null };

export const MCP_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Proposal tools never change chapters or KB nodes: they only add a pending row through the
 * 0041 RPCs. idempotentHint is true because those RPCs dedupe "same connection + same
 * content" to the same proposal id instead of stacking a new row.
 */
export const MCP_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const ERRORS = {
  auth: '인증 정보를 확인할 수 없습니다.',
  scope: '읽기 권한이 필요합니다.',
  input: '입력값을 확인해주세요.',
  missing: '요청한 항목을 찾을 수 없습니다.',
  failed: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
} as const;

const WRITE_ERRORS = {
  auth: ERRORS.auth,
  input: ERRORS.input,
  missing: ERRORS.missing,
  scope: '초안 제안 권한이 없습니다. NovelScript에서 연결을 다시 승인해주세요.',
  suspended: '계정 이용이 제한되어 제안을 저장할 수 없습니다.',
  cap: '대기 중인 제안이 너무 많습니다. 스튜디오 리뷰 큐에서 먼저 정리해주세요.',
  no_change: '현재 내용과 같아서 저장할 제안이 없습니다.',
  failed: '제안을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
} as const;

/** Every message a write tool may return; anything else would be a leak. */
export const MCP_WRITE_ERROR_MESSAGES: readonly string[] = Object.values(WRITE_ERRORS);

type McpToolErrorCode = 'missing' | 'suspended' | 'cap' | 'no_change' | 'scope';

/** Only locally chosen error codes may cross the execution boundary. */
export class McpToolError extends Error {
  constructor(readonly code: McpToolErrorCode) { super(code); }
}

/** The only proposal RPC messages that map to a specific answer (exact match, 0041). */
const RPC_ERROR_CODES: Record<string, McpToolErrorCode> = {
  mcp_not_found: 'missing',
  mcp_suspended: 'suspended',
  mcp_cap_reached: 'cap',
  mcp_scope_denied: 'scope',
  mcp_no_change: 'no_change',
};

/**
 * 14-13 패치 오류 계약. 0044 제안 RPC가 `raise exception '<message>' using errcode = '<SQLSTATE>',
 * detail = '<JSON>'`으로 던지는 값 중 아래 표와 message·SQLSTATE가 정확히 일치할 때만 DETAIL JSON을
 * 파싱하고, 코드별 허용 필드만 다시 검증해 새 객체로 만든다. 그 밖의 경우는 고정 실패 문구다.
 */
const PATCH_ERRORS = {
  mcp_patch_stale: { code: 'stale', sqlstate: 'P0001' },
  mcp_patch_no_match: { code: 'no_match', sqlstate: 'P0001' },
  mcp_patch_ambiguous: { code: 'ambiguous', sqlstate: 'P0001' },
  mcp_patch_overlap: { code: 'overlap', sqlstate: 'P0001' },
  mcp_patch_limit: { code: 'limit', sqlstate: '22023' },
  mcp_patch_invalid: { code: 'invalid', sqlstate: '22023' },
} as const;

type McpPatchErrorCode = (typeof PATCH_ERRORS)[keyof typeof PATCH_ERRORS]['code'];

const PATCH_MESSAGES: Record<McpPatchErrorCode, string> = {
  stale: '읽은 뒤 원문이 바뀌었습니다. 문서를 다시 읽고 latestHash를 baseHash로 넣어 수정안을 다시 만들어주세요.',
  no_match: '수정할 구간을 원문에서 찾지 못했습니다. 원문에 있는 글자 그대로 다시 지정해주세요.',
  ambiguous: '수정할 구간이 원문 여러 곳과 일치합니다. 앞뒤 글자를 더 넣어 한 곳만 가리키게 해주세요.',
  overlap: '수정 구간의 순서나 범위가 맞지 않습니다. 원문 순서대로, 서로 겹치지 않게 지정해주세요.',
  limit: '수정 개수나 길이, 결과 본문 길이가 허용 한도를 넘었습니다.',
  invalid: '수정 형식을 확인해주세요. 전체 교체(replaceAll)는 다른 수정과 함께 쓸 수 없습니다.',
};

/** Every message a structured patch error may carry. */
export const MCP_PATCH_ERROR_MESSAGES: readonly string[] = Object.values(PATCH_MESSAGES);

const PATCH_MAX_EDITS = 20;
const PATCH_CONTEXT_CHARS = 20;
const PATCH_MAX_POSITION = 1_000_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
/** SQL length()와 같은 코드포인트 기준 길이. */
const codePoints = (value: string) => [...value].length;

const editIndex = z.number().int().min(0).max(PATCH_MAX_EDITS - 1);
const latestHash = z.string().regex(HASH_PATTERN);
const anchorReason = z.enum(['find', 'start_text', 'end_text']);
const contextText = z.string()
  .refine((value) => codePoints(value) <= PATCH_CONTEXT_CHARS && !value.includes('\u0000'));
const candidate = z.strictObject({
  position: z.number().int().min(1).max(PATCH_MAX_POSITION),
  before: contextText,
  after: contextText,
});

const PATCH_DETAIL_SCHEMAS = {
  stale: z.strictObject({ code: z.literal('stale'), latestHash }),
  no_match: z.strictObject({ code: z.literal('no_match'), editIndex, reason: anchorReason }),
  ambiguous: z.strictObject({
    code: z.literal('ambiguous'), editIndex, reason: anchorReason, candidates: z.array(candidate).min(2).max(3),
  }),
  overlap: z.strictObject({
    code: z.literal('overlap'), editIndex, reason: z.enum(['range_reversed', 'overlap', 'not_ascending']),
  }),
  limit: z.strictObject({
    code: z.literal('limit'), editIndex: editIndex.optional(),
    reason: z.enum(['edit_count', 'anchor_length', 'replace_length', 'delete_length', 'result_length']),
  }),
  invalid: z.strictObject({
    code: z.literal('invalid'), editIndex: editIndex.optional(),
    reason: z.enum(['replace_all_mixed', 'unknown_op', 'malformed']),
  }),
} as const;

export type McpPatchErrorDetail = {
  code: McpPatchErrorCode;
  editIndex?: number;
  reason?: string;
  latestHash?: string;
  candidates?: { position: number; before: string; after: string }[];
};

/** 검증을 통과해 새로 만든 패치 오류만 담는다. 원본 RPC 오류 객체는 보관하지 않는다. */
export class McpPatchError extends Error {
  constructor(readonly detail: McpPatchErrorDetail) { super(detail.code); }
}

function patchError(message: string, error: { code?: unknown; details?: unknown }): McpPatchError | undefined {
  if (!Object.hasOwn(PATCH_ERRORS, message)) return undefined;
  const expected = PATCH_ERRORS[message as keyof typeof PATCH_ERRORS];
  if (error.code !== expected.sqlstate || typeof error.details !== 'string') return undefined;
  let raw: unknown;
  try { raw = JSON.parse(error.details); } catch { return undefined; }
  const parsed = PATCH_DETAIL_SCHEMAS[expected.code].safeParse(raw);
  if (!parsed.success) return undefined;
  const value = parsed.data as McpPatchErrorDetail;
  // 허용 필드만 순서대로 옮겨 새 객체를 만든다.
  return new McpPatchError({
    code: expected.code,
    ...(value.editIndex !== undefined ? { editIndex: value.editIndex } : {}),
    ...(value.reason !== undefined ? { reason: value.reason } : {}),
    ...(value.latestHash !== undefined ? { latestHash: value.latestHash } : {}),
    ...(value.candidates !== undefined
      ? { candidates: value.candidates.map(({ position, before, after }) => ({ position, before, after })) }
      : {}),
  });
}

/** Turns an RPC error into a safe local error; unknown messages stay generic. */
export function mcpRpcError(
  error: { message?: unknown; code?: unknown; details?: unknown } | null | undefined,
): Error {
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = Object.hasOwn(RPC_ERROR_CODES, message) ? RPC_ERROR_CODES[message] : undefined;
  if (code) return new McpToolError(code);
  return (error && patchError(message, error)) ?? new Error('Proposal RPC failed');
}

function failure(message: string): McpToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function patchFailure(detail: McpPatchErrorDetail): McpToolResult {
  return failure(JSON.stringify({ message: PATCH_MESSAGES[detail.code], ...detail }));
}

/**
 * Used only behind withMcpAuth: the route verifies signature and live grant on
 * every request. Tools take identity from that AuthInfo, never from arguments.
 * Parse again here so direct invocations have the same strict input boundary.
 */
export function withMcpReadTool<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, session: McpToolSession) => Promise<object>,
): (input: unknown, ctx: McpToolContext) => Promise<McpToolResult> {
  return async (input, ctx) => {
    try {
      const info = ctx.http?.authInfo;
      const identity = readMcpAuthExtra(info);
      if (!identity || !info?.token) return failure(ERRORS.auth);
      if (!identity.grantScopes.includes('read')) return failure(ERRORS.scope);
      const parsed = schema.safeParse(input);
      if (!parsed.success) return failure(ERRORS.input);
      const db = createMcpDbClient(info.token);
      const data = await handler(parsed.data, { db, userId: identity.userId });
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return failure(error instanceof McpToolError && error.code === 'missing' ? ERRORS.missing : ERRORS.failed);
    }
  };
}

/**
 * Write counterpart of withMcpReadTool for the proposal tools. The grant must carry
 * propose_draft; the RPC re-checks the live grant, scope, suspension and ownership, so this
 * check only answers early. Only the allowlisted RPC messages get a specific answer.
 */
export function withMcpWriteTool<S extends z.ZodType>(
  schema: S,
  handler: (input: z.output<S>, session: McpToolSession) => Promise<object>,
): (input: unknown, ctx: McpToolContext) => Promise<McpToolResult> {
  return async (input, ctx) => {
    try {
      const info = ctx.http?.authInfo;
      const identity = readMcpAuthExtra(info);
      if (!identity || !info?.token) return failure(WRITE_ERRORS.auth);
      if (!identity.grantScopes.includes('propose_draft')) return failure(WRITE_ERRORS.scope);
      const parsed = schema.safeParse(input);
      if (!parsed.success) return failure(WRITE_ERRORS.input);
      const db = createMcpDbClient(info.token);
      const data = await handler(parsed.data, { db, userId: identity.userId });
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      if (error instanceof McpPatchError) return patchFailure(error.detail);
      return failure(error instanceof McpToolError ? WRITE_ERRORS[error.code] : WRITE_ERRORS.failed);
    }
  };
}
