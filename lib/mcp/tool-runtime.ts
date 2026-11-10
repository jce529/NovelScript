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

/** Turns an RPC error into a safe local error; unknown messages stay generic. */
export function mcpRpcError(error: { message?: unknown } | null | undefined): Error {
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = Object.hasOwn(RPC_ERROR_CODES, message) ? RPC_ERROR_CODES[message] : undefined;
  return code ? new McpToolError(code) : new Error('Proposal RPC failed');
}

function failure(message: string): McpToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
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
      return failure(error instanceof McpToolError ? WRITE_ERRORS[error.code] : WRITE_ERRORS.failed);
    }
  };
}
