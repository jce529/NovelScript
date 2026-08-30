import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { listFeed, computeTrendingScores } from '../../lib/discovery/actions';

describe('computeTrendingScores (regression: totalViews must actually influence the score)', () => {
  it('a row with much higher totalViews scores higher than one with none, all else equal', () => {
    const [lowScore, highScore] = computeTrendingScores([
      { totalViews: 0, likeCount: 0, ctr: 0 },
      { totalViews: 1000, likeCount: 0, ctr: 0 },
    ]);
    expect(highScore).toBeGreaterThan(lowScore);
  });
});

describe('listFeed (READ-01)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createWork(input: {
    title: string;
    genre?: string | null;
    chapterViewCounts?: number[]; // each entry becomes one PUBLISHED chapter
    unpublishedChapters?: number;
    likeCount?: number;
  }) {
    const owner = await createTestUser();
    users.push(owner.id);

    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: input.title,
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: input.genre ?? null,
    });
    if (error) throw error;

    const viewCounts = input.chapterViewCounts ?? [];
    for (let i = 0; i < viewCounts.length; i++) {
      const { data: chapter, error: chErr } = await admin
        .from('chapters')
        .insert({ work_id: workId as string, title: `${i + 1}화`, order_index: i })
        .select('id')
        .single();
      if (chErr) throw chErr;
      await admin
        .from('chapters')
        .update({ is_published: true, view_count: viewCounts[i] })
        .eq('id', chapter!.id);
    }

    for (let i = 0; i < (input.unpublishedChapters ?? 0); i++) {
      await admin.from('chapters').insert({
        work_id: workId as string,
        title: `미발행 ${i + 1}화`,
        order_index: viewCounts.length + i,
      });
    }

    for (let i = 0; i < (input.likeCount ?? 0); i++) {
      const liker = await createTestUser();
      users.push(liker.id);
      const { error: likeErr } = await admin
        .from('work_likes')
        .insert({ work_id: workId as string, user_id: liker.id });
      if (likeErr) throw likeErr;
    }

    return { ownerId: owner.id, workId: workId as string };
  }

  it('excludes a work with zero published chapters', async () => {
    const { workId } = await createWork({ title: '미발행 작품', unpublishedChapters: 2 });

    const rows = await listFeed(admin, { sortMode: 'latest' });

    expect(rows.some((r) => r.id === workId)).toBe(false);
  });

  it('includes a work with published chapters, viewCount = sum of published chapters view_count', async () => {
    const { workId } = await createWork({
      title: '발행 작품',
      chapterViewCounts: [10, 20, 5],
      unpublishedChapters: 1,
    });

    const rows = await listFeed(admin, { sortMode: 'latest' });
    const row = rows.find((r) => r.id === workId);

    expect(row).toBeDefined();
    expect(row!.viewCount).toBe(35);
  });

  it('likeCount matches the number of work_likes rows for that work', async () => {
    const { workId } = await createWork({
      title: '좋아요 작품',
      chapterViewCounts: [1],
      likeCount: 3,
    });

    const rows = await listFeed(admin, { sortMode: 'latest' });
    const row = rows.find((r) => r.id === workId);

    expect(row!.likeCount).toBe(3);
  });

  it('trendingScore is an integer between 0 and 100 inclusive for every row', async () => {
    const a = await createWork({ title: '점수 작품 A', chapterViewCounts: [100, 50], likeCount: 2 });
    const b = await createWork({ title: '점수 작품 B', chapterViewCounts: [1] });

    const rows = await listFeed(admin, { sortMode: 'latest' });
    const ids = new Set([a.workId, b.workId]);
    const relevant = rows.filter((r) => ids.has(r.id));

    // Scoped to this test's own rows — the shared dev DB accumulates works from other
    // test runs/parallel agents, so asserting over the full `rows` array is flaky.
    expect(relevant.length).toBe(2);
    for (const row of relevant) {
      expect(Number.isInteger(row.trendingScore)).toBe(true);
      expect(row.trendingScore).toBeGreaterThanOrEqual(0);
      expect(row.trendingScore).toBeLessThanOrEqual(100);
    }
  });

  it('genre filter only returns works with the matching genre', async () => {
    const fantasy = await createWork({ title: '판타지 작품', genre: '판타지', chapterViewCounts: [1] });
    await createWork({ title: '로맨스 작품', genre: '로맨스', chapterViewCounts: [1] });

    const rows = await listFeed(admin, { genre: '판타지', sortMode: 'latest' });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.genre === '판타지')).toBe(true);
    expect(rows.some((r) => r.id === fantasy.workId)).toBe(true);
  });

  // The shared dev DB accumulates works from other test runs/parallel agents, so these
  // ordering assertions filter `rows` down to just the two IDs this test created and
  // compare their relative order — valid regardless of how much other data is present,
  // since a comparator-based sort preserves the pairwise order of any subsequence.
  function relativeOrder(rows: { id: string }[], ids: string[]): string[] {
    return rows.filter((r) => ids.includes(r.id)).map((r) => r.id);
  }

  it('sortMode "latest" returns works ordered by createdAt descending', async () => {
    const older = await createWork({ title: '오래된 작품', chapterViewCounts: [1] });
    await new Promise((r) => setTimeout(r, 20));
    const newer = await createWork({ title: '새 작품', chapterViewCounts: [1] });

    const rows = await listFeed(admin, { sortMode: 'latest' });

    expect(relativeOrder(rows, [older.workId, newer.workId])).toEqual([newer.workId, older.workId]);
  });

  it('sortMode "popular", sortBasis "views" orders by viewCount descending', async () => {
    const low = await createWork({ title: '조회수 낮음', chapterViewCounts: [5] });
    const high = await createWork({ title: '조회수 높음', chapterViewCounts: [500] });

    const rows = await listFeed(admin, { sortMode: 'popular', sortBasis: 'views' });

    expect(relativeOrder(rows, [low.workId, high.workId])).toEqual([high.workId, low.workId]);
  });

  it('sortMode "popular", sortBasis "likes" orders by likeCount descending', async () => {
    const low = await createWork({ title: '좋아요 낮음', chapterViewCounts: [1], likeCount: 0 });
    const high = await createWork({ title: '좋아요 높음', chapterViewCounts: [1], likeCount: 4 });

    const rows = await listFeed(admin, { sortMode: 'popular', sortBasis: 'likes' });

    expect(relativeOrder(rows, [low.workId, high.workId])).toEqual([high.workId, low.workId]);
  });

  it('sortMode "popular", sortBasis "ctr" orders by ctr descending', async () => {
    const low = await createWork({ title: 'CTR 낮음', chapterViewCounts: [100, 1] });
    const high = await createWork({ title: 'CTR 높음', chapterViewCounts: [10, 10] });

    const rows = await listFeed(admin, { sortMode: 'popular', sortBasis: 'ctr' });

    expect(relativeOrder(rows, [low.workId, high.workId])).toEqual([high.workId, low.workId]);
  });

  it('sortMode "popular" with no sortBasis defaults to trendingScore descending', async () => {
    const low = await createWork({ title: '트렌딩 낮음', chapterViewCounts: [1] });
    const high = await createWork({ title: '트렌딩 높음', chapterViewCounts: [1000], likeCount: 5 });

    const rows = await listFeed(admin, { sortMode: 'popular' });

    expect(relativeOrder(rows, [low.workId, high.workId])).toEqual([high.workId, low.workId]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].trendingScore).toBeGreaterThanOrEqual(rows[i].trendingScore);
    }
  });
});
