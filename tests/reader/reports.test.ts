import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { submitReport } from '../../lib/reader/reports';

describe('submitReport (READ-05/D-16)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
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
    expect(result.ok).toBe(true);

    const { data: row } = await admin.from('reports').select('chapter_id').eq('id', result.reportId!).single();
    expect(row.chapter_id).toBeNull();
  });
});
