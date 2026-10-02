import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUserStrict, pgPool } from '../helpers/db';
import { deleteFixtures, planCleanup } from '../../scripts/lib/report-fixture-cleanup.mjs';
import { submitReport } from '../../lib/reader/reports';

describe('submitReport (READ-05/D-16)', () => {
  const admin = adminClient();
  const users: string[] = [];
  const works: string[] = [];
  const reports: string[] = [];

  // BUG-05: remove everything this file created (reports -> kb nodes -> works -> accounts) and
  // fail loudly if anything is left behind, so the admin report queue is not polluted.
  afterAll(async () => {
    const sql = pgPool(1);
    try {
      await deleteFixtures(sql, await planCleanup(sql, { reportIds: reports, workIds: works, userIds: users }));
    } finally {
      await sql.end();
    }
    for (const id of users) await deleteTestUserStrict(id);
  });

  async function createWork() {
    const owner = await createTestUser();
    users.push(owner.id);
    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    works.push(workId as string);
    return workId as string;
  }

  it('succeeds with a non-기타 category and no detail', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '내용 불일치/표절',
    });
    if (result.reportId) reports.push(result.reportId);
    expect(result.ok).toBe(true);
  });

  it('fails for 기타 category with no detail', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '기타',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('상세 내용을 입력해주세요.');
  });

  it('fails for 기타 category with empty-string detail', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '기타',
      detail: '',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('상세 내용을 입력해주세요.');
  });

  it('succeeds for 기타 category with a non-empty detail', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '기타',
      detail: '표지 이미지가 저작권을 침해한 것 같아요.',
    });
    if (result.reportId) reports.push(result.reportId);
    expect(result.ok).toBe(true);
  });

  it('fails for an invalid category string', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '없는 카테고리',
    });
    expect(result.ok).toBe(false);
  });

  it('creates a row with status: open and reporter_id matching the caller', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '스팸/광고',
    });
    if (result.reportId) reports.push(result.reportId);
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('reports').select('*').eq('id', result.reportId!).single();
    expect(row.status).toBe('open');
    expect(row.reporter_id).toBe(reporter.id);
  });

  it('accepts chapterId: null (work-level report) and stores chapter_id as null', async () => {
    const workId = await createWork();
    const reporter = await createTestUser();
    users.push(reporter.id);

    const result = await submitReport(admin, {
      reporterId: reporter.id,
      workId,
      chapterId: null,
      reasonCategory: '혐오·유해 콘텐츠',
    });
    if (result.reportId) reports.push(result.reportId);
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('reports').select('chapter_id').eq('id', result.reportId!).single();
    expect(row!.chapter_id).toBeNull();
  });
});
