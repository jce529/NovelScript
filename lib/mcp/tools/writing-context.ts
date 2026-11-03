import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getMentionedNodesContent } from '@/lib/ai/mentions';
import { getWorkSystemInstruction } from '@/lib/ai/work-instructions';
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from '@/lib/ai/regenerate-contract';
import {
  assembleUserContent, composeSystemInstruction, DEFAULT_STYLE_PRESET,
  PRESET_INSTRUCTIONS, STYLE_PRESETS, type PresetLevel, type StylePresetId,
} from '@/lib/ai/prompt';
import { GENRES } from '@/lib/works/genres';
import {
  MCP_READ_ANNOTATIONS, McpToolError, withMcpReadTool,
  type McpToolRegistrar,
} from '@/lib/mcp/tool-runtime';

const writingContextInputSchema = z.strictObject({
  workId: z.string().uuid().describe('집필할 작품의 ID (list_works 결과의 id).'),
  chapterId: z.string().uuid().describe('이어 쓸 기준 회차의 ID (list_chapters 결과의 id). 이 회차의 본문 전체가 앞선 본문으로 포함됩니다.'),
  nodeIds: z.array(z.string().uuid()).max(20)
    .describe('컨텍스트에 포함할 설정집 문서 ID 목록 (search_kb 결과의 id, 최대 20개, 빈 배열 가능). 폴더나 접근할 수 없는 ID는 포함되지 않고 manifest의 missingNodeIds로만 알려 줍니다.'),
  presetLevel: z.enum(Object.keys(PRESET_INSTRUCTIONS) as [PresetLevel, ...PresetLevel[]]).optional()
    .describe('앱의 AI 지시 프리셋(beginner, intermediate, freeform). 생략하면 앱 기본값 intermediate를 씁니다. 작가가 따로 요청한 경우에만 지정하세요.'),
  styleId: z.enum(Object.keys(STYLE_PRESETS) as [StylePresetId, ...StylePresetId[]]).optional()
    .describe('앱의 문체 프리셋 ID. 생략하면 앱 기본 문체를 씁니다. 작가가 문체를 지정한 경우에만 지정하세요.'),
  customInstruction: z.string().max(CUSTOM_INSTRUCTION_MAX_LENGTH).optional()
    .describe(`작가의 자유 지시. presetLevel이 freeform일 때만 적용되고 그 외에는 무시됩니다 (최대 ${CUSTOM_INSTRUCTION_MAX_LENGTH}자).`),
  includeAppResponseProtocol: z.boolean().optional()
    .describe('NovelScript 앱 내부 채팅 화면이 응답을 파싱하는 형식 지시([REPLY]/[DRAFT]/[DOCUMENT] 태그)를 포함할지 여부. 외부 AI 클라이언트에는 이 태그가 필요 없으므로 기본값은 false입니다. 특별한 이유가 없으면 생략하세요.'),
});

const documentSchema = z.object({
  id: z.string().uuid(), name: z.string(), category: z.string(),
  scope: z.enum(['work', 'account_template']),
});
const contentSchema = documentSchema.omit({ scope: true }).extend({ content: z.string().nullable() });
type DocumentMetadata = z.infer<typeof documentSchema>;
type Source = 'arg' | 'default' | 'stored';
function setting<T>(value: T, source: Source) { return { value, source }; }

const MAX_BUNDLE_CHARS = 100000;
// The common runtime intentionally accepts only 'missing' exceptions. Return
// this local, data-free marker through it, then promote only that marker to a
// static size error. All DB/parse/auth errors retain the runtime's sanitization.
const SIZE_ERROR = { error: 'writing_context_too_large' } as const;
const SIZE_ERROR_TEXT = JSON.stringify(SIZE_ERROR);
const SIZE_ERROR_MESSAGE = '집필 컨텍스트가 100,000자 한도를 초과했습니다. 선택한 문서를 줄여주세요.';

