import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PRICE_TIERS = [10, 30, 50, 100] as const;

const createChapterSchema = z.object({
  ownerId: z.string().uuid(),
  workId: z.string().uuid(),
  title: z.string().trim().min(1, '회차 제목을 입력해주세요.'),
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

/** CONT-01: default order = current max + 1 for this work (or 0 if first). */
export async function createChapter(
  supabase: SupabaseClient,
  input: { ownerId: string; workId: string; title: string }
): Promise<ChapterMutationResult> {
  const parsed = createChapterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (!(await assertWorkOwnership(supabase, input))) return { ok: false, error: '작품을 찾을 수 없어요.' };

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
    .insert({ work_id: input.workId, title: parsed.data.title, order_index: nextOrder })
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
    .select('id, title, order_index, is_published, price_tier')
    .eq('work_id', workId)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
