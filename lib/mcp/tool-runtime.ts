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

const ERRORS = {
  auth: '인증 정보를 확인할 수 없습니다.',
  scope: '읽기 권한이 필요합니다.',
  input: '입력값을 확인해주세요.',
  missing: '요청한 항목을 찾을 수 없습니다.',
  failed: '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
} as const;

/** Only locally chosen error codes may cross the execution boundary. */
export class McpToolError extends Error {
  constructor(readonly code: 'missing') { super(code); }
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
      return failure(error instanceof McpToolError ? ERRORS[error.code] : ERRORS.failed);
    }
  };
}