async function documentMetadata(db: SupabaseClient, ownerId: string, workId: string, nodeIds: string[]) {
  const found = new Map<string, DocumentMetadata>();
  if (!nodeIds.length) return found;
  for (const scope of ['work', 'account_template'] as const) {
    let request = db.from('kb_nodes').select('id, name, category, scope')
      .eq('owner_id', ownerId).eq('scope', scope).eq('node_type', 'file')
      .is('deleted_at', null).in('id', nodeIds);
    if (scope === 'work') request = request.eq('work_id', workId);
    const { data, error } = await request;
    if (error) throw error;
    for (const row of z.array(documentSchema.extend({ scope: z.literal(scope) })).parse(data)) {
      if (!nodeIds.includes(row.id) || found.has(row.id)) throw new Error('Invalid document membership');
      found.set(row.id, row);
    }
  }
  return found;
}

/** Bearer-only adapter for the unchanged mention helper. Bind every body query
 * to the prevalidated IDs AND their scopes; recheck owner/file/deletion so a
 * move/deletion/folder conversion between metadata and content cannot leak.
 * Validate lists before the helper can turn a null list into empty success.
 */
function mentionClient(db: SupabaseClient, ownerId: string, workId: string, metadata: Map<string, DocumentMetadata>): SupabaseClient {
  return {
    from(table: string) {
      if (table !== 'kb_nodes') throw new Error('Unexpected mention source');
      return {
        select(columns: string) {
          let query = db.from(table).select(columns)
            .eq('owner_id', ownerId).eq('node_type', 'file').is('deleted_at', null);
          let scope: DocumentMetadata['scope'] | undefined;
          const chain = {
            eq(key: string, value: unknown) {
              query = query.eq(key, value);
              if (key === 'work_id' || key === 'scope') {
                scope = key === 'work_id' ? 'work' : z.literal('account_template').parse(value);
                if (key === 'work_id' && value !== workId) throw new Error('Invalid work scope');
                query = query.eq('scope', scope).in('id', [...metadata.values()].filter((row) => row.scope === scope).map((row) => row.id));
              }
              return chain;
            },
            is(key: string, value: null) { query = query.is(key, value); return chain; },
            in(key: string, values: string[]) { query = query.in(key, values); return chain; },
            then(resolve: (value: { data: z.infer<typeof contentSchema>[]; error: null }) => unknown, reject: (reason: unknown) => unknown) {
              return Promise.resolve(query).then(({ data, error }) => {
                if (error) throw error;
                if (!scope) throw new Error('Missing mention scope');
                const rows = z.array(contentSchema).parse(data);
                if (rows.some((row) => metadata.get(row.id)?.scope !== scope)) throw new Error('Invalid mention result');
                return { data: rows, error: null };
              }).then(resolve, reject);
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
}

/** Registration only; route integration belongs to plan 13-05. */
export function registerWritingContextTools(server: McpToolRegistrar): void {
  const read = withMcpReadTool(writingContextInputSchema, async (input, { db, userId }) => {
    const { workId, chapterId } = input;
    const { data: workData, error: workError } = await db.from('works').select('id, owner_id, title, genre')
      .eq('id', workId).eq('owner_id', userId).is('deleted_at', null).maybeSingle();
    if (workError) throw workError;
    if (workData === null) throw new McpToolError('missing');
    const work = z.object({ id: z.literal(workId), owner_id: z.literal(userId), title: z.string(), genre: z.string().nullable() }).parse(workData);

    const { data: chapterData, error: chapterError } = await db.from('chapters').select('id, work_id, title')
      .eq('id', chapterId).eq('work_id', workId).is('deleted_at', null).maybeSingle();
    if (chapterError) throw chapterError;
    if (chapterData === null) throw new McpToolError('missing');
    const chapter = z.object({ id: z.literal(chapterId), work_id: z.literal(workId), title: z.string() }).parse(chapterData);
    const { data: body, error: bodyError } = await db.rpc('mcp_read_owned_chapter_content', { p_chapter_id: chapterId });
    if (bodyError) throw bodyError;
    if (body === null) throw new McpToolError('missing');
    const precedingText = z.string().parse(body);

    const instruction = await getWorkSystemInstruction(db, { ownerId: userId, workId });
    if (!instruction.ok) throw new Error('Cannot load work instruction');
    const nodeIds = [...new Set(input.nodeIds)];
    const metadata = await documentMetadata(db, userId, workId, nodeIds);
    const allowedIds = nodeIds.filter((id) => metadata.has(id));
    const docs = z.array(contentSchema.extend({ content: z.string() })).parse(await getMentionedNodesContent(
      mentionClient(db, userId, workId, metadata), { ownerId: userId, workId, nodeIds: allowedIds },
    ));
    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    if (byId.size !== docs.length || docs.some((doc) => !metadata.has(doc.id))) throw new Error('Invalid document result');
    const mentionedDocs = nodeIds.flatMap((id) => { const doc = byId.get(id); return doc ? [doc] : []; });

    const presetLevel = input.presetLevel ?? 'intermediate';
    const styleId = input.styleId ?? DEFAULT_STYLE_PRESET;
    const genre = work.genre ?? GENRES[0];
    const includeAppResponseProtocol = input.includeAppResponseProtocol ?? false;
    const customInstruction = presetLevel === 'freeform' ? input.customInstruction?.trim() || null : null;
    const workSystemInstruction = presetLevel === 'beginner' ? null : instruction.instruction.trim() || null;
    const bundle = {
      systemInstruction: composeSystemInstruction({ presetLevel, styleId, genre, customInstruction,
        workSystemInstruction: instruction.instruction, includeAppResponseProtocol }),
      userContext: assembleUserContent({ mentionedDocs, precedingText, chatHistory: [], includeAppResponseProtocol }),
      manifest: {
        work: { id: work.id, title: work.title },
        chapter: { id: chapter.id, workId: chapter.work_id, title: chapter.title },
        includedDocuments: mentionedDocs.map((doc) => metadata.get(doc.id)!),
        missingNodeIds: nodeIds.filter((id) => !byId.has(id)),
        settings: {
          presetLevel: setting(presetLevel, input.presetLevel === undefined ? 'default' : 'arg'),
          styleId: setting(styleId, input.styleId === undefined ? 'default' : 'arg'),
          genre: setting(genre, work.genre === null ? 'default' : 'stored'),
          customInstruction: setting(customInstruction, customInstruction ? 'arg' : 'default'),
          includeAppResponseProtocol: setting(includeAppResponseProtocol, input.includeAppResponseProtocol === undefined ? 'default' : 'arg'),
          workSystemInstruction: { value: workSystemInstruction, applied: workSystemInstruction !== null, source: 'stored' as const },
        },
        // Whole serialized response, including metadata, escaping and this count.
        // Start at the limit so the digit-width boundary uses the larger
        // fixed point (99,999/100,000 can otherwise both be self-consistent).
        totalChars: MAX_BUNDLE_CHARS,
      },
    };
    let measured = JSON.stringify(bundle).length;
    while (bundle.manifest.totalChars !== measured) {
      bundle.manifest.totalChars = measured;
      measured = JSON.stringify(bundle).length;
    }
    return measured > MAX_BUNDLE_CHARS ? SIZE_ERROR : bundle;
  });

  server.registerTool('get_writing_context', {
    title: '내 집필 컨텍스트 묶음 읽기',
    description: '작품·회차와 명시한 설정 문서를 앱 조립 순서로 반환합니다. 전체 UTF-16 100,000자 한도를 넘으면 오류를 반환합니다.',
    inputSchema: writingContextInputSchema, annotations: MCP_READ_ANNOTATIONS,
  }, async (input, ctx) => {
    const result = await read(input, ctx);
    if (!result.isError && result.content[0]?.text === SIZE_ERROR_TEXT) {
      return { isError: true, content: [{ type: 'text', text: SIZE_ERROR_MESSAGE }] };
    }
    return result;
  });
}
