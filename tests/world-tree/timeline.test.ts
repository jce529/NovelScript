import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TIMELINE_COPY,
  addEra,
  draftFromTimeline,
  ensureWorldTree,
  movePlacement,
  removeEra,
  saveTimeline,
  setConcurrent,
  validateTimeline,
  type TimelineDraft,
} from '@/lib/world-tree/timeline';
import { WRITE_SUSPENDED_MESSAGE } from '@/lib/auth/write-access';
import type { Era, EraPlacement } from '@/lib/world-tree/types';
import { ids, ifBranch, ifEras, rootBranch } from './fixtures';

const u = (n: number) => `00000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`;
const fruitA = u(1);
const fruitB = u(2);
const newEra = u(3);

/** Trunk: 고대(root, fruitA concurrent), 중세(fruitB), 근대(empty). No memo on the trunk. */
const trunkEras: Era[] = [
  { id: ids.eraAncient, branchId: ids.rootBranch, sourceEraId: null, position: 0, name: '고대', yearLabel: '1~300년', memo: null, inherited: false, deletedAt: null },
  { id: ids.eraMedieval, branchId: ids.rootBranch, sourceEraId: null, position: 1, name: '중세', yearLabel: null, memo: null, inherited: false, deletedAt: null },
  { id: ids.eraModern, branchId: ids.rootBranch, sourceEraId: null, position: 2, name: '근대', yearLabel: null, memo: null, inherited: false, deletedAt: null },
];
const trunkPlacements: EraPlacement[] = [
  { id: u(10), branchId: ids.rootBranch, eraId: ids.eraAncient, workId: ids.rootWork, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
  { id: u(11), branchId: ids.rootBranch, eraId: ids.eraAncient, workId: fruitA, orderIndex: 1, concurrentWithPrev: true, relationLabel: '같은 시기' },
  { id: u(12), branchId: ids.rootBranch, eraId: ids.eraMedieval, workId: fruitB, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
];
/** If branch: 고대/중세 inherited (with copies), 왕의 귀환 independent with the If work. */
const ifPlacements: EraPlacement[] = [
  { id: u(20), branchId: ids.ifBranch, eraId: ids.ifEraAncient, workId: ids.rootWork, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
  { id: u(21), branchId: ids.ifBranch, eraId: ids.ifEraOwn, workId: ids.ifWork, orderIndex: 0, concurrentWithPrev: false, relationLabel: null },
];

const trunkBaseline = { eras: trunkEras, placements: trunkPlacements };
const ifBaseline = { eras: ifEras, placements: ifPlacements };
const trunk = (): TimelineDraft => draftFromTimeline(rootBranch, trunkEras, trunkPlacements);
const child = (): TimelineDraft => draftFromTimeline(ifBranch, ifEras, ifPlacements);

const inEra = (draft: TimelineDraft, eraId: string) =>
  draft.placements.filter((p) => p.eraId === eraId).sort((a, b) => a.orderIndex - b.orderIndex);
const codes = (result: ReturnType<typeof validateTimeline>) => (result.ok ? [] : result.issues.map((i) => i.code));

describe('draftFromTimeline', () => {
  it('drops deleted rows, sorts eras and keeps the branch identity', () => {
    const d = draftFromTimeline(rootBranch, [...trunkEras].reverse().concat({ ...trunkEras[0], id: u(99), position: 9, deletedAt: '2026-01-01T00:00:00Z' }), trunkPlacements);
    expect(d.branchId).toBe(ids.rootBranch);
    expect(d.branchKind).toBe('trunk');
    expect(d.branchWorkId).toBe(ids.rootWork);
    expect(d.eras.map((e) => e.id)).toEqual([ids.eraAncient, ids.eraMedieval, ids.eraModern]);
  });
});

describe('validateTimeline', () => {
  it('accepts the stored timeline and builds the typed save payload', () => {
    const result = validateTimeline(trunk(), trunkBaseline);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.p_branch_id).toBe(ids.rootBranch);
    expect(result.args.p_eras[0]).toEqual({ id: ids.eraAncient, position: 0, name: '고대', yearLabel: '1~300년', memo: null });
    expect(Object.keys(result.args.p_placements[0]).sort()).toEqual(['concurrentWithPrev', 'eraId', 'orderIndex', 'relationLabel', 'workId']);
  });

  it('requires a name and a dense order; an empty year label is allowed and normalised to null', () => {
    const d = trunk();
    d.eras[1] = { ...d.eras[1], name: '   ' };
    expect(codes(validateTimeline(d, trunkBaseline))).toContain('era_name_required');

    const gap = trunk();
    gap.eras[2] = { ...gap.eras[2], position: 5 };
    expect(codes(validateTimeline(gap, trunkBaseline))).toContain('era_order_invalid');

    const year = trunk();
    year.eras[0] = { ...year.eras[0], yearLabel: '  ' };
    const ok = validateTimeline(year, trunkBaseline);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.args.p_eras[0].yearLabel).toBeNull();
  });

  it('rejects a concurrent first work', () => {
    const d = trunk();
    d.placements = d.placements.map((p) => (p.workId === fruitB ? { ...p, concurrentWithPrev: true } : p));
    expect(codes(validateTimeline(d, trunkBaseline))).toContain('first_concurrent');
  });

  it('rejects a broken placement order, a missing era and a duplicate work', () => {
    const order = trunk();
    order.placements = order.placements.map((p) => (p.workId === fruitA ? { ...p, orderIndex: 3 } : p));
    expect(codes(validateTimeline(order, trunkBaseline))).toContain('placement_order_invalid');

    const missing = trunk();
    missing.placements = missing.placements.map((p) => (p.workId === fruitB ? { ...p, eraId: u(77) } : p));
    expect(codes(validateTimeline(missing, trunkBaseline))).toContain('placement_era_missing');

    const dup = trunk();
    dup.placements = [...dup.placements, { eraId: ids.eraModern, workId: fruitA, orderIndex: 0, concurrentWithPrev: false, relationLabel: null }];
    expect(codes(validateTimeline(dup, trunkBaseline))).toContain('duplicate_work');
  });

  it('rejects a memo on the trunk and on inherited eras, accepts it on an independent child era', () => {
    const root = trunk();
    root.eras[0] = { ...root.eras[0], memo: '본가지 메모' };
    expect(codes(validateTimeline(root, trunkBaseline))).toContain('memo_not_allowed');

    const inherited = child();
    inherited.eras[0] = { ...inherited.eras[0], memo: '고대 메모' };
    expect(codes(validateTimeline(inherited, ifBaseline))).toEqual(expect.arrayContaining(['memo_not_allowed']));

    const own = child();
    own.eras[2] = { ...own.eras[2], memo: '예: 본가지 3기 후반에 해당' };
    const result = validateTimeline(own, ifBaseline);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.args.p_eras[2].memo).toBe('예: 본가지 3기 후반에 해당');
  });

  it('rejects any change, omission or addition inside the inherited span', () => {
    const renamed = child();
    renamed.eras[1] = { ...renamed.eras[1], name: '바뀐 중세' };
    expect(codes(validateTimeline(renamed, ifBaseline))).toContain('inherited_locked');

    const omitted = child();
    omitted.eras = omitted.eras.filter((e) => e.id !== ids.ifEraAncient).map((e, i) => ({ ...e, position: i }));
    expect(codes(validateTimeline(omitted, ifBaseline))).toContain('inherited_locked');

    const dropped = child();
    dropped.placements = dropped.placements.filter((p) => p.eraId !== ids.ifEraAncient);
    expect(codes(validateTimeline(dropped, ifBaseline))).toContain('inherited_locked');

    const added = child();
    added.placements = [...added.placements, { eraId: ids.ifEraMedieval, workId: fruitA, orderIndex: 0, concurrentWithPrev: false, relationLabel: null }];
    expect(codes(validateTimeline(added, ifBaseline))).toContain('inherited_locked');

    const before = child();
    before.eras = [{ id: newEra, position: 0, name: '앞', yearLabel: null, memo: null, inherited: false },
      ...before.eras.map((e) => ({ ...e, position: e.position + 1 }))];
    expect(codes(validateTimeline(before, ifBaseline))).toContain('inherited_locked');
  });

  it('requires the branch work on an independent era', () => {
    const d = child();
    d.placements = d.placements.filter((p) => p.workId !== ids.ifWork);
    expect(codes(validateTimeline(d, ifBaseline))).toContain('branch_work_required');
  });

  it('rejects deleting an era that still holds a stored work or a live fork point', () => {
    const d = trunk();
    d.eras = d.eras.filter((e) => e.id !== ids.eraMedieval).map((e, i) => ({ ...e, position: i }));
    d.placements = d.placements.filter((p) => p.workId !== fruitB);
    expect(codes(validateTimeline(d, trunkBaseline))).toContain('era_not_empty');

    const empty = trunk();
    empty.eras = empty.eras.filter((e) => e.id !== ids.eraModern);
    expect(validateTimeline(empty, trunkBaseline).ok).toBe(true);
    expect(codes(validateTimeline(empty, { ...trunkBaseline, forkEraIds: [ids.eraModern] }))).toContain('fork_era_in_use');
  });

  it('is deterministic (same input -> same issues and payload)', () => {
    const d = trunk();
    d.eras[1] = { ...d.eras[1], name: '' };
    expect(validateTimeline(d, trunkBaseline)).toEqual(validateTimeline(structuredClone(d), trunkBaseline));
  });
});

