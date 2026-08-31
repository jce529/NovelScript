import type { SupabaseClient } from '@supabase/supabase-js';
import { createNode, type NodeMutationResult } from '@/lib/kb/actions';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/templates';

export interface MentionCandidate {
  id: string;
  name: string;
  category: KbCategory | 'custom' | 'template';
  scope: 'work' | 'account_template';
}

/** EDIT-01 + KB-04/D-09/D-10: work-scoped results (5 fixed categories + the
 * new 'custom' sentinel, RESEARCH.md Open Question 1) UNIONed with every file
 * node inside the caller's OWN account-shared space (any category, including
 * 'template' stub files — Open Question 2's literal reading of "not just
 * template"). D-10's one-way direction falls out structurally: the shared
 * query is scoped to `owner_id` only (never another owner's account), and
 * this function is only ever called for `workId`'s own editor — there is no
 * code path where another work's file nodes can enter either half. */
export async function searchMentionNodes(
  supabase: SupabaseClient,
  { ownerId, workId, query }: { ownerId: string; workId: string; query: string }
): Promise<MentionCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const [workResults, sharedResults] = await Promise.all([
    supabase
      .from('kb_nodes')
      .select('id, name, category')
      .eq('owner_id', ownerId)
      .eq('work_id', workId)
      .eq('scope', 'work')
      .eq('node_type', 'file')
      .in('category', [...KB_CATEGORIES, 'custom'])
      .ilike('name', `%${trimmed}%`)
      .is('deleted_at', null)
      .order('name')
      .limit(20),
    supabase
      .from('kb_nodes')
      .select('id, name, category')
      .eq('owner_id', ownerId)
      .eq('scope', 'account_template')
      .eq('node_type', 'file')
      .ilike('name', `%${trimmed}%`)
      .is('deleted_at', null)
      .order('name')
      .limit(20),
  ]);

  if (workResults.error) throw new Error(workResults.error.message);
  if (sharedResults.error) throw new Error(sharedResults.error.message);

  return [
    ...(workResults.data ?? []).map((row) => ({ ...row, scope: 'work' as const })),
    ...(sharedResults.data ?? []).map((row) => ({ ...row, scope: 'account_template' as const })),
  ] as MentionCandidate[];
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
  category: KbCategory | 'custom' | 'template';
  content: string;
}

/** EDIT-02/Plan 04-04, extended for KB-04: resolves FULL content for a mix of
 * work-scoped and account-shared node ids in one call. The original version
 * filtered by `.eq('work_id', workId)` only, which silently dropped
 * account-shared mentions (work_id IS NULL for those rows) — a mentioned
 * shared doc would search-match (Task 1's searchMentionNodes) but then
 * vanish from the actual AI prompt. Fixed with the same two-query-then-merge
 * shape searchMentionNodes already uses (Supabase-js has no cross-predicate
 * UNION) — both queries are owner_id-scoped, so D-10's one-way guarantee is
 * preserved (never another owner's rows, work or shared). Per 02-CONTEXT.md
 * D-13, wiki-link `[[ ]]` syntax inside `content` is inert plain text —
 * returned verbatim, never resolved/stripped here or by any caller. */
export async function getMentionedNodesContent(
  supabase: SupabaseClient,
  { ownerId, workId, nodeIds }: { ownerId: string; workId: string; nodeIds: string[] }
): Promise<MentionedDoc[]> {
  if (nodeIds.length === 0) return [];

  const [workRows, sharedRows] = await Promise.all([
    supabase.from('kb_nodes').select('id, name, category, content')
      .eq('owner_id', ownerId).eq('work_id', workId).in('id', nodeIds).is('deleted_at', null),
    supabase.from('kb_nodes').select('id, name, category, content')
      .eq('owner_id', ownerId).eq('scope', 'account_template').in('id', nodeIds).is('deleted_at', null),
  ]);

  if (workRows.error) throw new Error(workRows.error.message);
  if (sharedRows.error) throw new Error(sharedRows.error.message);

  return [...(workRows.data ?? []), ...(sharedRows.data ?? [])].map((row) => ({
    id: row.id, name: row.name, category: row.category as KbCategory | 'custom' | 'template', content: row.content ?? '',
  }));
}
