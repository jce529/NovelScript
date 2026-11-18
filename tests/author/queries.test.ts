import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  authorStatusLabel, getAuthorProfile, getAuthorStats, listAuthorWorks,
  normalizeAuthorWorksQuery,
} from '../../lib/author/queries';
import { chapterViewsToRaw, computeWorldTreePopularity } from '../../lib/world-tree/metric-adapter';

const authorId = '11111111-1111-4111-8111-111111111111';
const stats = { work_count: '26', ongoing_count: '14', completed_count: '12', subscriber_count: '9' };
const profile = { pen_name: '필명', pen_name_bio: '소개', email: 'private@example.com', role: 'admin' };

function work(n: number, serialStatus: 'ongoing' | 'completed' = 'ongoing') {
  return {
    id: `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`,
    title: `작품 ${n}`, synopsis: null, cover_image_url: null, genre: null,
    serial_status: serialStatus, created_at: '2026-01-01T00:00:00Z',
    latest_published_at: '2026-01-02T00:00:00Z', chapter_count: '2',
    total_views: '120', like_count: '3', ctr: '0.5', popularity_score: 61,
    owner_id: authorId, hidden_note: 'private',
  };
}

function fake(responses: Record<string, { data: unknown; error: unknown }>) {
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    void args;
    return responses[name] ?? { data: null, error: { message: 'missing fake' } };
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('author public queries (APAGE-01)', () => {
  it('normalizes URL query values and maps completed to 완결', () => {
    expect(normalizeAuthorWorksQuery()).toEqual({ status: 'all', sort: 'updated', offset: 0 });
    expect(normalizeAuthorWorksQuery({ status: 'completed', sort: 'popular', offset: '12' }))
      .toEqual({ status: 'completed', sort: 'popular', offset: 12 });
    expect(normalizeAuthorWorksQuery({ status: 'ongoing', sort: 'new', offset: 3 }))
      .toEqual({ status: 'ongoing', sort: 'new', offset: 3 });
    for (const offset of ['-1', '1.5', '1e3', '999999999999999999999', -1, 0.5]) {
      expect(normalizeAuthorWorksQuery({ status: 'draft', sort: 'views', offset }))
        .toEqual({ status: 'all', sort: 'updated', offset: 0 });
    }
    expect(authorStatusLabel('completed')).toBe('완결');
    expect(authorStatusLabel('ongoing')).toBe('연재중');
  });

  it('returns a public whitelist and distinguishes absent author from RPC failure', async () => {
    const ok = fake({ get_public_author_profile: { data: [profile], error: null } });
    expect(await getAuthorProfile(ok.client, authorId)).toEqual({
      ok: true, profile: { authorId, penName: '필명', penNameBio: '소개' },
    });
    expect(ok.rpc).toHaveBeenCalledWith('get_public_author_profile', { p_author_id: authorId });
    expect(JSON.stringify(await getAuthorProfile(ok.client, authorId))).not.toMatch(/email|role|private/);
    expect(await getAuthorProfile(fake({ get_public_author_profile: { data: [], error: null } }).client, authorId))
      .toMatchObject({ ok: false, code: 'not_found' });
    expect(await getAuthorProfile(fake({ get_public_author_profile: { data: null, error: { message: 'secret' } } }).client, authorId))
      .toMatchObject({ ok: false, code: 'unavailable' });
    expect(await getAuthorProfile(ok.client, 'invalid')).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('maps SQL bigint counts without exposing DB fields', async () => {
    const { client, rpc } = fake({ get_public_author_stats: { data: [stats], error: null } });
    expect(await getAuthorStats(client, authorId)).toEqual({ ok: true, stats: {
      workCount: 26, ongoingCount: 14, completedCount: 12, subscriberCount: 9,
    } });
    expect(rpc).toHaveBeenCalledWith('get_public_author_stats', { p_author_id: authorId });
  });

  it('uses DB order and filtered total for a stable 12-item page', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => work(12 - i, 'completed'));
    const { client, rpc } = fake({
      get_public_author_stats: { data: [stats], error: null },
      list_public_author_works: { data: rows, error: null },
    });
    const result = await listAuthorWorks(client, authorId, { status: 'completed', sort: 'popular', offset: '0' });
    expect(result).toMatchObject({ ok: true, page: { totalCount: 12, nextOffset: null } });
    if (!result.ok) throw new Error('expected page');
    expect(result.page.items).toHaveLength(12);
    expect(result.page.items.map((item) => item.id)).toEqual(rows.map((item) => item.id));
    expect(result.page.items[0].serialStatus).toBe('completed');
    expect(JSON.stringify(result.page.items[0])).not.toMatch(/owner_id|hidden_note|private/);
    expect(rpc).toHaveBeenCalledWith('list_public_author_works', {
      p_author_id: authorId, p_status: 'completed', p_sort: 'popular', p_offset: 0, p_limit: 12,
    });
  });

  it('uses filter count for the next offset and fails closed on malformed rows', async () => {
    const { client } = fake({
      get_public_author_stats: { data: [stats], error: null },
      list_public_author_works: { data: Array.from({ length: 12 }, (_, i) => work(i)), error: null },
    });
    expect(await listAuthorWorks(client, authorId, { status: 'ongoing' }))
      .toMatchObject({ ok: true, page: { totalCount: 14, nextOffset: 12 } });
    const bad = fake({
      get_public_author_stats: { data: [stats], error: null },
      list_public_author_works: { data: [{ ...work(1), serial_status: 'draft' }], error: null },
    });
    expect(await listAuthorWorks(bad.client, authorId)).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('keeps SQL popularity scores aligned with the common global adapter fixture', () => {
    // Global maxima include other authors; avoid .5 rounding boundaries across SQL numeric and JS floats.
    const baseline = { maxTotalViews: 300, maxLikeCount: 10 };
    const fixtures = [
      { views: [100, 50], likes: 4, sqlScore: 47 },
      { views: [20, 10], likes: 1, sqlScore: 22 },
      { views: [200, 100], likes: 10, sqlScore: 85 },
    ];
    const scored = fixtures.map(({ views, likes, sqlScore }) => {
      const score = computeWorldTreePopularity(chapterViewsToRaw(views, likes), baseline);
      expect(score).toBe(sqlScore);
      return score;
    });
    expect([...scored].sort((a, b) => b - a)).toEqual([85, 47, 22]);
  });
});
