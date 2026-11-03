import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import { getMcpPublicOrigin, readMcpAuthExtra, verifyMcpToken } from '@/lib/mcp/auth';
import { MCP_READ_ANNOTATIONS } from '@/lib/mcp/tool-runtime';
import { registerKbTools } from '@/lib/mcp/tools/kb';
import { registerWorkTools } from '@/lib/mcp/tools/works';
import { registerWritingContextTools } from '@/lib/mcp/tools/writing-context';

// Seven read-only tools: Phase 12 whoami (D-16) plus the Phase 13 work/KB/context readers.
// Every one sits behind withMcpAuth(required) below, so the signature and live grant are
// re-checked per request before any tool runs; tools take identity only from that AuthInfo.
const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'whoami',
      {
        title: '연결된 작가 확인',
        description: '이 연결을 승인한 NovelScript 작가 계정의 사용자 ID를 반환합니다. 읽기 전용입니다.',
        // No arguments: the identity comes only from the verified bearer, never from the request.
        inputSchema: z.strictObject({}),
        annotations: MCP_READ_ANNOTATIONS,
      },
      async (_args, ctx) => {
        const identity = readMcpAuthExtra(ctx.http?.authInfo);
        if (!identity) {
          return { isError: true, content: [{ type: 'text', text: '인증 정보를 확인할 수 없습니다.' }] };
        }
        return { content: [{ type: 'text', text: JSON.stringify({ userId: identity.userId }) }] };
      },
    );
    registerWorkTools(server); // list_works, list_chapters, get_chapter
    registerKbTools(server); // search_kb, get_kb_document
    registerWritingContextTools(server); // get_writing_context
  },
  { serverInfo: { name: 'novelscript', version: '0.1.0' } },
);

const RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/mcp';

async function handle(req: Request): Promise<Response> {
  // withMcpAuth's resourceUrl is the ORIGIN (resource_metadata = origin + path), unlike the
  // PRM's resource, which is the full /mcp URL (12-01 design input 1). Without an explicit
  // origin mcp-handler would trust x-forwarded-* headers, so refuse to serve instead.
  const origin = getMcpPublicOrigin();
  if (!origin) {
    return Response.json({ error: 'server_error', error_description: 'MCP endpoint is not configured' }, { status: 503 });
  }
  const authed = withMcpAuth(handler, verifyMcpToken, {
    // Mandatory: the default (false) lets token-less requests reach the tools.
    required: true,
    resourceMetadataPath: RESOURCE_METADATA_PATH,
    resourceUrl: origin,
  });
  return authed(req);
}

export { handle as GET, handle as POST };
