import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkWriteAccess, type WriteDenialCode } from '../auth/write-access';
import type { PublicChapter, PublicChapterListItem } from '../chapters/actions';

/*
 * 07-06 user-facing moderation flows (D-07, D-09, D-13..D-16).
 *
 * Every function takes a session client plus the session-derived `userId` (Server Actions pass
 * `auth.getUser()`; nothing here trusts a client-supplied identity). All reads/writes go through
 * the recipient/owner RLS policies from 0006, so the DB is the final authority:
 * - warnings: `user_sanctions_read_own` + `acknowledge_warning(p_sanction_id)` (auth.uid() only)
 * - review requests: `moderation_review_requests_insert_own` (owner + blinded target) and the
 *   0008 restrictive write policy (suspension). Partial unique indexes enforce one open request.
 * Nothing in this module can clear `admin_blinded`; only admin RPCs do (D-15).
 *
 * The pure reader-lock helpers at the bottom are shared by the viewer, TOC and tests.
 */

const UUID = z.string().uuid();

// ---------------------------------------------------------------------------
// Copy (07-UI-SPEC contract)
// ---------------------------------------------------------------------------
export const NOTICE_TITLE = '운영 알림';
export const NOTICE_ACK_LABEL = '확인했습니다';
export const NOTICE_LOAD_ERROR = '운영 알림을 불러오지 못했어요. 다시 시도해주세요.';
export const NOTICE_ACK_ERROR = '확인 처리를 하지 못했어요. 다시 시도해주세요.';
export const SUSPENSION_DENIAL_COPY = '계정 정지로 이 작업을 수행할 수 없습니다.';
export const REVIEW_BADGE = '검토 중';
export const REVIEW_REQUEST_LABEL = '재검토 요청';
export const REVIEW_REQUESTED_LABEL = '검토 요청됨';
export const REVIEW_ERRORS = {
  not_found: '재검토를 요청할 수 있는 콘텐츠가 아니에요.',
  not_blinded: '검토 중인 콘텐츠가 아니라 재검토를 요청할 필요가 없어요.',
  duplicate: '이미 재검토 요청이 접수됐어요. 운영자 검토를 기다려주세요.',
  validation_failed: '요청 내용을 확인해주세요. (2000자 이하)',
  unavailable: '재검토 요청을 보내지 못했어요. 잠시 후 다시 시도해주세요.',
} as const;
export const BLINDED_VIEWER_TITLE = '검토 중인 콘텐츠입니다';
export const BLINDED_ENTITLED_NOTE = '이미 소장한 회차예요. 검토가 끝나면 다시 결제하지 않고 바로 볼 수 있어요.';
export const BLINDED_WORK_NOTE = '운영 정책에 따라 이 작품은 지금 볼 수 없어요.';

// ---------------------------------------------------------------------------
// Warning notices (D-09)
// ---------------------------------------------------------------------------
export interface WarningNotice {
  id: string;
  publicReason: string;
  createdAt: string;
}

export interface SuspensionNotice {
  permanent: boolean;
  sanctionedUntil: string | null;
}

export type AccountNoticesResult =
  | { ok: true; warnings: WarningNotice[]; suspension: SuspensionNotice | null }
  | { ok: false; code: 'unauthenticated' | 'unavailable' };

