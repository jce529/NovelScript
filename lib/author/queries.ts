import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuthorProfile, AuthorQueryFailure, AuthorStats, AuthorStatusFilter,
  AuthorWork, AuthorWorkPage, AuthorWorkSort, AuthorWorkStatus,
} from './types';

export const AUTHOR_PAGE_SIZE = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND: AuthorQueryFailure = { ok: false, code: 'not_found', error: '작가 페이지를 찾을 수 없어요.' };
const UNAVAILABLE: AuthorQueryFailure = { ok: false, code: 'unavailable', error: '작가 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' };

export function normalizeAuthorWorksQuery(input: { status?: unknown; sort?: unknown; offset?: unknown } = {}): {
  status: AuthorStatusFilter; sort: AuthorWorkSort; offset: number;
} {
  const status = input.status === 'ongoing' || input.status === 'completed' ? input.status : 'all';
  const sort = input.sort === 'new' || input.sort === 'popular' ? input.sort : 'updated';
  const offsetNumber = typeof input.offset === 'number' ? input.offset
    : typeof input.offset === 'string' && /^\d+$/.test(input.offset) ? Number(input.offset) : NaN;
  const offset = Number.isSafeInteger(offsetNumber) && offsetNumber >= 0 ? offsetNumber : 0;
  return { status, sort, offset };
}

export function authorStatusLabel(status: AuthorWorkStatus): '연재중' | '완결' {
  return status === 'completed' ? '완결' : '연재중';
}

function row(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function first(value: unknown): Record<string, unknown> | null {
  return Array.isArray(value) && value.length > 0 ? row(value[0]) : null;
}

function count(value: unknown): number | null {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export async function getAuthorProfile(supabase: SupabaseClient, authorId: string): Promise<{ ok: true; profile: AuthorProfile } | AuthorQueryFailure> {
  if (!UUID.test(authorId)) return NOT_FOUND;
  try {
    const { data, error } = await supabase.rpc('get_public_author_profile', { p_author_id: authorId });
    if (error) return UNAVAILABLE;
    const profile = first(data);
    if (!profile) return Array.isArray(data) && data.length === 0 ? NOT_FOUND : UNAVAILABLE;
    if (typeof profile.pen_name !== 'string' || !profile.pen_name.trim() ||
      !(profile.pen_name_bio === null || typeof profile.pen_name_bio === 'string')) return UNAVAILABLE;
    return { ok: true, profile: { authorId, penName: profile.pen_name, penNameBio: profile.pen_name_bio } };
  } catch { return UNAVAILABLE; }
}

export async function getAuthorStats(supabase: SupabaseClient, authorId: string): Promise<{ ok: true; stats: AuthorStats } | AuthorQueryFailure> {
  if (!UUID.test(authorId)) return NOT_FOUND;
  try {
    const { data, error } = await supabase.rpc('get_public_author_stats', { p_author_id: authorId });
    if (error) return UNAVAILABLE;
    const stats = first(data);
    if (!stats) return Array.isArray(data) && data.length === 0 ? NOT_FOUND : UNAVAILABLE;
    const workCount = count(stats.work_count);
    const ongoingCount = count(stats.ongoing_count);
    const completedCount = count(stats.completed_count);
    const subscriberCount = count(stats.subscriber_count);
    if (workCount === null || ongoingCount === null || completedCount === null || subscriberCount === null) return UNAVAILABLE;
    return { ok: true, stats: { workCount, ongoingCount, completedCount, subscriberCount } };
  } catch { return UNAVAILABLE; }
}

function mapWork(value: unknown): AuthorWork | null {
  const w = row(value);
  if (!w || typeof w.id !== 'string' || typeof w.title !== 'string' ||
    (w.serial_status !== 'ongoing' && w.serial_status !== 'completed') ||
    typeof w.created_at !== 'string' ||
    !(w.synopsis === null || typeof w.synopsis === 'string') ||
    !(w.cover_image_url === null || typeof w.cover_image_url === 'string') ||
    !(w.genre === null || typeof w.genre === 'string') ||
    !(w.latest_published_at === null || typeof w.latest_published_at === 'string')) return null;
  const chapterCount = count(w.chapter_count), totalViews = count(w.total_views);
  const likeCount = count(w.like_count), popularityScore = count(w.popularity_score);
  const ctr = typeof w.ctr === 'string' ? Number(w.ctr) : w.ctr;
  if (chapterCount === null || totalViews === null || likeCount === null || popularityScore === null ||
    typeof ctr !== 'number' || !Number.isFinite(ctr) || ctr < 0 || ctr > 1) return null;
  return {
    id: w.id, title: w.title, synopsis: w.synopsis, coverImageUrl: w.cover_image_url,
    genre: w.genre, serialStatus: w.serial_status, createdAt: w.created_at,
    latestPublishedAt: w.latest_published_at, chapterCount, totalViews, likeCount,
    ctr, popularityScore,
  };
}

export async function listAuthorWorks(
  supabase: SupabaseClient, authorId: string, input: { status?: unknown; sort?: unknown; offset?: unknown } = {},
): Promise<{ ok: true; page: AuthorWorkPage } | AuthorQueryFailure> {
  const { status, sort, offset } = normalizeAuthorWorksQuery(input);
  const stats = await getAuthorStats(supabase, authorId);
  if (!stats.ok) return stats;
  const totalCount = status === 'ongoing' ? stats.stats.ongoingCount
    : status === 'completed' ? stats.stats.completedCount : stats.stats.workCount;
  try {
    const { data, error } = await supabase.rpc('list_public_author_works', {
      p_author_id: authorId, p_status: status, p_sort: sort, p_offset: offset, p_limit: AUTHOR_PAGE_SIZE,
    });
    if (error || !Array.isArray(data)) return UNAVAILABLE;
    const items = data.map(mapWork);
    if (items.some((item) => item === null) || items.length > AUTHOR_PAGE_SIZE) return UNAVAILABLE;
    return {
      ok: true,
      page: { items: items as AuthorWork[], totalCount,
        nextOffset: offset + items.length < totalCount && items.length > 0 ? offset + items.length : null },
    };
  } catch { return UNAVAILABLE; }
}
