import 'server-only';
import { z } from 'zod';
import { withAdminAction, type AdminAuthDeps } from '@/lib/admin/auth';
import {
  ADMIN_ACTION_TYPES,
  REPORT_STATUSES,
  REVIEW_REQUEST_STATUSES,
  type AdminActionRecord,
  type AdminActionType,
  type AdminPage,
  type AdminReportDetail,
  type AdminReportItem,
  type AdminResult,
  type ModerationTarget,
  type ReportGroupSummary,
  type ReportStatus,
  type ReviewRequestDetail,
  type ReviewRequestStatus,
  type ReviewRequestSummary,
} from '@/lib/admin/types';

/**
 * Admin moderation reads (ADMIN-01, D-17, D-18, D-20).
 *
 * Every export authorizes independently through withAdminAction (fresh session + membership
 * check), validates input, and only then calls a service_role-only SQL function from
 * 0007_admin_operations.sql. Rows are mapped field by field into DTOs, so columns the
 * database adds later never reach the client by accident.
 */

export const ADMIN_PAGE_SIZE = 25;
const MAX_PAGE = 10_000;

type Row = Record<string, unknown>;

const str = (value: unknown): string => (typeof value === 'string' ? value : String(value ?? ''));
const strOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0));
const bool = (value: unknown): boolean => value === true;
const time = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return str(value);
};
const timeOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : time(value));
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

function target(workId: unknown, chapterId: unknown): ModerationTarget {
  const chapter = strOrNull(chapterId);
  return { type: chapter ? 'chapter' : 'work', workId: str(workId), chapterId: chapter };
}

function reportStatus(value: unknown): ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(str(value)) ? (value as ReportStatus) : 'open';
}

function mapReport(row: Row): AdminReportItem {
  return {
    id: str(row.id),
    target: target(row.work_id, row.chapter_id),
    reporterId: str(row.reporter_id),
    reasonCategory: str(row.reason_category),
    detail: strOrNull(row.detail),
    status: reportStatus(row.status),
    createdAt: time(row.created_at),
    resolvedAt: timeOrNull(row.resolved_at),
    resolutionNote: strOrNull(row.resolution_note),
  };
}

function mapAction(row: Row): AdminActionRecord | null {
  const type = str(row.action_type);
  if (!(ADMIN_ACTION_TYPES as readonly string[]).includes(type)) return null;
  return {
    id: str(row.id),
    actorId: strOrNull(row.actor_id),
    actionType: type as AdminActionType,
    target: row.work_id ? target(row.work_id, row.chapter_id) : null,
    targetUserId: strOrNull(row.target_user_id),
    reason: strOrNull(row.reason),
    publicReason: strOrNull(row.public_reason),
    createdAt: time(row.created_at),
  };
}

function mapActions(value: unknown): AdminActionRecord[] {
  return rows(value).map(mapAction).filter((a): a is AdminActionRecord => a !== null);
}

function page<T>(items: T[], pageNumber: number, total: unknown): AdminPage<T> {
  return {
    items: items.slice(0, ADMIN_PAGE_SIZE),
    page: pageNumber,
    pageSize: ADMIN_PAGE_SIZE,
    totalCount: items.length > 0 ? num(total) : 0,
    hasNext: items.length > ADMIN_PAGE_SIZE,
  };
}

const pageSchema = z.coerce.number().int().min(1).max(MAX_PAGE).default(1);
const reportListSchema = z.object({ status: z.enum(REPORT_STATUSES).default('open'), page: pageSchema });
const reviewListSchema = z.object({ status: z.enum(REVIEW_REQUEST_STATUSES).default('open'), page: pageSchema });
const idSchema = z.uuid();

/** D-20: defaults to open reports, oldest group first; 25 complete target groups per page. */
export async function listReportGroups(
  input: { status?: string; page?: number | string } = {},
  deps?: AdminAuthDeps
): Promise<AdminResult<AdminPage<ReportGroupSummary>>> {
  return withAdminAction(async ({ admin }) => {
    const parsed = reportListSchema.safeParse(input ?? {});
    if (!parsed.success) return { ok: false, error: 'validation_failed' };
    const { status, page: pageNumber } = parsed.data;

    // Fetch one extra group to know whether a next page exists.
    const { data, error } = await admin.rpc('list_report_groups', {
      p_status: status,
      p_limit: ADMIN_PAGE_SIZE + 1,
      p_offset: (pageNumber - 1) * ADMIN_PAGE_SIZE,
    });
    if (error) return { ok: false, error: 'unavailable' };

    const list = rows(data);
    const items = list.map<ReportGroupSummary>((row) => ({
      target: target(row.work_id, row.chapter_id),
      workTitle: str(row.work_title),
      chapterTitle: strOrNull(row.chapter_title),
      coverImageUrl: strOrNull(row.cover_image_url),
      reportCount: num(row.report_count),
      reporterCount: num(row.reporter_count),
      categories: Array.isArray(row.categories) ? row.categories.map(str) : [],
      oldestReportedAt: time(row.oldest_reported_at),
      status,
      blinded: bool(row.blinded),
      anchorReportId: str(row.anchor_report_id),
    }));
    return { ok: true, data: page(items, pageNumber, list[0]?.total_groups) };
  }, deps);
}

