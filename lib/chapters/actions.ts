import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PRICE_TIERS = [10, 30, 50, 100] as const;

const ERROR_INVALID_FOLDER = '선택한 폴더를 찾을 수 없어요. 새로고침 후 다시 시도해주세요.';

const createChapterSchema = z.object({
  ownerId: z.string().uuid(),
  workId: z.string().uuid(),
  title: z.string().trim().min(1, '회차 제목을 입력해주세요.'),
  folderId: z.string().uuid().nullable().optional(),
});

export interface ChapterMutationResult {
  ok: boolean;
  error?: string;
  chapterId?: string;
}

async function assertWorkOwnership(supabase: SupabaseClient, { ownerId, workId }: { ownerId: string; workId: string }) {
  const { data } = await supabase.from('works').select('id').eq('id', workId).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  return Boolean(data);
}

/** D-05: a chapter's folder_id, when set, must reference a real 회차-category
 * kb_nodes folder belonging to the SAME work — Postgres CHECK constraints
 * can't reference another table's row, so this is enforced here
 * (RESEARCH.md §3), exactly mirroring assertWorkOwnership's shape. */
async function assertChapterFolder(
  supabase: SupabaseClient,
  { workId, folderId }: { workId: string; folderId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('kb_nodes')
    .select('id')
    .eq('id', folderId)
    .eq('work_id', workId)
    .eq('category', '회차')
    .eq('node_type', 'folder')
    .is('deleted_at', null)
    .maybeSingle();
  return Boolean(data);
}

/** CONT-01: default order = current max + 1 for this work (or 0 if first). */
export async function createChapter(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string; title: string; folderId?: string | null }
): Promise<ChapterMutationResult> {
  const parsed = createChapterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (!(await assertWorkOwnership(supabase, input))) return { ok: false, error: '작품을 찾을 수 없어요.' };

  const folderId = parsed.data.folderId ?? null;
  if (folderId && !(await assertChapterFolder(supabase, { workId: input.workId, folderId }))) {
    return { ok: false, error: ERROR_INVALID_FOLDER };
  }

  const { data: maxRow } = await supabase
    .from('chapters')
    .select('order_index')
    .eq('work_id', input.workId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = maxRow ? maxRow.order_index + 1 : 0;

  const { data, error } = await supabase
    .from('chapters')
    .insert({ work_id: input.workId, title: parsed.data.title, order_index: nextOrder, folder_id: folderId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, chapterId: data.id };
}

async function findOwnedChapter(supabase: SupabaseClient, { ownerId, chapterId }: { ownerId: string; chapterId: string }) {
  const { data } = await supabase
    .from('chapters')
    .select('id, work_id, works!inner(owner_id)')
    .eq('id', chapterId)
    .eq('works.owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  return data;
}

/** D-19: plain-text content, no rendering. D-21: works identically whether the
 * chapter is currently published or not — no unpublish-first requirement. */
export async function saveChapterContent(
  supabase: SupabaseClient,
  { ownerId, chapterId, content }: { ownerId: string; chapterId: string; content: string }
): Promise<ChapterMutationResult> {
  if (!(await findOwnedChapter(supabase, { ownerId, chapterId }))) return { ok: false, error: '회차를 찾을 수 없어요.' };
  const { error } = await supabase.from('chapters').update({ content, updated_at: new Date().toISOString() }).eq('id', chapterId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, chapterId };
}

const publishSchema = z.object({
  priceTier: z.union([z.literal(10), z.literal(30), z.literal(50), z.literal(100), z.null()]),
});

/** CONT-02: free/paid toggle; paid price is always one of PRICE_TIERS, never freeform. */
export async function publishChapter(
  supabase: SupabaseClient,
  input: { ownerId: string; chapterId: string; priceTier: number | null }
): Promise<ChapterMutationResult> {
  const parsed = publishSchema.safeParse({ priceTier: input.priceTier });
  if (!parsed.success) return { ok: false, error: '가격은 10/30/50/100 토큰 중에서 선택해주세요.' };
  if (!(await findOwnedChapter(supabase, input))) return { ok: false, error: '회차를 찾을 수 없어요.' };

  const { error } = await supabase
    .from('chapters')
    .update({ is_published: true, price_tier: parsed.data.priceTier, published_at: new Date().toISOString() })
    .eq('id', input.chapterId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, chapterId: input.chapterId };
}

/** D-22: distinct, explicit action. Never touches `content`. */
export async function unpublishChapter(
  supabase: SupabaseClient,
  { ownerId, chapterId }: { ownerId: string; chapterId: string }
): Promise<ChapterMutationResult> {
  if (!(await findOwnedChapter(supabase, { ownerId, chapterId }))) return { ok: false, error: '회차를 찾을 수 없어요.' };
  const { error } = await supabase
    .from('chapters')
    .update({ is_published: false, unpublished_at: new Date().toISOString() })
    .eq('id', chapterId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, chapterId };
}

export async function listChapters(supabase: SupabaseClient, { ownerId, workId }: { ownerId: string; workId: string }) {
  if (!(await assertWorkOwnership(supabase, { ownerId, workId }))) return [];
  const { data, error } = await supabase
    .from('chapters')
    .select('id, title, order_index, is_published, price_tier, folder_id')
    .eq('work_id', workId)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** D-17: full-list resequence in one transaction. reorder_chapters (Plan 02-01) does
 * NOT check ownership itself — it trusts p_work_id — so ownership MUST be verified
 * here, before the RPC call, exactly mirroring the reasoning in 02-01's migration note. */
export async function reorderChapters(
  supabase: SupabaseClient,
  { ownerId, workId, orderedIds }: { ownerId: string; workId: string; orderedIds: string[] }
): Promise<ChapterMutationResult> {
  if (!(await assertWorkOwnership(supabase, { ownerId, workId }))) {
    return { ok: false, error: '작품을 찾을 수 없어요.' };
  }
  const { error } = await supabase.rpc('reorder_chapters', {
    p_work_id: workId,
    p_ordered_ids: orderedIds,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface PublicChapter {
  id: string;
  workId: string;
  title: string;
  orderIndex: number;
  priceTier: number | null;
  viewCount: number;
  content: string | null;
  locked: boolean;
}

/** READ-02/D-06: never select('*') here — paid chapters are locked in v1 (no unlock
 * mechanism until Phase 6), so `content` must be explicitly nulled server-side even
 * though the row itself is readable once published (RLS is row-level, not column-level). */
export async function getPublicChapter(
  supabase: SupabaseClient,
  { chapterId }: { chapterId: string }
): Promise<PublicChapter | null> {
  const { data } = await supabase
    .from('chapters')
    .select('id, work_id, title, order_index, price_tier, view_count, content')
    .eq('id', chapterId)
    .eq('is_published', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return null;
  const locked = data.price_tier !== null;
  return {
    id: data.id, workId: data.work_id, title: data.title, orderIndex: data.order_index,
    priceTier: data.price_tier, viewCount: data.view_count,
    content: locked ? null : data.content,
    locked,
  };
}

export interface PublicChapterListItem {
  id: string;
  title: string;
  orderIndex: number;
  priceTier: number | null;
  locked: boolean;
}

/** TOC (D-12) + 회차 tab (D-07) source. Never selects `content`. */
export async function listPublicChapters(
  supabase: SupabaseClient,
  { workId }: { workId: string }
): Promise<PublicChapterListItem[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, title, order_index, price_tier')
    .eq('work_id', workId)
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id, title: row.title, orderIndex: row.order_index,
    priceTier: row.price_tier, locked: row.price_tier !== null,
  }));
}
