import type { SupabaseClient } from '@supabase/supabase-js';

/** User identity comes from the authenticated DB session, never a caller ID. */
export async function canView(supabase: SupabaseClient, workId: string, chapterId?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('can_view', {
    p_work_id: workId, p_chapter_id: chapterId ?? null,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Body RPC. Public readers need an unblinded free/entitled chapter; owners keep correction
 * access (studio) even while blinded. Viewer code must gate on `getChapterAccessState` first. */
export async function readChapterContent(supabase: SupabaseClient, chapterId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('read_chapter_content', { p_chapter_id: chapterId });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Public reader state (07-04, 0009_blind_access.sql):
 * - readable: body may be shown
 * - purchase_required: paid and not entitled (show purchase CTA)
 * - blinded: administrator blind on the chapter or its work; never a purchase prompt (D-13)
 * - unavailable: missing, unpublished, deleted, or a wrong work/chapter pair
 */
export const READER_ACCESS_STATES = ['readable', 'purchase_required', 'blinded', 'unavailable'] as const;
export type ReaderAccessState = (typeof READER_ACCESS_STATES)[number];

export interface ChapterAccessState {
  state: ReaderAccessState;
  /** Entitlement is reported separately from readability; a blind never clears it. */
  entitled: boolean;
  blindScope: 'work' | 'chapter' | null;
  /** Public (user-facing) blind reason only. Internal operator notes never reach this DTO. */
  blindReason: string | null;
}

export const BLINDED_CONTENT_MESSAGE = '검토 중인 콘텐츠입니다';
export const UNAVAILABLE_CONTENT_MESSAGE = '지금은 볼 수 없는 회차예요.';

const UNAVAILABLE: ChapterAccessState = { state: 'unavailable', entitled: false, blindScope: null, blindReason: null };

export async function getChapterAccessState(
  supabase: SupabaseClient, { workId, chapterId }: { workId: string; chapterId: string }
): Promise<ChapterAccessState> {
  const { data, error } = await supabase.rpc('get_chapter_access_state', {
    p_work_id: workId, p_chapter_id: chapterId,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') return UNAVAILABLE;
  const raw = data as Record<string, unknown>;
  // Fail closed on anything the database did not explicitly report.
  if (!READER_ACCESS_STATES.includes(raw.state as ReaderAccessState)) return UNAVAILABLE;
  const state = raw.state as ReaderAccessState;
  const blindScope = raw.blind_scope === 'work' || raw.blind_scope === 'chapter' ? raw.blind_scope : null;
  return {
    state,
    entitled: raw.entitled === true,
    blindScope: state === 'blinded' ? blindScope : null,
    blindReason: state === 'blinded' && typeof raw.blind_reason === 'string' ? raw.blind_reason : null,
  };
}
