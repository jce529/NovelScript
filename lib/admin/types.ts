/**
 * Phase 7 moderation DTOs. camelCase shapes returned to Server Components and client
 * forms. Constant tuples mirror the CHECK constraints in
 * supabase/migrations/0006_admin_foundation.sql verbatim - keep them in sync.
 *
 * DTOs intentionally omit reporter identities and internal notes unless the type is
 * admin-only (named Admin*). Public/user-facing types carry only safe public reasons.
 */

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SANCTION_KINDS = ['warning', 'suspension', 'permanent_suspension', 'lift'] as const;
export type SanctionKind = (typeof SANCTION_KINDS)[number];

/** Effective cache value stored on profiles.sanction_kind. */
export const SANCTION_CACHE_KINDS = ['none', 'suspension', 'permanent_suspension'] as const;
export type SanctionCacheKind = (typeof SANCTION_CACHE_KINDS)[number];

export const ADMIN_ACTION_TYPES = [
  'report_resolve',
  'report_dismiss',
  'work_blind',
  'work_unblind',
  'chapter_blind',
  'chapter_unblind',
  'user_warn',
  'user_suspend',
  'user_permanent_suspend',
  'user_sanction_lift',
  'review_maintain',
  'review_unblind',
  'admin_grant',
  'admin_revoke',
] as const;
export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number];

export const REVIEW_REQUEST_STATUSES = ['open', 'maintained', 'unblinded'] as const;
export type ReviewRequestStatus = (typeof REVIEW_REQUEST_STATUSES)[number];

export type ModerationTargetType = 'work' | 'chapter';

/** A report target: work-level when chapterId is null. */
export interface ModerationTarget {
  type: ModerationTargetType;
  workId: string;
  chapterId: string | null;
}

/** Trusted identity produced only by requireAdmin(); never built from client input. */
export interface AdminActor {
  userId: string;
  /** True when the administrator also holds writer identity (D-01). */
  isWriter: boolean;
}

export interface ReportGroupSummary {
  target: ModerationTarget;
  workTitle: string;
  chapterTitle: string | null;
  coverImageUrl: string | null;
  reportCount: number;
  /** Distinct reporters in the group (queue reporter summary). */
  reporterCount: number;
  categories: string[];
  oldestReportedAt: string;
  status: ReportStatus;
  /** Current blind state of the exact target row. */
  blinded: boolean;
  /** Any report ID in the group; detail pages resolve the whole group from it. */
  anchorReportId: string;
}

export interface AdminReportItem {
  id: string;
  target: ModerationTarget;
  reporterId: string;
  reasonCategory: string;
  detail: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface AdminActionRecord {
  id: string;
  actorId: string | null;
  actionType: AdminActionType;
  target: ModerationTarget | null;
  targetUserId: string | null;
  reason: string | null;
  publicReason: string | null;
  createdAt: string;
}

export interface AdminReportDetail {
  target: ModerationTarget;
  workTitle: string;
  chapterTitle: string | null;
  authorId: string;
  authorPenName: string | null;
  targetBody: string | null;
  blinded: boolean;
  publicBlindReason: string | null;
  reports: AdminReportItem[];
  /** Exact open report IDs the operator reviewed; commands resolve only this set. */
  reviewedReportIds: string[];
  /** Opaque target version; commands fail with stale_target if it changed. */
  targetVersion: string;
  authorReportHistory: AdminReportItem[];
  authorActionHistory: AdminActionRecord[];
}

export interface ReviewRequestSummary {
  id: string;
  target: ModerationTarget;
  workTitle: string;
  chapterTitle: string | null;
  requesterId: string;
  message: string | null;
  status: ReviewRequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Admin-only review request detail (D-16). */
export interface ReviewRequestDetail extends ReviewRequestSummary {
  resolutionNote: string | null;
  targetBody: string | null;
  blinded: boolean;
  publicBlindReason: string | null;
  targetVersion: string;
  targetActionHistory: AdminActionRecord[];
}

/** One page of complete groups/requests. totalCount is 0 when the page is past the end. */
export interface AdminPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
}

export const MODERATION_ACTIONS = ['resolve', 'dismiss', 'blind', 'warn', 'suspend', 'permanent_suspend'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/** Actions that change content or a user and therefore need internal + public reasons (D-19). */
export const OPERATIVE_MODERATION_ACTIONS = ['blind', 'warn', 'suspend', 'permanent_suspend'] as const;

export const REVIEW_OUTCOMES = ['maintained', 'unblinded'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export interface UserSanctionRecord {
  id: string;
  userId: string;
  kind: SanctionKind;
  publicReason: string;
  endsAt: string | null;
  createdAt: string;
}

/** Recipient-facing warning notice (D-09). Never includes internal notes. */
export interface WarningNotice {
  sanctionId: string;
  publicReason: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface EffectiveSanction {
  kind: SanctionCacheKind;
  sanctionedUntil: string | null;
}

export type AdminErrorCode =
  | 'not_found'
  | 'unauthorized'
  | 'validation_failed'
  | 'reason_required'
  | 'stale_target'
  | 'conflict'
  | 'unavailable';

export type AdminResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: AdminErrorCode; fieldErrors?: Record<string, string> };
