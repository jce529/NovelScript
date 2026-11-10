import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getMentionedNodesContent, searchMentionNodes } from '@/lib/ai/mentions';
import {
  MCP_READ_ANNOTATIONS, McpToolError, withMcpReadTool,
  type McpPage, type McpToolRegistrar,
} from '@/lib/mcp/tool-runtime';
import { requireOwnedWork } from '@/lib/mcp/owned-work';

export const searchKbInputSchema = z.strictObject({
  workId: z.string().uuid(), query: z.string().max(200),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 51).default(0),
  limit: z.number().int().min(1).max(50).default(20),
});
export const getKbDocumentInputSchema = z.strictObject({
  workId: z.string().uuid(), nodeId: z.string().uuid(),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 50000).default(0),
  maxChars: z.number().int().min(1).max(50000).default(20000),
});

const scopeSchema = z.enum(['work', 'account_template']);
const candidateSchema = z.object({ id: z.string().uuid(), name: z.string(), category: z.string() });
const fileSchema = candidateSchema.extend({ scope: scopeSchema, content: z.string().nullable() });
type Scope = z.infer<typeof scopeSchema>;
export interface McpKbSearchDto {
  id: string; name: string; scope: Scope; category: string;
  matchedIn: ('title' | 'body')[]; snippet: string;
}
export interface McpKbDocumentDto {
  id: string; workId: string; name: string; scope: Scope; category: string;
  content: string; offset: number; maxChars: number; totalChars: number;
  nextOffset: number | null; truncated: boolean;
  /** SHA-256(UTF-8 원문 전체) 소문자 hex. 페이지와 무관하며 정규화하지 않는다. */
  contentHash: string;
}

function escapeLike(query: string): string { return query.replace(/[\\%_]/g, '\\$&'); }

/** A narrow read adapter for the existing mention helpers. Every query keeps
 * owner/file/live predicates; a work_id predicate also fixes scope='work'.
 * Reject null/malformed lists before helpers can turn them into empty success.
 * The title helper's 20-row limit becomes a stable DB page, not a result cap.
 * No user text is interpreted as PostgREST boolean-filter syntax.
 */
