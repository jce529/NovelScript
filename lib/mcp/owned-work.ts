import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { McpToolError } from '@/lib/mcp/tool-runtime';

/**
 * Shared ownership gate for MCP read tools (works, kb). Unlike getWork/listChapters it never
 * swallows errors during an ownership decision: a DB error propagates (the runtime turns it into
 * a generic failure), no row is 'missing', and a row that does not match the requested work and
 * the bearer's user is rejected as an invalid result.
 */
export async function requireOwnedWork(db: SupabaseClient, userId: string, workId: string): Promise<void> {
  const { data, error } = await db.from('works').select('id, owner_id')
    .eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (data === null) throw new McpToolError('missing');
  z.object({ id: z.literal(workId), owner_id: z.literal(userId) }).parse(data);
}