/** D-17: everything the operator needs for one target group, resolved from any report in it. */
export async function getReportDetail(
  anchorReportId: string,
  deps?: AdminAuthDeps
): Promise<AdminResult<AdminReportDetail>> {
  return withAdminAction(async ({ admin }) => {
    if (!idSchema.safeParse(anchorReportId).success) return { ok: false, error: 'validation_failed' };
    const { data, error } = await admin.rpc('get_report_group_detail', { p_anchor_report_id: anchorReportId });
    if (error) return { ok: false, error: 'unavailable' };
    if (!data || typeof data !== 'object') return { ok: false, error: 'not_found' };
    const row = data as Row;
    return {
      ok: true,
      data: {
        target: target(row.work_id, row.chapter_id),
        workTitle: str(row.work_title),
        chapterTitle: strOrNull(row.chapter_title),
        authorId: str(row.author_id),
        authorPenName: strOrNull(row.author_pen_name),
        targetBody: strOrNull(row.target_body),
        blinded: bool(row.blinded),
        publicBlindReason: strOrNull(row.public_blind_reason),
        reports: rows(row.reports).map(mapReport),
        reviewedReportIds: Array.isArray(row.reviewed_report_ids) ? row.reviewed_report_ids.map(str) : [],
        targetVersion: str(row.target_version),
        authorReportHistory: rows(row.author_report_history).map(mapReport),
        authorActionHistory: mapActions(row.author_action_history),
      },
    };
  }, deps);
}

function reviewStatus(value: unknown): ReviewRequestStatus {
  return (REVIEW_REQUEST_STATUSES as readonly string[]).includes(str(value)) ? (value as ReviewRequestStatus) : 'open';
}

function mapReviewSummary(row: Row): ReviewRequestSummary {
  return {
    id: str(row.id),
    target: target(row.work_id, row.chapter_id),
    workTitle: str(row.work_title),
    chapterTitle: strOrNull(row.chapter_title),
    requesterId: str(row.requester_id),
    message: strOrNull(row.message),
    status: reviewStatus(row.status),
    createdAt: time(row.created_at),
    resolvedAt: timeOrNull(row.resolved_at),
  };
}

/** D-16: separate re-review queue, oldest first. */
export async function listReviewRequests(
  input: { status?: string; page?: number | string } = {},
  deps?: AdminAuthDeps
): Promise<AdminResult<AdminPage<ReviewRequestSummary>>> {
  return withAdminAction(async ({ admin }) => {
    const parsed = reviewListSchema.safeParse(input ?? {});
    if (!parsed.success) return { ok: false, error: 'validation_failed' };
    const { status, page: pageNumber } = parsed.data;
    const { data, error } = await admin.rpc('list_review_requests', {
      p_status: status,
      p_limit: ADMIN_PAGE_SIZE + 1,
      p_offset: (pageNumber - 1) * ADMIN_PAGE_SIZE,
    });
    if (error) return { ok: false, error: 'unavailable' };
    const list = rows(data);
    return { ok: true, data: page(list.map(mapReviewSummary), pageNumber, list[0]?.total_requests) };
  }, deps);
}

export async function getReviewRequestDetail(
  requestId: string,
  deps?: AdminAuthDeps
): Promise<AdminResult<ReviewRequestDetail>> {
  return withAdminAction(async ({ admin }) => {
    if (!idSchema.safeParse(requestId).success) return { ok: false, error: 'validation_failed' };
    const { data, error } = await admin.rpc('get_review_request_detail', { p_request_id: requestId });
    if (error) return { ok: false, error: 'unavailable' };
    if (!data || typeof data !== 'object') return { ok: false, error: 'not_found' };
    const row = data as Row;
    return {
      ok: true,
      data: {
        ...mapReviewSummary(row),
        resolutionNote: strOrNull(row.resolution_note),
        targetBody: strOrNull(row.target_body),
        blinded: bool(row.blinded),
        publicBlindReason: strOrNull(row.public_blind_reason),
        targetVersion: str(row.target_version),
        targetActionHistory: mapActions(row.target_action_history),
      },
    };
  }, deps);
}
