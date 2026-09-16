'use server';

import { revalidatePath } from 'next/cache';
import { moderateReportGroup, resolveReviewRequest, unblindTarget } from '@/lib/admin/actions';
import type { AdminResult, ModerationAction, ReviewOutcome } from '@/lib/admin/types';

/**
 * Admin Server Actions (ADMIN-02..04). Each is a public HTTP endpoint, so each one goes
 * through a lib/admin command that re-authorizes from the request session and fresh
 * membership before validating or writing (T-07-01). Inputs are rebuilt field by field:
 * any client-supplied actor or extra key is dropped here and again by the schema.
 * Paths are revalidated only after a successful write.
 */

export interface ModerateReportGroupFormInput {
  idempotencyKey: string;
  workId: string;
  chapterId: string | null;
  reportIds: string[];
  targetVersion: string;
  action: ModerationAction;
  reason?: string | null;
  publicReason?: string | null;
  endsAt?: string | null;
}

export interface UnblindTargetFormInput {
  idempotencyKey: string;
  workId: string;
  chapterId: string | null;
  targetVersion: string;
  reason: string;
}

export interface ResolveReviewRequestFormInput {
  idempotencyKey: string;
  requestId: string;
  outcome: ReviewOutcome;
  targetVersion: string;
  reason: string;
}

type ActionResult = AdminResult<{ actionId: string }>;

const asObject = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};

function revalidateModeration() {
  revalidatePath('/admin', 'layout');
  // Blind state changes reader TOC/viewer and studio badges; sanctions change write access.
  revalidatePath('/works/[workId]', 'layout');
  revalidatePath('/studio', 'layout');
}

export async function moderateReportGroupAction(input: ModerateReportGroupFormInput): Promise<ActionResult> {
  const raw = asObject(input);
  const result = await moderateReportGroup({
    idempotencyKey: raw.idempotencyKey as string,
    workId: raw.workId as string,
    chapterId: raw.chapterId as string | null,
    reportIds: raw.reportIds as string[],
    targetVersion: raw.targetVersion as string,
    action: raw.action as ModerationAction,
    reason: raw.reason as string | null | undefined,
    publicReason: raw.publicReason as string | null | undefined,
    endsAt: raw.endsAt as string | null | undefined,
  });
  if (result.ok) revalidateModeration();
  return result;
}

export async function unblindTargetAction(input: UnblindTargetFormInput): Promise<ActionResult> {
  const raw = asObject(input);
  const result = await unblindTarget({
    idempotencyKey: raw.idempotencyKey as string,
    workId: raw.workId as string,
    chapterId: raw.chapterId as string | null,
    targetVersion: raw.targetVersion as string,
    reason: raw.reason as string,
  });
  if (result.ok) revalidateModeration();
  return result;
}

export async function resolveReviewRequestAction(input: ResolveReviewRequestFormInput): Promise<ActionResult> {
  const raw = asObject(input);
  const result = await resolveReviewRequest({
    idempotencyKey: raw.idempotencyKey as string,
    requestId: raw.requestId as string,
    outcome: raw.outcome as ReviewOutcome,
    targetVersion: raw.targetVersion as string,
    reason: raw.reason as string,
  });
  if (result.ok) revalidateModeration();
  return result;
}
