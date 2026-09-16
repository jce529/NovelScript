'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { checkWriteAccess } from '@/lib/auth/write-access';
import {
  acknowledgeWarning, getAccountNotices, getReviewTargetState, requestReview,
  NOTICE_ACK_ERROR, REVIEW_ERRORS, SUSPENSION_DENIAL_COPY,
  type AccountNoticesResult, type AcknowledgeResult, type ReviewRequestResult, type ReviewTargetResult,
} from './user-actions';

/*
 * Public Server Action endpoints for 07-06. Identity is always the session user; any id in the
 * arguments is only a target and is re-validated by ownership/recipient checks in user-actions.
 */

async function session() {
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getUser();
    return { supabase, userId: data.user?.id ?? null };
  } catch {
    return { supabase, userId: null };
  }
}

export async function getAccountNoticesAction(): Promise<AccountNoticesResult> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, code: 'unauthenticated' };
  return getAccountNotices(supabase, { userId });
}

export async function acknowledgeWarningAction(sanctionId: string): Promise<AcknowledgeResult> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, code: 'unauthenticated', error: NOTICE_ACK_ERROR };
  return acknowledgeWarning(supabase, { userId, sanctionId });
}

export interface ReviewPanelState {
  target: ReviewTargetResult;
  /** Null when writing is allowed; otherwise the denial copy shown next to the command. */
  writeDenied: string | null;
}

export async function getReviewPanelStateAction(workId: string, chapterId: string | null): Promise<ReviewPanelState> {
  const { supabase, userId } = await session();
  if (!userId) return { target: { ok: false, code: 'not_found' }, writeDenied: null };
  const [target, access] = await Promise.all([
    getReviewTargetState(supabase, { userId, workId, chapterId }),
    checkWriteAccess(supabase, userId),
  ]);
  const writeDenied = access.ok ? null
    : access.code === 'write_suspended' ? SUSPENSION_DENIAL_COPY : access.error;
  return { target, writeDenied };
}

export async function requestReviewAction(input: {
  workId: string; chapterId: string | null; message?: string | null;
}): Promise<ReviewRequestResult> {
  const { supabase, userId } = await session();
  if (!userId) return { ok: false, code: 'not_found', error: REVIEW_ERRORS.not_found };
  const result = await requestReview(supabase, {
    userId,
    workId: input?.workId,
    chapterId: input?.chapterId ?? null,
    message: input?.message ?? null,
  });
  if (result.ok) {
    revalidatePath(`/studio/${input.workId}`, 'layout');
    revalidatePath('/admin', 'layout');
  }
  return result;
}
