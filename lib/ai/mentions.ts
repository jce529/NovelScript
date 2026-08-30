import type { SupabaseClient } from '@supabase/supabase-js';
import { createNode, type NodeMutationResult } from '@/lib/kb/actions';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/templates';

export interface MentionCandidate {
  id: string;
  name: string;
  category: KbCategory;
}

/** EDIT-01: search by name (ilike, partial match), work-scoped, file nodes only,
 * excludes the 'template' category (not a mentionable document). Returns `category`
 * so the UI can render the D-02 mention row's type icon/tag without a second query. */
export async function searchMentionNodes(
  supabase: SupabaseClient,
  { ownerId, workId, query }: { ownerId: string; workId: string; query: string }
): Promise<MentionCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from('kb_nodes')
    .select('id, name, category')
    .eq('owner_id', ownerId)
    .eq('work_id', workId)
    .eq('node_type', 'file')
    .in('category', KB_CATEGORIES)
    .ilike('name', `%${trimmed}%`)
    .is('deleted_at', null)
    .order('name')
    .limit(20);

  if (error) throw new Error(error.message);
  return (data ?? []) as MentionCandidate[];
}

/** D-04 quick-add: resolves the work's fixed category folder (one of the 6 folders
 * seeded by create_work in 0002_studio.sql), so the caller never needs to know the
 * folder id ahead of time. */
export async function resolveCategoryFolderId(
  supabase: SupabaseClient,
  { ownerId, workId, category }: { ownerId: string; workId: string; category: KbCategory }
): Promise<string | null> {
  const { data } = await supabase
    .from('kb_nodes')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('work_id', workId)
    .eq('category', category)
    .eq('node_type', 'folder')
    .is('deleted_at', null)
    .maybeSingle();
  return data?.id ?? null;
}

/** D-04: creates the new KB document on the spot and immediately makes it
 * mentionable — reuses lib/kb/actions.ts's createNode (template seeding, sibling-
 * name-collision handling) rather than duplicating any of that logic. */
export async function quickAddMentionNode(
  supabase: SupabaseClient,
  { ownerId, workId, category, name }: { ownerId: string; workId: string; category: KbCategory; name: string }
): Promise<NodeMutationResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: '문서 이름을 입력해주세요.' };

  const parentId = await resolveCategoryFolderId(supabase, { ownerId, workId, category });
  if (!parentId) return { ok: false, error: '카테고리 폴더를 찾을 수 없어요.' };

  return createNode(supabase, { ownerId, workId, parentId, category, nodeType: 'file', name: trimmed });
}

export interface MentionedDoc {
  id: string;
  name: string;
  category: KbCategory;
  content: string;
}

/** EDIT-02/Plan 04-04: resolves the FULL content of every currently-mentioned
 * document in one call, at generate-time. Per 02-CONTEXT.md D-13, wiki-link
 * `[[ ]]` syntax inside `content` is inert plain text — returned verbatim,
 * never resolved/stripped here or by any caller. */
export async function getMentionedNodesContent(
  supabase: SupabaseClient,
  { ownerId, workId, nodeIds }: { ownerId: string; workId: string; nodeIds: string[] }
): Promise<MentionedDoc[]> {
  if (nodeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('kb_nodes')
    .select('id, name, category, content')
    .eq('owner_id', ownerId)
    .eq('work_id', workId)
    .in('id', nodeIds)
    .is('deleted_at', null);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id, name: row.name, category: row.category as KbCategory, content: row.content ?? '',
  }));
}
