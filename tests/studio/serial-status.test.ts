/**
 * Unit tests for studio serial status action, SerialStatusField, WorkSettingsPage, and WorkHome entry link (21-02 Task 2 & Task 3).
 *
 * [Task 3 — 일회용 DB 권한·멱등성 검증 절차 메모]
 * 이 세션에서는 어떤 DB에도 접속하거나 SQL을 실행하지 않는다.
 * 실행 단계의 일회용 DB 검증(결과 또는 미실행 사유·미검증 상태는 21-04-SUMMARY.md에 필수 기록)은
 * tests/helpers/db.ts의 트랜잭션 격리 헬퍼 관례를 따라 다음 순서로 수행한다:
 *   1. 연결 전 일회용 Supabase 프로젝트 ref가 공유 프로젝트 ref와 다른지 먼저 확인한다(공유 DB는 사용자가 직접 적용하며 자동 적용 명령 금지).
 *   2. `supabase/migrations/0056_works_serial_status.sql` 단일 파일을 일회용 DB에 두 번 연속 적용한다.
 *   3. 스키마 기본값(`'ongoing'`), 재적용 시 기존 `'completed'` 행 유지(덮어쓰기 없음), CHECK 제약(`ongoing|completed`)을 확인한다.
 *   4. 트랜잭션 격리 테스트로 Author A(본인) UPDATE 성공(`ongoing↔completed`), Author B(타 작가) 및 `anon` UPDATE 거부, 공개 `SELECT`(`works_public_read`) 가능 여부를 검증한다.
 */
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkWriteAccess: vi.fn(),
  getWork: vi.fn(),
  revalidatePath: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  updatePayloads: [] as Array<Record<string, unknown>>,
  eqCalls: [] as Array<[string, unknown]>,
  isCalls: [] as Array<[string, unknown]>,
  maybeSingleResult: {
    data: { id: 'work-1', serial_status: 'completed' } as { id: string; serial_status: string } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
    from: (table: string) => {
      expect(table).toBe('works');
      const chain = {
        update: (payload: Record<string, unknown>) => {
          mocks.updatePayloads.push(payload);
          return chain;
        },
        select: () => chain,
        eq: (column: string, value: unknown) => {
          mocks.eqCalls.push([column, value]);
          return chain;
        },
        is: (column: string, value: unknown) => {
          mocks.isCalls.push([column, value]);
          return chain;
        },
        maybeSingle: async () => mocks.maybeSingleResult,
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/auth/write-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/write-access')>();
  return {
    ...actual,
    checkWriteAccess: mocks.checkWriteAccess,
  };
});

vi.mock('@/lib/works/actions', () => ({
  getWork: mocks.getWork,
}));

vi.mock('@/lib/chapters/actions', () => ({
  listChapters: async () => [{ is_published: true }],
}));

vi.mock('@/lib/kb/actions', () => ({
  getWorkKbNodes: async () => [{ node_type: 'file', category: 'setting' }],
}));

vi.mock('@/lib/moderation/actions', () => ({
  getReviewPanelStateAction: async () => ({
    target: { ok: true, state: { blinded: false, blindReason: null, latestRequest: null } },
    writeDenied: null,
  }),
}));

vi.mock('@/components/moderation/review-request', () => ({
  ReviewRequestPanel: () => createElement('div', { 'data-review-panel': 'true' }),
}));

import {
  updateWorkSerialStatusAction,
  type SerialStatus,
  type UpdateSerialStatusResult,
} from '@/app/studio/[workId]/settings/actions';
import WorkSettingsPage from '@/app/studio/[workId]/settings/page';
import { SETTINGS_SECTIONS } from '@/app/studio/[workId]/settings/sections';
import WorkHomePage from '@/app/studio/[workId]/page';
import {
  SERIAL_STATUS_COPY,
  SERIAL_STATUS_OPTIONS,
  SerialStatusField,
  createSerialStatusController,
} from '@/components/studio/serial-status-field';
import { WorkHomeContent } from '@/components/studio/work-home-content';
import { buildWorkHomeState } from '@/lib/works/work-home';

const WORK_ID = 'work-1';
const OWNER_ID = 'owner-1';
const OTHER_AUTHOR_ID = 'owner-2';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updatePayloads.length = 0;
  mocks.eqCalls.length = 0;
  mocks.isCalls.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER_ID } }, error: null });
  mocks.checkWriteAccess.mockResolvedValue({ ok: true });
  mocks.getWork.mockResolvedValue({
    id: WORK_ID,
    title: '달빛 아래의 연대기',
    synopsis: '작품 기본 소개 문구',
    owner_id: OWNER_ID,
    serial_status: 'ongoing',
  });
  mocks.maybeSingleResult = {
    data: { id: WORK_ID, serial_status: 'completed' },
    error: null,
  };
});

