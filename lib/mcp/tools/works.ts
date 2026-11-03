import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  MCP_READ_ANNOTATIONS, McpToolError, withMcpReadTool,
  type McpPage, type McpToolRegistrar,
} from '@/lib/mcp/tool-runtime';

const pageInput = {
  limit: z.number().int().min(1).max(50).default(20),
  // Leave room for the page and look-ahead without losing integer precision.
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 51).default(0),
};
export const listWorksInputSchema = z.strictObject(pageInput);
export const listChaptersInputSchema = z.strictObject({ workId: z.string().uuid(), ...pageInput });
export const getChapterInputSchema = z.strictObject({
  workId: z.string().uuid(),
  chapterId: z.string().uuid(),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 50000).default(0),
  maxChars: z.number().int().min(1).max(50000).default(20000),
});

const workRow = z.object({
  id: z.string().uuid(), title: z.string(), synopsis: z.string().nullable(),
  cover_image_url: z.string().nullable(), genre: z.string().nullable(), created_at: z.string(),
});
const chapterRow = z.object({
  id: z.string().uuid(), work_id: z.string().uuid(), title: z.string(), order_index: z.number().int(),
  is_published: z.boolean(), price_tier: z.number().nullable(),
  published_at: z.string().nullable(), updated_at: z.string(),
});

export interface McpWorkDto {
  id: string; title: string; synopsis: string | null; coverImageUrl: string | null;
  genre: string | null; createdAt: string;
}
export interface McpChapterDto {
  id: string; workId: string; title: string; orderIndex: number; isPublished: boolean;
  priceTier: number | null; publishedAt: string | null; updatedAt: string;
}
export interface McpChapterContentDto {
  id: string; workId: string; title: string; content: string; offset: number; maxChars: number;
  totalChars: number; nextOffset: number | null; truncated: boolean;
}

function page<T>(rows: T[], offset: number, limit: number): McpPage<T> {
  return { items: rows.slice(0, limit), offset, limit, nextOffset: rows.length > limit ? offset + limit : null };
}

/** Unlike getWork/listChapters, never swallow errors during an ownership decision. */
async function requireOwnedWork(db: SupabaseClient, userId: string, workId: string): Promise<void> {
  const { data, error } = await db.from('works').select('id, owner_id')
    .eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (data === null) throw new McpToolError('missing');
  if (!data || data.id !== workId || data.owner_id !== userId) throw new Error('Invalid ownership result');
}

/** Only exports registration; the /mcp route wires these tools in plan 13-05. */
export function registerWorkTools(server: McpToolRegistrar): void {
  server.registerTool('list_works', {
    title: '내 작품 목록',
    description: '연결된 작가 본인의 작품을 최신 생성순으로 조회합니다. offset으로 다음 목록을 조회합니다.',
    inputSchema: listWorksInputSchema,
    annotations: MCP_READ_ANNOTATIONS,
  }, withMcpReadTool(listWorksInputSchema, async ({ offset, limit }, { db, userId }): Promise<McpPage<McpWorkDto>> => {
    // Existing listWorks cannot express range or a stable id tie-breaker. Keep
    // its owner/deletion predicates and explicit projection, but paginate in DB.
    const { data, error } = await db.from('works')
      .select('id, title, synopsis, cover_image_url, genre, created_at')
      .eq('owner_id', userId).is('deleted_at', null)
      .order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(offset, offset + limit);
    if (error) throw error;
    const items = z.array(workRow).parse(data).map((row): McpWorkDto => ({
      id: row.id, title: row.title, synopsis: row.synopsis, coverImageUrl: row.cover_image_url,
      genre: row.genre, createdAt: row.created_at,
    }));
    return page(items, offset, limit);
  }));

  server.registerTool('list_chapters', {
    title: '내 작품의 회차 목록',
    description: '본인 작품의 회차를 회차 순서대로 조회합니다. 초안·미발행·유료·잠금 회차를 모두 포함합니다.',
    inputSchema: listChaptersInputSchema,
    annotations: MCP_READ_ANNOTATIONS,
  }, withMcpReadTool(listChaptersInputSchema, async ({ workId, offset, limit }, { db, userId }): Promise<McpPage<McpChapterDto>> => {
    await requireOwnedWork(db, userId, workId);
    const { data, error } = await db.from('chapters')
      .select('id, work_id, title, order_index, is_published, price_tier, published_at, updated_at')
      .eq('work_id', workId).is('deleted_at', null)
      .order('order_index', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + limit);
    if (error) throw error;
    const items = z.array(chapterRow).parse(data).map((row): McpChapterDto => {
      if (row.work_id !== workId) throw new Error('Invalid chapter membership');
      return {
        id: row.id, workId: row.work_id, title: row.title, orderIndex: row.order_index,
        isPublished: row.is_published, priceTier: row.price_tier,
        publishedAt: row.published_at, updatedAt: row.updated_at,
      };
    });
    return page(items, offset, limit);
  }));

  server.registerTool('get_chapter', {
    title: '내 회차 본문 읽기',
    description: '본인 작품 회차의 평문을 상태와 무관하게 읽습니다. offset과 maxChars로 나눠 읽을 수 있습니다.',
    inputSchema: getChapterInputSchema,
    annotations: MCP_READ_ANNOTATIONS,
  }, withMcpReadTool(getChapterInputSchema, async ({ workId, chapterId, offset, maxChars }, { db, userId }): Promise<McpChapterContentDto> => {
    await requireOwnedWork(db, userId, workId);
    const { data: chapter, error } = await db.from('chapters').select('id, work_id, title')
      .eq('id', chapterId).eq('work_id', workId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (chapter === null) throw new McpToolError('missing');
    const metadata = z.object({ id: z.literal(chapterId), work_id: z.literal(workId), title: z.string() }).parse(chapter);

    const { data: content, error: rpcError } = await db.rpc('mcp_read_owned_chapter_content', { p_chapter_id: chapterId });
    if (rpcError) throw rpcError;
    if (content === null) throw new McpToolError('missing');
    if (typeof content !== 'string') throw new Error('Invalid chapter body result');
    // Offsets and lengths are JavaScript UTF-16 code units, matching slice(), but a page never
    // splits a surrogate pair: a start inside a pair backs up one unit and an end inside a pair
    // moves to the pair boundary (growing by one when maxChars cannot hold the pair at all).
    const isHigh = (i: number) => { const c = content.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff; };
    const isLow = (i: number) => { const c = content.charCodeAt(i); return c >= 0xdc00 && c <= 0xdfff; };
    let start = offset;
    if (start > 0 && start < content.length && isLow(start) && isHigh(start - 1)) start -= 1;
    let end = Math.min(start + maxChars, content.length);
    if (end > start && end < content.length && isHigh(end - 1) && isLow(end)) {
      end = end - 1 > start ? end - 1 : end + 1;
    }
    const text = content.slice(start, end);
    const nextOffset = end < content.length ? end : null;
    return {
      id: metadata.id, workId: metadata.work_id, title: metadata.title, content: text,
      offset: start, maxChars, totalChars: content.length, nextOffset, truncated: nextOffset !== null,
    };
  }));
}
