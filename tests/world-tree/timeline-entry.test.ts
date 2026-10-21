import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { draftFromTimeline } from '@/lib/world-tree/timeline';
import { ids, ifEras, ownerTree, placements, rootBranch, ifBranch, trunkEras } from './fixtures';

// 18-08: owner timeline page loader + save wiring. Browser DnD is verified in 18-12.

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getState: vi.fn(),
  save: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock('@/lib/world-tree/owner', async (orig) => ({
  ...(await orig<typeof import('@/lib/world-tree/owner')>()),
  getWorldTreeOwnerState: mocks.getState,
}));
vi.mock('@/app/studio/[workId]/world/actions', () => ({ saveWorldTimelineAction: mocks.save }));
vi.mock('@/components/world-tree/era-board', () => ({ EraBoard: function EraBoard() { return null; } }));

import TimelinePage from '@/app/studio/[workId]/world/timeline/page';
import { EraBoard } from '@/components/world-tree/era-board';

type El = { type?: unknown; props?: Record<string, unknown> } | null | undefined;
function findBoard(node: unknown): El {
  if (!node || typeof node !== 'object') return null;
  const el = node as El;
  if (el?.type === EraBoard) return el;
  const children = el?.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = findBoard(child);
    if (hit) return hit;
  }
  return null;
}

function stateFor(workId: string) {
  const branch = workId === ids.ifWork ? ifBranch : rootBranch;
  const eras = workId === ids.ifWork ? ifEras : trunkEras;
  return {
    ok: true as const,
    state: {
      work: { id: workId, title: 'w' },
      branch: { ...branch, requestId: null, createdAt: '2026-10-01T00:00:00.000Z' },
      draft: null,
      timeline: {
        draft: draftFromTimeline(branch, eras, placements),
        baseline: { eras, placements: placements.filter((p) => p.branchId === branch.id) },
      },
      deletion: { canDelete: false, reason: 'has_children' as const, message: null },
      notices: [],
      eligibility: { status: 'unavailable' as const, error: 'x', retryable: true as const },
      tree: { status: 'ok' as const, mode: 'owner' as const, projection: ownerTree },
    },
  };
}

const call = (workId: string, branchId?: string) =>
  TimelinePage({
    params: Promise.resolve({ workId }),
    searchParams: Promise.resolve(branchId ? { branchId } : {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: ids.owner } }, error: null });
  mocks.getState.mockImplementation(async (_s: unknown, input: { workId: string }) => stateFor(input.workId));
});

describe('timeline page loader', () => {
  it('derives the owner from the session, never from the URL', async () => {
    const tree = await call(ids.rootWork);
    expect(mocks.getState).toHaveBeenCalledWith(expect.anything(), { ownerId: ids.owner, workId: ids.rootWork });
    expect(findBoard(tree)).not.toBeNull();
  });

  it('redirects anonymous visitors to login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(call(ids.rootWork)).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(mocks.getState).not.toHaveBeenCalled();
  });

  it('rejects a work the session user does not own', async () => {
    mocks.getState.mockResolvedValue({ ok: false, code: 'forbidden', error: 'x', retryable: false });
    await expect(call(ids.rootWork)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('rejects a branchId that is unknown or not in this world', async () => {
    await expect(call(ids.rootWork, '00000000-0000-4000-8000-0000000000ff')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(call(ids.rootWork, 'not-a-uuid')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('rejects a branch of this world whose work the user cannot load', async () => {
    mocks.getState.mockImplementation(async (_s: unknown, input: { workId: string }) =>
      input.workId === ids.rootWork ? stateFor(ids.rootWork) : { ok: false, code: 'forbidden', error: 'x', retryable: false });
    await expect(call(ids.rootWork, ids.ifBranch)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('loads the selected branch of the world and binds save to that branch work', async () => {
    mocks.save.mockResolvedValue({ ok: true });
    const board = findBoard(await call(ids.rootWork, ids.ifBranch));
    const props = board?.props as { initialState: { draft: { branchId: string }; tabs: { branchId: string; active: boolean }[]; works: Record<string, unknown> }; onSave: (i: unknown) => Promise<unknown> };
    expect(props.initialState.draft.branchId).toBe(ids.ifBranch);
    expect(props.initialState.tabs.map((t) => t.branchId)).toEqual([ids.rootBranch, ids.ifBranch]);
    expect(props.initialState.tabs.find((t) => t.active)?.branchId).toBe(ids.ifBranch);
    expect(Object.keys(props.initialState.works)).toContain(ids.ifWork);
    const input = { eras: [], placements: [] };
    await props.onSave(input);
    expect(mocks.save).toHaveBeenCalledWith(ids.ifWork, input);
  });

  it('passes only serializable values to the client board', async () => {
    const board = findBoard(await call(ids.rootWork));
    const props = board?.props as { initialState: unknown };
    expect(JSON.parse(JSON.stringify(props.initialState))).toEqual(props.initialState);
  });
});

describe('EraBoard save handling (source)', () => {
  const src = readFileSync(resolve(__dirname, '../../components/world-tree/era-board.tsx'), 'utf8');

  it('shows the success toast and canonical state only after a successful result', () => {
    const failBranch = src.indexOf('if (!result.ok)');
    const success = src.indexOf('toast.success(TIMELINE_COPY.saved)');
    const canonical = src.indexOf('result.eras.map');
    expect(failBranch).toBeGreaterThan(-1);
    expect(success).toBeGreaterThan(failBranch);
    expect(canonical).toBeGreaterThan(failBranch);
    expect(src.slice(failBranch, success)).toContain('return;');
  });

  it('uses the shared movePlacement transition for buttons and drops', () => {
    expect(src).toContain('movePlacement(draft');
    expect(src).not.toMatch(/arrayMove/);
  });
});