/** Outstanding (unacknowledged) warnings for the session user only, oldest first. */
export async function getAccountNotices(
  supabase: SupabaseClient, { userId }: { userId: string },
): Promise<AccountNoticesResult> {
  if (!UUID.safeParse(userId).success) return { ok: false, code: 'unauthenticated' };
  try {
    const [sanctions, acks, access] = await Promise.all([
      supabase.from('user_sanctions')
        .select('id, kind, public_reason, created_at')
        .eq('user_id', userId).eq('kind', 'warning')
        .order('created_at', { ascending: true }),
      supabase.from('warning_acknowledgements').select('sanction_id').eq('user_id', userId),
      checkWriteAccess(supabase, userId),
    ]);
    if (sanctions.error || acks.error) return { ok: false, code: 'unavailable' };
    const acknowledged = new Set(
      ((acks.data ?? []) as { sanction_id: string }[]).map((row) => row.sanction_id),
    );
    const warnings = ((sanctions.data ?? []) as Record<string, unknown>[])
      .filter((row) => row.kind === 'warning' && typeof row.id === 'string' && !acknowledged.has(row.id))
      .map((row) => ({
        id: row.id as string,
        publicReason: typeof row.public_reason === 'string' ? row.public_reason : '',
        createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      }));
    const suspension = !access.ok && access.code === 'write_suspended'
      ? { permanent: access.permanent, sanctionedUntil: access.sanctionedUntil }
      : null;
    return { ok: true, warnings, suspension };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

export type AcknowledgeResult =
  | { ok: true }
  | { ok: false; code: 'unauthenticated' | 'not_found' | 'unavailable'; error: string };

/** Persists acknowledgement for this warning only. Allowed during suspension (account control). */
export async function acknowledgeWarning(
  supabase: SupabaseClient, { userId, sanctionId }: { userId: string; sanctionId: string },
): Promise<AcknowledgeResult> {
  if (!UUID.safeParse(userId).success) return { ok: false, code: 'unauthenticated', error: NOTICE_ACK_ERROR };
  if (!UUID.safeParse(sanctionId).success) return { ok: false, code: 'not_found', error: NOTICE_ACK_ERROR };
  try {
    const { data, error } = await supabase.rpc('acknowledge_warning', { p_sanction_id: sanctionId });
    if (error) {
      if (error.message?.includes('warning_not_found')) return { ok: false, code: 'not_found', error: NOTICE_ACK_ERROR };
      if (error.message?.includes('authentication_required')) return { ok: false, code: 'unauthenticated', error: NOTICE_ACK_ERROR };
      return { ok: false, code: 'unavailable', error: NOTICE_ACK_ERROR };
    }
    return data === true ? { ok: true } : { ok: false, code: 'unavailable', error: NOTICE_ACK_ERROR };
  } catch {
    return { ok: false, code: 'unavailable', error: NOTICE_ACK_ERROR };
  }
}

// ---------------------------------------------------------------------------
// Writer re-review (D-15/D-16)
// ---------------------------------------------------------------------------
export type ReviewRequestStatus = 'open' | 'maintained' | 'unblinded';

export interface ReviewTargetState {
  blinded: boolean;
  blindReason: string | null;
  /** Latest request for exactly this target (work-level when chapterId is null). */
  latestRequest: { id: string; status: ReviewRequestStatus; createdAt: string; resolvedAt: string | null } | null;
}

export type ReviewTargetResult =
  | { ok: true; state: ReviewTargetState }
  | { ok: false; code: 'not_found' | 'unavailable' };

const targetSchema = z.object({ userId: UUID, workId: UUID, chapterId: UUID.nullable() });

async function loadOwnedTarget(
  supabase: SupabaseClient, input: { userId: string; workId: string; chapterId: string | null },
): Promise<{ ok: true; blinded: boolean; blindReason: string | null } | { ok: false; code: 'not_found' | 'unavailable' }> {
  const { data: work, error } = await supabase.from('works')
    .select('id, owner_id, admin_blinded, admin_blind_reason')
    .eq('id', input.workId).eq('owner_id', input.userId).is('deleted_at', null)
    .maybeSingle();
  if (error) return { ok: false, code: 'unavailable' };
  if (!work || work.owner_id !== input.userId) return { ok: false, code: 'not_found' };
  if (input.chapterId === null) {
    return { ok: true, blinded: work.admin_blinded === true, blindReason: work.admin_blinded ? work.admin_blind_reason ?? null : null };
  }
  const { data: chapter, error: chapterError } = await supabase.from('chapters')
    .select('id, work_id, admin_blinded, admin_blind_reason')
    .eq('id', input.chapterId).eq('work_id', input.workId).is('deleted_at', null)
    .maybeSingle();
  if (chapterError) return { ok: false, code: 'unavailable' };
  if (!chapter || chapter.work_id !== input.workId) return { ok: false, code: 'not_found' };
  return { ok: true, blinded: chapter.admin_blinded === true, blindReason: chapter.admin_blinded ? chapter.admin_blind_reason ?? null : null };
}

export async function getReviewTargetState(
  supabase: SupabaseClient, input: { userId: string; workId: string; chapterId: string | null },
): Promise<ReviewTargetResult> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'not_found' };
  try {
    const target = await loadOwnedTarget(supabase, parsed.data);
    if (!target.ok) return target;
    let query = supabase.from('moderation_review_requests')
      .select('id, status, created_at, resolved_at')
      .eq('work_id', parsed.data.workId);
    query = parsed.data.chapterId === null ? query.is('chapter_id', null) : query.eq('chapter_id', parsed.data.chapterId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
    if (error) return { ok: false, code: 'unavailable' };
    const row = ((data ?? []) as Record<string, unknown>[])[0];
    const status = row && ['open', 'maintained', 'unblinded'].includes(row.status as string)
      ? row.status as ReviewRequestStatus : null;
    return {
      ok: true,
      state: {
        blinded: target.blinded,
        blindReason: target.blindReason,
        latestRequest: row && status ? {
          id: String(row.id), status, createdAt: String(row.created_at ?? ''),
          resolvedAt: typeof row.resolved_at === 'string' ? row.resolved_at : null,
        } : null,
      },
    };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}

export type ReviewRequestErrorCode = keyof typeof REVIEW_ERRORS | WriteDenialCode;
export type ReviewRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; code: ReviewRequestErrorCode; error: string };

const requestSchema = targetSchema.extend({
  message: z.string().trim().max(2000).nullable().optional(),
});

function reviewError(code: keyof typeof REVIEW_ERRORS): ReviewRequestResult {
  return { ok: false, code, error: REVIEW_ERRORS[code] };
}

/** Creates one open re-review request for an owned, currently blinded work or chapter. */
export async function requestReview(
  supabase: SupabaseClient,
  input: { userId: string; workId: string; chapterId: string | null; message?: string | null },
): Promise<ReviewRequestResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return UUID.safeParse(input.userId).success && UUID.safeParse(input.workId).success
      ? reviewError('validation_failed') : reviewError('not_found');
  }
  // D-07 + 07-03 carry-forward: the guard runs before any DB call.
  const access = await checkWriteAccess(supabase, parsed.data.userId);
  if (!access.ok) {
    return {
      ok: false, code: access.code,
      error: access.code === 'write_suspended' ? SUSPENSION_DENIAL_COPY : access.error,
    };
  }
  try {
    const target = await loadOwnedTarget(supabase, parsed.data);
    if (!target.ok) return reviewError(target.code);
    if (!target.blinded) return reviewError('not_blinded');
    const message = parsed.data.message ? parsed.data.message : null;
    const { data, error } = await supabase.from('moderation_review_requests')
      .insert({
        requester_id: parsed.data.userId,
        work_id: parsed.data.workId,
        chapter_id: parsed.data.chapterId,
        message,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return reviewError('duplicate');
      // RLS refusal: target changed (unblinded/ownership) between the check and the insert.
      if (error.code === '42501') return reviewError('not_found');
      return reviewError('unavailable');
    }
    return { ok: true, requestId: String((data as { id: string }).id) };
  } catch {
    return reviewError('unavailable');
  }
}