describe('movePlacement (buttons and drag share one transition)', () => {
  it('moves to the next era, appends at the end and releases a broken concurrent link', () => {
    const result = movePlacement(trunk(), { workId: ids.rootWork, to: 'nextEra' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(inEra(result.draft, ids.eraAncient)).toEqual([expect.objectContaining({ workId: fruitA, orderIndex: 0, concurrentWithPrev: false })]);
    expect(inEra(result.draft, ids.eraMedieval).map((p) => [p.workId, p.orderIndex])).toEqual([[fruitB, 0], [ids.rootWork, 1]]);
    expect(result.released).toEqual([fruitA]);
    expect(validateTimeline(result.draft, trunkBaseline).ok).toBe(true);
  });

  it('a drop with the same target produces exactly the button result', () => {
    const viaButton = movePlacement(trunk(), { workId: ids.rootWork, to: 'nextEra' });
    const viaDrop = movePlacement(trunk(), { workId: ids.rootWork, to: { eraId: ids.eraMedieval, index: 1 } });
    expect(viaDrop).toEqual(viaButton);
  });

  it('moves up/down inside an era keeping dense order; concurrent never lands first', () => {
    const up = movePlacement(trunk(), { workId: fruitA, to: 'up' });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(inEra(up.draft, ids.eraAncient).map((p) => [p.workId, p.orderIndex, p.concurrentWithPrev])).toEqual([
      [fruitA, 0, false],
      [ids.rootWork, 1, false],
    ]);
    expect(up.released).toEqual([fruitA]);
  });

  it('refuses moves with no target', () => {
    expect(movePlacement(trunk(), { workId: ids.rootWork, to: 'prevEra' })).toMatchObject({ ok: false, reason: 'no_target' });
    expect(movePlacement(trunk(), { workId: ids.rootWork, to: 'up' })).toMatchObject({ ok: false, reason: 'no_target' });
    expect(movePlacement(trunk(), { workId: fruitA, to: 'down' })).toMatchObject({ ok: false, reason: 'no_target' });
    expect(movePlacement(trunk(), { workId: u(55), to: 'down' })).toMatchObject({ ok: false, reason: 'not_found' });
    expect(movePlacement(trunk(), { workId: fruitB, to: { eraId: u(77), index: 0 } })).toMatchObject({ ok: false, reason: 'no_target' });
  });

  it('never moves out of, into or inside the inherited span', () => {
    expect(movePlacement(child(), { workId: ids.rootWork, to: 'nextEra' })).toMatchObject({ ok: false, reason: 'inherited_locked' });
    expect(movePlacement(child(), { workId: ids.ifWork, to: 'prevEra' })).toMatchObject({ ok: false, reason: 'inherited_locked' });
    expect(movePlacement(child(), { workId: ids.ifWork, to: { eraId: ids.ifEraAncient, index: 0 } })).toMatchObject({ ok: false, reason: 'inherited_locked' });
  });

  it('does not mutate its input', () => {
    const d = trunk();
    const before = structuredClone(d);
    movePlacement(d, { workId: ids.rootWork, to: 'nextEra' });
    expect(d).toEqual(before);
  });
});

describe('setConcurrent', () => {
  it('sets and clears concurrency for a non-first work', () => {
    const off = setConcurrent(trunk(), fruitA, false);
    expect(off.ok && inEra(off.draft, ids.eraAncient)[1].concurrentWithPrev).toBe(false);
    const on = off.ok ? setConcurrent(off.draft, fruitA, true) : off;
    expect(on.ok && inEra(on.draft, ids.eraAncient)[1].concurrentWithPrev).toBe(true);
  });

  it('rejects the first work of an era with the UI copy, and inherited placements', () => {
    expect(setConcurrent(trunk(), ids.rootWork, true)).toMatchObject({ ok: false, reason: 'first_concurrent', message: TIMELINE_COPY.firstConcurrent });
    expect(setConcurrent(child(), ids.rootWork, false)).toMatchObject({ ok: false, reason: 'inherited_locked', message: TIMELINE_COPY.inheritedLocked });
    expect(setConcurrent(trunk(), u(55), true)).toMatchObject({ ok: false, reason: 'not_found' });
  });
});

describe('addEra / removeEra', () => {
  it('adds an independent era at the end with a caller-supplied id', () => {
    const result = addEra(child(), { id: newEra, name: '두 번째 독립 구간' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.eras.at(-1)).toEqual({ id: newEra, position: 3, name: '두 번째 독립 구간', yearLabel: null, memo: null, inherited: false });
  });

  it('removes only empty independent eras and re-densifies positions', () => {
    expect(removeEra(trunk(), ids.eraMedieval)).toMatchObject({ ok: false, reason: 'era_not_empty' });
    expect(removeEra(child(), ids.ifEraAncient)).toMatchObject({ ok: false, reason: 'inherited_locked' });
    const result = removeEra(trunk(), ids.eraModern);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.eras.map((e) => [e.id, e.position])).toEqual([[ids.eraAncient, 0], [ids.eraMedieval, 1]]);
  });
});

// ---------------------------------------------------------------------------
// Server save / ensure (RPC wrappers)
// ---------------------------------------------------------------------------

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

function fake(rpcImpl?: (fn: string, args: Record<string, unknown>) => RpcResult, writeAccess = { can_write: true, reason: 'ok', sanctioned_until: null as string | null }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === 'get_write_access') return { data: writeAccess, error: null };
    if (!rpcImpl) return { data: null, error: { message: 'unexpected rpc ' + fn } };
    return rpcImpl(fn, args);
  });
  const client = { rpc } as unknown as SupabaseClient;
  return { client, calls: () => calls.filter((c) => c.fn !== 'get_write_access') };
}

