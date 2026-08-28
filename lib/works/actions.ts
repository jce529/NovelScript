import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedTemplateFiles } from '@/lib/kb/templates';

export const GENRES = ['로맨스', '로맨스판타지', '판타지', '현대판타지', '무협', '미스터리/스릴러', '라이트노벨', '기타'] as const;

const createWorkSchema = z.object({
  ownerId: z.string().uuid(),
  title: z.string().trim().min(1, '작품 제목을 입력해주세요.'),
  synopsis: z.string().trim().optional().nullable(),
  coverImageUrl: z.string().trim().optional().nullable(),
  genre: z.enum(GENRES).optional().nullable(),
});

export interface CreateWorkResult {
  ok: boolean;
  workId?: string;
  error?: string;
}

/** D-01/D-02/D-03: explicit, separate creation flow; title-only required.
 * Seeds the work's 6 fixed folders via the create_work RPC, then seeds the
 * work-level template/ folder with 5 editable canonical templates (D-10). */
export async function createWork(
  supabase: SupabaseClient,
  input: { ownerId: string; title: string; synopsis?: string | null; coverImageUrl?: string | null; genre?: string | null }
): Promise<CreateWorkResult> {
  const parsed = createWorkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '작품 제목을 입력해주세요.' };
  }
  const { ownerId, title, synopsis, coverImageUrl, genre } = parsed.data;

  const { data: workId, error } = await supabase.rpc('create_work', {
    p_owner_id: ownerId,
    p_title: title,
    p_synopsis: synopsis ?? null,
    p_cover_image_url: coverImageUrl ?? null,
    p_genre: genre ?? null,
  });
  if (error || !workId) {
    return { ok: false, error: error?.message ?? '작품을 만들지 못했어요.' };
  }

  const { data: templateFolder } = await supabase
    .from('kb_nodes')
    .select('id')
    .eq('work_id', workId)
    .eq('category', 'template')
    .eq('node_type', 'folder')
    .is('deleted_at', null)
    .maybeSingle();

  if (templateFolder) {
    await seedTemplateFiles(supabase, {
      ownerId,
      workId,
      scope: 'work',
      templateRootId: templateFolder.id,
    });
  }

  return { ok: true, workId };
}

export async function listWorks(supabase: SupabaseClient, { ownerId }: { ownerId: string }) {
  const { data, error } = await supabase
    .from('works')
    .select('id, title, synopsis, cover_image_url, genre, created_at')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getWork(supabase: SupabaseClient, { ownerId, workId }: { ownerId: string; workId: string }) {
  const { data } = await supabase
    .from('works')
    .select('id, title, synopsis, cover_image_url, genre, owner_id')
    .eq('id', workId)
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  return data ?? null;
}