describe('updateWorkSerialStatusAction server boundary (Task 2)', () => {
  it('rejects unauthenticated requests before write-access or work queries', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const result = await updateWorkSerialStatusAction(WORK_ID, 'completed');

    expect(result).toEqual({
      ok: false,
      code: 'unauthenticated',
      error: SERIAL_STATUS_COPY.saveError,
    });
    expect(mocks.checkWriteAccess).not.toHaveBeenCalled();
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(mocks.updatePayloads).toHaveLength(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects invalid status values before touching session or DB', async () => {
    for (const invalid of ['paused', 'hiatus', '', null, undefined, 123]) {
      const result = await updateWorkSerialStatusAction(WORK_ID, invalid);
      expect(result).toEqual({
        ok: false,
        code: 'invalid_input',
        error: SERIAL_STATUS_COPY.saveError,
      });
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.checkWriteAccess).not.toHaveBeenCalled();
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it('enforces checkWriteAccess + writeDenial before work lookup or update', async () => {
    mocks.checkWriteAccess.mockResolvedValueOnce({
      ok: false,
      code: 'suspended',
      error: '활동이 일시 정지된 계정이에요.',
      until: '2026-12-01T00:00:00Z',
      reason: '운영 정책 위반',
    });

    const result = await updateWorkSerialStatusAction(WORK_ID, 'completed');

    expect(result).toEqual({
      ok: false,
      code: 'suspended',
      error: '활동이 일시 정지된 계정이에요.',
    });
    expect(mocks.checkWriteAccess).toHaveBeenCalledWith(expect.anything(), OWNER_ID);
    expect(mocks.getWork).not.toHaveBeenCalled();
    expect(mocks.updatePayloads).toHaveLength(0);
  });

  it('ignores client-supplied ownerId and denies updates when session user does not own the work', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: OTHER_AUTHOR_ID } }, error: null });
    mocks.getWork.mockResolvedValueOnce(null);

    const result = await updateWorkSerialStatusAction({
      workId: WORK_ID,
      serialStatus: 'completed',
      ownerId: OWNER_ID, // tampered client ownerId must be ignored
    });

    expect(result).toEqual({
      ok: false,
      code: 'forbidden',
      error: SERIAL_STATUS_COPY.saveError,
    });
    expect(mocks.checkWriteAccess).toHaveBeenCalledWith(expect.anything(), OTHER_AUTHOR_ID);
    expect(mocks.getWork).toHaveBeenCalledWith(expect.anything(), {
      ownerId: OTHER_AUTHOR_ID,
      workId: WORK_ID,
    });
    expect(mocks.updatePayloads).toHaveLength(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('updates serial_status with id + owner_id + deleted_at IS NULL and revalidates studio/reader paths', async () => {
    const completedResult = await updateWorkSerialStatusAction(WORK_ID, 'completed');

    expect(completedResult).toEqual({
      ok: true,
      serialStatus: 'completed',
    });
    expect(mocks.updatePayloads).toHaveLength(1);
    expect(mocks.updatePayloads[0]).toMatchObject({ serial_status: 'completed' });
    expect(mocks.eqCalls).toContainEqual(['id', WORK_ID]);
    expect(mocks.eqCalls).toContainEqual(['owner_id', OWNER_ID]);
    expect(mocks.isCalls).toContainEqual(['deleted_at', null]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/studio/${WORK_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/studio/${WORK_ID}/settings`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/works/${WORK_ID}`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/series/free');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/series/paid');

    // Revert completed -> ongoing is allowed without restriction
    mocks.maybeSingleResult = {
      data: { id: WORK_ID, serial_status: 'ongoing' },
      error: null,
    };
    const ongoingResult = await updateWorkSerialStatusAction(WORK_ID, 'ongoing');
    expect(ongoingResult).toEqual({
      ok: true,
      serialStatus: 'ongoing',
    });
  });

  it('returns saveError without revalidating when the DB update returns no row or an error', async () => {
    mocks.maybeSingleResult = { data: null, error: { message: 'rls blocked' } };

    const result = await updateWorkSerialStatusAction(WORK_ID, 'completed');

    expect(result).toEqual({
      ok: false,
      code: 'update_failed',
      error: SERIAL_STATUS_COPY.saveError,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('SerialStatusField UI contract and non-optimistic save lifecycle (UI-SPEC §6 & §7)', () => {
  it('renders fieldset/legend, aria-describedby description, 44px segment buttons, aria-pressed, and no separate save button', () => {
    const ongoingHtml = renderToStaticMarkup(
      createElement(SerialStatusField, { workId: WORK_ID, initialStatus: 'ongoing' }),
    );

    expect(ongoingHtml).toContain('<fieldset');
    expect(ongoingHtml).toContain(`<legend class="px-1 text-sm font-semibold leading-[1.2]">${SERIAL_STATUS_COPY.legend}</legend>`);
    expect(ongoingHtml).toContain(`id="serial-status-description-${WORK_ID}"`);
    expect(ongoingHtml).toContain(`aria-describedby="serial-status-description-${WORK_ID}"`);
    expect(ongoingHtml).toContain(SERIAL_STATUS_COPY.description);
    expect(ongoingHtml).toContain('min-h-11');
    expect(ongoingHtml).toContain('aria-pressed="true"');
    expect(ongoingHtml).toContain('aria-pressed="false"');
    expect(ongoingHtml).toContain('>연재중</button>');
    expect(ongoingHtml).toContain('>완결</button>');
    expect(ongoingHtml).not.toContain('>저장</button>');

    const pendingHtml = renderToStaticMarkup(
      createElement(SerialStatusField, { workId: WORK_ID, initialStatus: 'completed', pending: true }),
    );
    expect(pendingHtml.match(/disabled=""/g)).toHaveLength(2);
  });

  it('disables while saving without optimistic update, applies status + success toast on save, and allows completed -> ongoing revert', async () => {
    const observedStates: Array<{ status: SerialStatus; saving: boolean }> = [];
    let resolveSave!: (value: UpdateSerialStatusResult) => void;

    const saveAction = vi.fn(
      () =>
        new Promise<UpdateSerialStatusResult>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const controller = createSerialStatusController({
      workId: WORK_ID,
      initialStatus: 'ongoing',
      saveAction,
      onChange: (state) => observedStates.push(state),
    });

    const savePromise = controller.select('completed');

    // Non-optimistic: while saving is in-flight, status stays 'ongoing' and saving is true (disabling both buttons)
    expect(controller.getState()).toEqual({ status: 'ongoing', saving: true });
    // Duplicate clicks while saving are ignored
    await controller.select('ongoing');
    expect(saveAction).toHaveBeenCalledTimes(1);
    expect(saveAction).toHaveBeenCalledWith(WORK_ID, 'completed');

    resolveSave({ ok: true, serialStatus: 'completed' });
    await savePromise;

    expect(controller.getState()).toEqual({ status: 'completed', saving: false });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('연재 상태를 저장했어요.');
    expect(mocks.toastError).not.toHaveBeenCalled();

    // Revert completed -> ongoing without confirmation dialog
    saveAction.mockResolvedValueOnce({ ok: true, serialStatus: 'ongoing' });
    await controller.select('ongoing');
    expect(controller.getState()).toEqual({ status: 'ongoing', saving: false });
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(2);
    expect(observedStates).toEqual([
      { status: 'ongoing', saving: true },
      { status: 'completed', saving: false },
      { status: 'completed', saving: true },
      { status: 'ongoing', saving: false },
    ]);
  });

  it('keeps the previous status, shows the error toast on failure, and succeeds on retry', async () => {
    const saveAction = vi
      .fn<(workId: string, nextStatus: SerialStatus) => Promise<UpdateSerialStatusResult>>()
      .mockResolvedValueOnce({ ok: false, error: SERIAL_STATUS_COPY.saveError })
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true, serialStatus: 'completed' });

    const controller = createSerialStatusController({
      workId: WORK_ID,
      initialStatus: 'ongoing',
      saveAction,
    });

    await controller.select('completed');
    expect(controller.getState()).toEqual({ status: 'ongoing', saving: false });
    expect(mocks.toastError).toHaveBeenCalledWith(
      '연재 상태를 저장하지 못했어요. 다시 시도해 주세요.',
    );

    await controller.select('completed');
    expect(controller.getState()).toEqual({ status: 'ongoing', saving: false });
    expect(mocks.toastError).toHaveBeenCalledTimes(2);

    // Retry succeeds after prior failures
    await controller.select('completed');
    expect(controller.getState()).toEqual({ status: 'completed', saving: false });
    expect(mocks.toastSuccess).toHaveBeenCalledWith('연재 상태를 저장했어요.');
    expect(SERIAL_STATUS_OPTIONS).toEqual([
      { value: 'ongoing', label: '연재중' },
      { value: 'completed', label: '완결' },
    ]);
  });
});

describe('/studio/[workId]/settings section-array assembly and owner boundary (Task 2)', () => {
  it('defines SETTINGS_SECTIONS array with .map( rendering and fixed order comment (연재 상태 → 태그 → 댓글 허용)', () => {
    const pageSource = readFileSync('app/studio/[workId]/settings/page.tsx', 'utf8');
    expect(pageSource).toContain('SETTINGS_SECTIONS');
    expect(pageSource).toContain('SETTINGS_SECTIONS.map(');
    expect(pageSource).toContain('연재 상태 → 태그 → 댓글 허용');
    expect(SETTINGS_SECTIONS[0]?.key).toBe('serial-status');
  });

  it('renders basic work info and SETTINGS_SECTIONS for the work owner', async () => {
    const html = renderToStaticMarkup(
      await WorkSettingsPage({ params: Promise.resolve({ workId: WORK_ID }) }),
    );

    expect(html).toContain('작품 설정');
    expect(html).toContain(`href="/studio/${WORK_ID}"`);
    expect(html).toContain('달빛 아래의 연대기');
    expect(html).toContain('작품 기본 소개 문구');
    expect(html).toContain(SERIAL_STATUS_COPY.legend);
    expect(html).toContain(SERIAL_STATUS_COPY.description);
  });

  it('blocks unauthenticated and non-owner visitors from viewing settings sections', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const anonHtml = renderToStaticMarkup(
      await WorkSettingsPage({ params: Promise.resolve({ workId: WORK_ID }) }),
    );
    expect(anonHtml).toContain('작품을 찾을 수 없어요');
    expect(anonHtml).not.toContain(SERIAL_STATUS_COPY.legend);

    mocks.getWork.mockResolvedValueOnce(null);
    const nonOwnerHtml = renderToStaticMarkup(
      await WorkSettingsPage({ params: Promise.resolve({ workId: WORK_ID }) }),
    );
    expect(nonOwnerHtml).toContain('작품을 찾을 수 없어요');
    expect(nonOwnerHtml).not.toContain('달빛 아래의 연대기');
    expect(nonOwnerHtml).not.toContain(SERIAL_STATUS_COPY.legend);
  });
});

describe('/studio/[workId] work home settings entry link placement (Task 2 & Phase 19 D-10)', () => {
  it('places the 작품 설정 link at the end of the work-screens section, outside header and the 4 shortcut cards', async () => {
    const pageSource = readFileSync('app/studio/[workId]/page.tsx', 'utf8');
    expect(pageSource).toContain('settingsHref={`/studio/${workId}/settings`}');

    const completedGuideHtml = renderToStaticMarkup(
      await WorkHomePage({ params: Promise.resolve({ workId: WORK_ID }) }),
    );

    // Header (title + synopsis) must NOT contain the settings link (Phase 19 D-10 forbidden area)
    const headerEnd = completedGuideHtml.indexOf('</header>');
    expect(headerEnd).toBeGreaterThan(0);
    expect(completedGuideHtml.slice(0, headerEnd)).not.toContain(`/studio/${WORK_ID}/settings`);
    expect(completedGuideHtml.slice(0, headerEnd)).not.toContain('작품 설정');

    // Exactly 4 shortcut cards remain unchanged
    expect(completedGuideHtml.match(/class="group flex min-h-11/g)).toHaveLength(4);

    // Settings link appears after the 4th shortcut card inside the work-screens section
    const lastShortcutPos = completedGuideHtml.indexOf(`href="/studio/${WORK_ID}/world#world-branching"`);
    const settingsLinkPos = completedGuideHtml.indexOf(`href="/studio/${WORK_ID}/settings"`);
    expect(lastShortcutPos).toBeGreaterThan(headerEnd);
    expect(settingsLinkPos).toBeGreaterThan(lastShortcutPos);
    expect(completedGuideHtml).toContain('작품 설정');

    // Also present inside the collapsible work-screens <details> when guide is incomplete
    const incompleteHtml = renderToStaticMarkup(
      createElement(WorkHomeContent, {
        workId: WORK_ID,
        title: '달빛 아래의 연대기',
        synopsis: '작품 기본 소개 문구',
        state: buildWorkHomeState([], []),
      }),
    );
    const detailsStart = incompleteHtml.indexOf('<details');
    expect(detailsStart).toBeGreaterThan(0);
    expect(incompleteHtml.slice(0, detailsStart)).not.toContain(`/studio/${WORK_ID}/settings`);
    expect(incompleteHtml.slice(detailsStart)).toContain(`href="/studio/${WORK_ID}/settings"`);
    expect(incompleteHtml.slice(detailsStart)).toContain('작품 설정');
  });
});