// ---------------------------------------------------------------------------
// Reader lock model (D-13/D-14). Pure; used by viewer, TOC and tests.
// ---------------------------------------------------------------------------
export type ViewerLockModel =
  | { kind: 'content' }
  | { kind: 'blinded'; title: string; reason: string | null; entitledNote: string | null; showPurchase: false }
  | { kind: 'purchase'; priceTier: number | null; showPurchase: true }
  | { kind: 'unavailable'; showPurchase: false };

export function viewerLockModel(
  chapter: Pick<PublicChapter, 'accessState' | 'content' | 'entitled' | 'blindScope' | 'blindReason' | 'priceTier'>,
): ViewerLockModel {
  switch (chapter.accessState) {
    case 'readable':
      return chapter.content !== null ? { kind: 'content' } : { kind: 'unavailable', showPurchase: false };
    case 'blinded':
      return {
        kind: 'blinded', title: BLINDED_VIEWER_TITLE, reason: chapter.blindReason,
        entitledNote: chapter.entitled ? BLINDED_ENTITLED_NOTE : null, showPurchase: false,
      };
    case 'purchase_required':
      // An entitled reader is never asked to pay again; treat as unavailable (refresh).
      return chapter.entitled || chapter.priceTier === null
        ? { kind: 'unavailable', showPurchase: false }
        : { kind: 'purchase', priceTier: chapter.priceTier, showPurchase: true };
    default:
      return { kind: 'unavailable', showPurchase: false };
  }
}

export type TocRowBadge = 'review' | 'paid' | null;

/** D-14: blinded rows keep their number and show the review badge instead of the price lock. */
export function tocRowBadge(item: Pick<PublicChapterListItem, 'state' | 'blinded'>): TocRowBadge {
  if (item.blinded || item.state === 'blinded') return 'review';
  if (item.state === 'purchase_required') return 'paid';
  return null;
}
