import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { withAdminAction, type AdminAuthDeps } from '@/lib/admin/auth';
import {
  MODERATION_ACTIONS,
  OPERATIVE_MODERATION_ACTIONS,
  REVIEW_OUTCOMES,
  type AdminErrorCode,
  type AdminResult,
} from '@/lib/admin/types';

/**
 * Admin moderation commands (ADMIN-02, ADMIN-03, ADMIN-04).
 *
 * Order in every export: fresh authorization -> Zod validation -> one RPC. The actor is
 * always the session-derived administrator; any actor field in the input is stripped by
 * the schema. The RPCs in 0007_admin_operations.sql do the whole change and its audit
 * row in one transaction, re-check membership, and reject stale or replayed-but-different
 * operations. These are plain server functions; app/admin/actions.ts wraps them as
 * Server Actions.
 */

export const REASON_REQUIRED_MESSAGE = '조치 사유를 입력해 주세요.';

const OPERATIVE = new Set<string>(OPERATIVE_MODERATION_ACTIONS);
const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

const moderationSchema = z
  .object({
    idempotencyKey: z.uuid(),
    workId: z.uuid(),
    chapterId: z.uuid().nullable(),
    reportIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate_report_ids' }),
    targetVersion: z.string().min(1).max(128),
    action: z.enum(MODERATION_ACTIONS),
    reason: optionalText(2000),
    publicReason: optionalText(500),
    endsAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .superRefine((value, ctx) => {
    if (OPERATIVE.has(value.action)) {
      if (!value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: REASON_REQUIRED_MESSAGE });
      if (!value.publicReason) {
        ctx.addIssue({ code: 'custom', path: ['publicReason'], message: REASON_REQUIRED_MESSAGE });
      }
    }
    if (value.action === 'suspend') {
      if (!value.endsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'expiry_required' });
      else if (Date.parse(value.endsAt) <= Date.now()) {
        ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'expiry_in_past' });
      }
    } else if (value.endsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'expiry_not_allowed' });
    }
  });

const unblindSchema = z.object({
  idempotencyKey: z.uuid(),
  workId: z.uuid(),
  chapterId: z.uuid().nullable(),
  targetVersion: z.string().min(1).max(128),
  reason: optionalText(2000).refine((v) => v !== null, { message: REASON_REQUIRED_MESSAGE }),
});

const reviewSchema = z.object({
  idempotencyKey: z.uuid(),
  requestId: z.uuid(),
  outcome: z.enum(REVIEW_OUTCOMES),
  targetVersion: z.string().min(1).max(128),
  reason: optionalText(2000).refine((v) => v !== null, { message: REASON_REQUIRED_MESSAGE }),
});

export type ModerateReportGroupInput = z.input<typeof moderationSchema>;
export type UnblindTargetInput = z.input<typeof unblindSchema>;
export type ResolveReviewRequestInput = z.input<typeof reviewSchema>;

type Failure = { ok: false; error: AdminErrorCode; fieldErrors?: Record<string, string> };

function validationFailure(error: z.ZodError): Failure {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const onlyReasons = error.issues.every((issue) => issue.message === REASON_REQUIRED_MESSAGE);
  return { ok: false, error: onlyReasons ? 'reason_required' : 'validation_failed', fieldErrors };
}

const RPC_ERRORS: [string, AdminErrorCode][] = [
  ['stale_target', 'stale_target'],
  ['idempotency_conflict', 'conflict'],
  ['reason_required', 'reason_required'],
  ['actor_not_admin', 'not_found'],
  ['target_not_found', 'not_found'],
  ['review_request_not_found', 'not_found'],
  ['profile_not_found', 'not_found'],
  ['report_target_mismatch', 'validation_failed'],
  ['self_sanction_forbidden', 'validation_failed'],
  ['invalid_sanction_expiry', 'validation_failed'],
  ['invalid_report_ids', 'validation_failed'],
  ['invalid_action', 'validation_failed'],
  ['invalid_arguments', 'validation_failed'],
];

/** Maps database failures to safe codes; raw messages never leave the server. */
function rpcFailure(error: { message?: string; code?: string }): Failure {
  const message = error.message ?? '';
  for (const [needle, code] of RPC_ERRORS) {
    if (message.includes(needle)) return { ok: false, error: code };
  }
  // Unique violation (concurrent same-key retry) or deadlock/serialization: safe to refresh.
  if (error.code === '23505' || error.code === '40P01' || error.code === '40001') {
    return { ok: false, error: 'conflict' };
  }
  return { ok: false, error: 'unavailable' };
}

async function callRpc(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<AdminResult<{ actionId: string }>> {
  try {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return rpcFailure(error as { message?: string; code?: string });
    if (typeof data !== 'string') return { ok: false, error: 'unavailable' };
    return { ok: true, data: { actionId: data } };
  } catch {
    return { ok: false, error: 'unavailable' };
  }
}

/** Resolve, dismiss, blind, warn or suspend exactly the reviewed reports of one target (D-18). */
export async function moderateReportGroup(
  input: ModerateReportGroupInput,
  deps?: AdminAuthDeps
): Promise<AdminResult<{ actionId: string }>> {
  return withAdminAction(async ({ actor, admin }) => {
    const parsed = moderationSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    return callRpc(admin, 'moderate_report_group', {
      p_actor_id: actor.userId,
      p_idempotency_key: v.idempotencyKey,
      p_work_id: v.workId,
      p_chapter_id: v.chapterId,
      p_report_ids: v.reportIds,
      p_expected_version: v.targetVersion,
      p_action: v.action,
      p_reason: v.reason,
      p_public_reason: v.publicReason,
      p_ends_at: v.action === 'suspend' ? v.endsAt : null,
    });
  }, deps);
}

/** D-15: only an administrator clears a blind; closes an open review request on the target. */
export async function unblindTarget(
  input: UnblindTargetInput,
  deps?: AdminAuthDeps
): Promise<AdminResult<{ actionId: string }>> {
  return withAdminAction(async ({ actor, admin }) => {
    const parsed = unblindSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    return callRpc(admin, 'unblind_moderation_target', {
      p_actor_id: actor.userId,
      p_idempotency_key: v.idempotencyKey,
      p_work_id: v.workId,
      p_chapter_id: v.chapterId,
      p_expected_version: v.targetVersion,
      p_reason: v.reason,
    });
  }, deps);
}

/** D-16: explicit terminal outcome for a writer re-review request. */
export async function resolveReviewRequest(
  input: ResolveReviewRequestInput,
  deps?: AdminAuthDeps
): Promise<AdminResult<{ actionId: string }>> {
  return withAdminAction(async ({ actor, admin }) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const v = parsed.data;
    return callRpc(admin, 'resolve_review_request', {
      p_actor_id: actor.userId,
      p_idempotency_key: v.idempotencyKey,
      p_request_id: v.requestId,
      p_outcome: v.outcome,
      p_expected_version: v.targetVersion,
      p_reason: v.reason,
    });
  }, deps);
}
