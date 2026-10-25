import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from 'mcp-handler';
import { getMcpAuthServerIssuer, getMcpPublicOrigin } from '@/lib/mcp/auth';

// RFC 9728 Protected Resource Metadata for /mcp. `resource` must equal the MCP URL the
// writer types into Claude (origin + /mcp), and the first authorization server is the
// Supabase Auth issuer. No scopes_supported: Supabase rejects our application scopes.
export function GET(req: Request): Response {
  const origin = getMcpPublicOrigin();
  const issuer = getMcpAuthServerIssuer();
  if (!origin || !issuer) {
    return Response.json({ error: 'server_error', error_description: 'MCP metadata is not configured' }, { status: 503 });
  }
  return protectedResourceHandler({ authServerUrls: [issuer], resourceUrl: `${origin}/mcp` })(req);
}

// Browser-based MCP clients preflight the metadata document.
export const OPTIONS = metadataCorsOptionsRequestHandler();