const savedOk = (draft: TimelineDraft): RpcResult => ({
  data: { branch_id: draft.branchId, eras: draft.eras.map((e) => ({ id: e.id, position: e.position })), placementCount: draft.placements.length },
  error: null,
});

describe('saveTimeline', () => {
  it('sends only the validated payload to save_world_timeline', async () => {
    const draft = trunk();
    const { client, calls } = fake(() => savedOk(draft));
    const result = await saveTimeline(client, { ownerId: ids.owner, draft, baseline: trunkBaseline });
    expect(result).toMatchObject({ ok: true, message: TIMELINE_COPY.saved });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].fn).toBe('save_world_timeline');
    expect(Object.keys(calls()[0].args).sort()).toEqual(['p_branch_id', 'p_eras', 'p_placements']);
  });

  it('never calls the RPC for an invalid draft or a bad owner id', async () => {
    const d = trunk();
    d.eras[0] = { ...d.eras[0], name: '' };
    const { client, calls } = fake(() => savedOk(d));
    expect(await saveTimeline(client, { ownerId: ids.owner, draft: d, baseline: trunkBaseline })).toMatchObject({ ok: false, code: 'invalid_timeline' });
    expect(await saveTimeline(client, { ownerId: 'nope', draft: trunk(), baseline: trunkBaseline })).toMatchObject({ ok: false, code: 'invalid_input' });
    expect(calls()).toHaveLength(0);
  });

  it('stops at the write gate (suspended writer)', async () => {
    const { client, calls } = fake(() => savedOk(trunk()), { can_write: false, reason: 'suspended', sanctioned_until: null });
    const result = await saveTimeline(client, { ownerId: ids.owner, draft: trunk(), baseline: trunkBaseline });
    expect(result).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(calls()).toHaveLength(0);
  });

  it('maps DB rule errors to typed failures; transient errors are retryable; no success on a bad payload', async () => {
    const cases: Array<[string, string, boolean]> = [
      ['world_timeline_inherited_locked', 'inherited_locked', false],
      ['world_timeline_first_concurrent', 'first_concurrent', false],
      ['world_timeline_memo_not_allowed', 'memo_not_allowed', false],
      ['world_timeline_duplicate_work', 'duplicate_work', false],
      ['world_timeline_era_not_empty', 'era_not_empty', false],
      ['world_timeline_fork_era_in_use', 'fork_era_in_use', false],
      ['world_tree_forbidden', 'forbidden', false],
      ['something odd', 'unavailable', true],
    ];
    for (const [message, code, retryable] of cases) {
      const { client } = fake(() => ({ data: null, error: { message, code: 'P0001' } }));
      expect(await saveTimeline(client, { ownerId: ids.owner, draft: trunk(), baseline: trunkBaseline })).toMatchObject({ ok: false, code, retryable });
    }
    const { client } = fake(() => ({ data: { branch_id: ids.rootBranch }, error: null }));
    expect(await saveTimeline(client, { ownerId: ids.owner, draft: trunk(), baseline: trunkBaseline })).toMatchObject({ ok: false, code: 'unavailable' });
  });
});

describe('ensureWorldTree', () => {
  it('calls ensure_world_tree after the write gate and parses the result', async () => {
    const { client, calls } = fake(() => ({ data: { branch_id: ids.rootBranch, root_work_id: ids.rootWork, created: true }, error: null }));
    expect(await ensureWorldTree(client, { ownerId: ids.owner, workId: ids.rootWork })).toEqual({
      ok: true, branchId: ids.rootBranch, rootWorkId: ids.rootWork, created: true });
    expect(calls()).toEqual([{ fn: 'ensure_world_tree', args: { p_work_id: ids.rootWork } }]);
  });

  it('fails closed on a malformed result or an error', async () => {
    const bad = fake(() => ({ data: { branch_id: 'x' }, error: null }));
    expect(await ensureWorldTree(bad.client, { ownerId: ids.owner, workId: ids.rootWork })).toMatchObject({ ok: false, code: 'unavailable' });
    const denied = fake(() => ({ data: null, error: { message: 'world_tree_forbidden' } }));
    expect(await ensureWorldTree(denied.client, { ownerId: ids.owner, workId: ids.rootWork })).toMatchObject({ ok: false, code: 'forbidden' });
  });
});