function mentionClient(db: SupabaseClient, ownerId: string, titleOffset = 0, target?: { id: string; scope: Scope }): SupabaseClient {
  return {
    from(table: string) {
      if (table !== 'kb_nodes') throw new Error('Unexpected mention source');
      return {
        select(columns: string) {
          let query = db.from(table).select(columns)
            .eq('owner_id', ownerId).eq('node_type', 'file').is('deleted_at', null);
          if (target) query = query.eq('id', target.id).eq('scope', target.scope);
          const chain = {
            eq(key: string, value: unknown) {
              query = query.eq(key, value);
              if (key === 'work_id') query = query.eq('scope', 'work');
              return chain;
            },
            is(key: string, value: null) { query = query.is(key, value); return chain; },
            in(key: string, values: string[]) {
              // The editor hides work template titles; MCP's approved boundary
              // includes every file in the owned work, including templates.
              query = query.in(key, key === 'category' ? [...values, 'template'] : values);
              return chain;
            },
            ilike(key: string, value: string) { query = query.ilike(key, value); return chain; },
            order(key: string) {
              query = query.order(key, { ascending: true }).order('id', { ascending: true });
              return chain;
            },
            limit(count: number) { query = query.range(titleOffset, titleOffset + count - 1); return chain; },
            then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject: (reason: unknown) => unknown) {
              return Promise.resolve(query).then(({ data, error }) => {
                if (error) throw error;
                const schema = columns.split(',').some((column) => column.trim() === 'content')
                  ? candidateSchema.extend({ content: z.string().nullable() }) : candidateSchema;
                return { data: z.array(schema).parse(data), error: null };
              }).then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

function snippet(content: string, query: string): string {
  const at = query ? content.toLowerCase().indexOf(query.toLowerCase()) : 0;
  let start = Math.max(0, at - 60);
  let end = Math.min(content.length, start + 240);
  const low = (i: number) => /[\uDC00-\uDFFF]/.test(content.charAt(i));
  const high = (i: number) => /[\uD800-\uDBFF]/.test(content.charAt(i));
  if (start > 0 && low(start) && high(start - 1)) start++;
  if (end < content.length && high(end - 1) && low(end)) end--;
  return content.slice(start, end);
}

async function searchKb(
  db: SupabaseClient, userId: string, workId: string, query: string,
): Promise<McpKbSearchDto[]> {
  const found = new Map<string, McpKbSearchDto>();
  const trimmed = query.trim();
  const escaped = escapeLike(trimmed);
  if (trimmed) {
    // Both helper branches are read through stable pages, including title-only
    // matches beyond row 20. Continue until neither branch could have filled.
    for (let offset = 0; ; offset += 20) {
      const titles = z.array(candidateSchema.extend({ scope: scopeSchema })).parse(await searchMentionNodes(
        mentionClient(db, userId, offset), { ownerId: userId, workId, query: escaped },
      ));
      for (const row of titles) {
        // PostgREST accepts * as a LIKE alias. A literal substring check keeps
        // that server-side superset from widening user-visible results.
        if (row.name.toLowerCase().includes(trimmed.toLowerCase())) {
          found.set(row.id, { ...row, matchedIn: ['title'], snippet: snippet(row.name, trimmed) });
        }
      }
      if (titles.length < 20) break;
    }
  }
  for (const scope of ['work', 'account_template'] as const) {
    // Explicit ranges avoid silently losing results at the REST server row cap.
    for (let offset = 0; ; offset += 100) {
      let request = db.from('kb_nodes').select('id, name, category, scope, content')
        .eq('owner_id', userId).eq('scope', scope).eq('node_type', 'file').is('deleted_at', null);
      if (scope === 'work') request = request.eq('work_id', workId);
      if (trimmed) request = request.ilike('content', `%${escaped}%`);
      const { data, error } = await request.order('name', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + 99);
      if (error) throw error;
      const rows = z.array(fileSchema.extend({ scope: z.literal(scope) })).parse(data);
      for (const row of rows) {
        if (trimmed && !(row.content ?? '').toLowerCase().includes(trimmed.toLowerCase())) continue;
        const previous = found.get(row.id);
        found.set(row.id, {
          id: row.id, name: row.name, category: row.category, scope: row.scope,
          matchedIn: trimmed ? previous ? ['title', 'body'] : ['body'] : [],
          snippet: snippet(row.content ?? '', trimmed),
        });
      }
      if (rows.length < 100) break;
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

async function readDocument(db: SupabaseClient, userId: string, workId: string, nodeId: string) {
  const matches = [];
  for (const scope of ['work', 'account_template'] as const) {
    let request = db.from('kb_nodes').select('id, name, category, scope')
      .eq('id', nodeId).eq('owner_id', userId).eq('scope', scope).eq('node_type', 'file').is('deleted_at', null);
    if (scope === 'work') request = request.eq('work_id', workId);
    const { data, error } = await request.maybeSingle();
    if (error) throw error;
    if (data !== null) matches.push(candidateSchema.extend({ id: z.literal(nodeId), scope: z.literal(scope) }).parse(data));
  }
  if (matches.length === 0) throw new McpToolError('missing');
  if (matches.length !== 1) throw new Error('Invalid document membership');
  const metadata = matches[0];
  const docs = z.array(candidateSchema.extend({ content: z.string() })).parse(await getMentionedNodesContent(
    mentionClient(db, userId, 0, metadata), { ownerId: userId, workId, nodeIds: [nodeId] },
  ));
  if (docs.length !== 1 || docs[0].id !== nodeId) throw new McpToolError('missing');
  return { ...metadata, content: docs[0].content };
}

/** UTF-16 offsets, same rule as get_chapter: a start inside a pair backs up one unit so the
 * whole pair is returned; an end inside a pair shrinks, or grows one unit to return a whole emoji.
 */
function textPage(content: string, offset: number, maxChars: number) {
  const high = (i: number) => { const c = content.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff; };
  const low = (i: number) => { const c = content.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
  let start = offset;
  if (start > 0 && start < content.length && low(start) && high(start - 1)) start -= 1;
  let end = Math.min(start + maxChars, content.length);
  if (end > start && end < content.length && high(end - 1) && low(end)) {
    end = end - 1 > start ? end - 1 : end + 1;
  }
  const nextOffset = end < content.length ? end : null;
  return { content: content.slice(start, end), offset: start, maxChars, totalChars: content.length, nextOffset, truncated: nextOffset !== null };
}

/** Registration only; the /mcp route is connected in plan 13-05. */
export function registerKbTools(server: McpToolRegistrar): void {
  server.registerTool('search_kb', {
    title: '내 설정집 검색',
    description: '본인 작품 설정집과 본인의 계정 공유 문서를 제목·본문으로 검색합니다. 빈 검색어는 파일 목록입니다.',
    inputSchema: searchKbInputSchema, annotations: MCP_READ_ANNOTATIONS,
  }, withMcpReadTool(searchKbInputSchema, async ({ workId, query, offset, limit }, { db, userId }): Promise<McpPage<McpKbSearchDto>> => {
    await requireOwnedWork(db, userId, workId);
    const rows = await searchKb(db, userId, workId, query);
    return { items: rows.slice(offset, offset + limit), offset, limit, nextOffset: offset + limit < rows.length ? offset + limit : null };
  }));
  server.registerTool('get_kb_document', {
    title: '내 설정 문서 읽기',
    description: '본인 작품 또는 본인의 계정 공유 파일 원문을 읽습니다. offset과 maxChars로 이어 읽으며 [[ ]]를 보존합니다.',
    inputSchema: getKbDocumentInputSchema, annotations: MCP_READ_ANNOTATIONS,
  }, withMcpReadTool(getKbDocumentInputSchema, async ({ workId, nodeId, offset, maxChars }, { db, userId }): Promise<McpKbDocumentDto> => {
    await requireOwnedWork(db, userId, workId);
    const document = await readDocument(db, userId, workId, nodeId);
    return { id: document.id, workId, name: document.name, category: document.category, scope: document.scope, ...textPage(document.content, offset, maxChars),
      contentHash: createHash('sha256').update(document.content, 'utf8').digest('hex') };
  }));
}
