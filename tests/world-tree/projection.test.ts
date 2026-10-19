import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWorldTree, getWorldTreeMetricBaseline, WORLD_TREE_QUERY_COPY } from '@/lib/world-tree/queries';
import { READER_FORBIDDEN_FIELDS, type ReaderWorldTreeProjection } from '@/lib/world-tree/types';
import {
  ROOT_TITLE,
  allFixtureUuids,
  ids,
  ownerTree,
  readerConsecutiveStubTree,
  readerNormalTree,
  readerPrivateMiddleTree,
  readerPrivateRootTree,
  readerRepublishedTree,
} from './fixtures';

/**
 * 18-04 Task 3: strict domain wrapper over get_world_tree / get_world_tree_metric_baseline.
 * The RPC is faked; the projection itself is built by 0036 (DB proof in 18-12).
 */
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };

function client(result: RpcResult | (() => Promise<RpcResult>)) {
  const rpc = vi.fn(async () => (typeof result === 'function' ? result() : result));
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}
const ok = (data: unknown): RpcResult => ({ data, error: null });
const clone = <T>(v: T): T => structuredClone(v);
const workId = ids.ifWork;

async function reader(data: unknown, readerPreview = false) {
  const { supabase } = client(ok(data));
  return getWorldTree(supabase, { workId, readerPreview });
}
async function expectRejected(data: unknown, readerPreview = false) {
  const result = await reader(data, readerPreview);
  expect(result).toMatchObject({ ok: false, code: 'invalid_response', retryable: false });
  expect(result).not.toHaveProperty('projection');
  return result;
}

describe('getWorldTree: call contract', () => {
  it('sends only the whitelisted RPC arguments through the caller session client', async () => {
    const { supabase, rpc } = client(ok(readerNormalTree));
    await getWorldTree(supabase, { workId, readerPreview: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_world_tree', { p_work_id: workId, p_reader_preview: true });
    await getWorldTree(supabase, { workId });
    expect(rpc).toHaveBeenLastCalledWith('get_world_tree', { p_work_id: workId, p_reader_preview: false });
  });

  it('rejects a malformed work id without calling the RPC', async () => {
    const { supabase, rpc } = client(ok(readerNormalTree));
    const result = await getWorldTree(supabase, { workId: 'not-a-uuid' });
    expect(result).toEqual({ ok: false, code: 'invalid_input', retryable: false, error: WORLD_TREE_QUERY_COPY.invalidInput });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('getWorldTree: reader projections', () => {
  it.each([
    ['normal tree', readerNormalTree],
    ['private root stub', readerPrivateRootTree],
    ['private middle stub', readerPrivateMiddleTree],
    ['consecutive stubs', readerConsecutiveStubTree],
    ['republished root', readerRepublishedTree],
  ])('accepts the %s and returns it unchanged as mode=reader', async (_name, tree) => {
    const result = await reader(clone(tree));
    expect(result).toEqual({ ok: true, status: 'ok', mode: 'reader', projection: tree });
  });

  it('keeps a published child attached to its stub and consecutive stubs chained', async () => {
    const r1 = await reader(clone(readerPrivateRootTree));
    if (!r1.ok || r1.status !== 'ok' || r1.mode !== 'reader') throw new Error('expected reader');
    expect(r1.projection.nodes.map((n) => [n.nodeKey, n.nodeType, n.parentNodeKey])).toEqual([
      ['n0', 'broken', null], ['n1', 'work', 'n0'],
    ]);
    const r2 = await reader(clone(readerConsecutiveStubTree));
    if (!r2.ok || r2.status !== 'ok' || r2.mode !== 'reader') throw new Error('expected reader');
    expect(r2.projection.nodes.map((n) => [n.nodeKey, n.parentNodeKey])).toEqual([['n0', null], ['n1', 'n0'], ['n2', 'n1']]);
  });

  it('restores a republished root as a normal work node', async () => {
    const result = await reader(clone(readerRepublishedTree));
    if (!result.ok || result.status !== 'ok' || result.mode !== 'reader') throw new Error('expected reader');
    expect(result.projection.nodes[0]).toMatchObject({ nodeType: 'work', nodeKey: 'n0', title: ROOT_TITLE });
  });

  it('preserves the server sibling order (no client re-sorting)', async () => {
    const tree = clone(readerNormalTree);
    tree.nodes = [tree.nodes[0], tree.nodes[2], tree.nodes[1]];
    const result = await reader(tree);
    if (!result.ok || result.status !== 'ok' || result.mode !== 'reader') throw new Error('expected reader');
    expect(result.projection.nodes.map((n) => n.nodeKey)).toEqual(['n0', 'n2', 'n1']);
  });

  it('accepts a "세계수" fallback header', async () => {
    const tree = clone(readerPrivateRootTree);
    tree.header = { title: '세계수' };
    expect((await reader(tree)).ok).toBe(true);
  });

  it('maps unavailable to a non-error unavailable state', async () => {
    expect(await reader({ status: 'unavailable' })).toEqual({ ok: true, status: 'unavailable' });
  });
});

describe('getWorldTree: forbidden reader data is rejected (fail closed)', () => {
  const stubTree = () => clone(readerPrivateRootTree) as ReaderWorldTreeProjection & Record<string, unknown>;
  const asObj = (v: unknown) => v as Record<string, unknown>;

  it.each(READER_FORBIDDEN_FIELDS.map((f) => [f]))('rejects "%s" on a stub, a work node, an era or the top level', async (field) => {
    for (const target of ['stub', 'work', 'era', 'top'] as const) {
      const tree = stubTree();
      const where = target === 'stub' ? tree.nodes[0] : target === 'work' ? tree.nodes[1] : target === 'era' ? tree.eras[0] : tree;
      asObj(where)[field] = target === 'top' ? ids.rootWork : 'x';
      await expectRejected(tree);
    }
  });

  it.each([
    ['workId', ids.rootWork], ['title', ROOT_TITLE], ['coverImageUrl', 'https://x/cover.png'], ['chapters', []],
    ['metrics', { totalViews: 1, likeCount: 0, ctr: 0 }], ['diffCount', 2], ['kind', 'trunk'], ['placement', null],
    ['eraName', '고대'], ['forkEraId', ids.eraMedieval],
  ])('rejects a stub carrying %s', async (field, value) => {
    const tree = stubTree();
    asObj(tree.nodes[0])[field] = value;
    await expectRejected(tree);
  });

  it('rejects a stub keyed by a DB UUID or a parent link outside the response', async () => {
    const t1 = stubTree();
    asObj(t1.nodes[0]).nodeKey = ids.rootBranch;
    asObj(t1.nodes[1]).parentNodeKey = ids.rootBranch;
    await expectRejected(t1);
    const t2 = stubTree();
    asObj(t2.nodes[1]).parentNodeKey = 'n9';
    await expectRejected(t2);
  });

  it('rejects a private parent UUID or name smuggled into any string value', async () => {
    const t1 = stubTree();
    t1.eras[0] = { ...t1.eras[0], name: `고대 ${ids.rootWork}` };
    await expectRejected(t1);
    const t2 = stubTree();
    t2.header = { title: ROOT_TITLE };
    await expectRejected(t2);
    const t3 = stubTree();
    t3.focusNodeKey = 'n0';
    await expectRejected(t3);
  });

  it('rejects eras on a stub line and placements pointing at an era outside the response', async () => {
    const t1 = stubTree();
    t1.eras = [...t1.eras, { eraKey: 'e9', nodeKey: 'n0', position: 0, name: '본작 시대', yearLabel: null, inherited: false }];
    await expectRejected(t1);
    const t2 = clone(readerNormalTree);
    t2.nodes[1] = { ...t2.nodes[1], placement: { eraKey: 'e9', orderIndex: 0, concurrentWithPrev: false } } as typeof t2.nodes[1];
    await expectRejected(t2);
  });

  it('never leaks any fixture UUID other than visible work ids in an accepted reader payload', async () => {
    for (const tree of [readerPrivateRootTree, readerPrivateMiddleTree, readerConsecutiveStubTree]) {
      const result = await reader(clone(tree));
      if (!result.ok || result.status !== 'ok' || result.mode !== 'reader') throw new Error('expected reader');
      const visibleIds = new Set(result.projection.nodes.flatMap((n) => (n.nodeType === 'work' ? [n.workId] : [])));
      const text = JSON.stringify(result);
      for (const id of allFixtureUuids.filter((u) => !visibleIds.has(u))) expect(text).not.toContain(id);
    }
  });

  it('rejects an owner/admin payload when a reader preview was requested', async () => {
    await expectRejected(clone(ownerTree), true);
    await expectRejected({ ...clone(ownerTree), audience: 'admin' }, true);
  });
});

describe('getWorldTree: owner/admin full projection (separate contract)', () => {
  it('accepts the owner projection as mode=owner and an admin one as mode=admin', async () => {
    expect(await reader(clone(ownerTree))).toEqual({ ok: true, status: 'ok', mode: 'owner', projection: ownerTree });
    const admin = { ...clone(ownerTree), audience: 'admin' as const };
    expect(await reader(admin)).toEqual({ ok: true, status: 'ok', mode: 'admin', projection: admin });
  });

  it('rejects setting content or source refs in an owner payload and dangling ancestry', async () => {
    for (const field of ['content', 'sourceNodeId', 'documentName']) {
      const t = clone(ownerTree) as unknown as { branches: Record<string, unknown>[] };
      t.branches[0][field] = 'x';
      await expectRejected(t);
    }
    const t = clone(ownerTree);
    t.branches[1] = { ...t.branches[1], parentBranchId: ids.draftBranch };
    await expectRejected(t);
  });

  it('rejects an unknown audience instead of guessing a mode', async () => {
    await expectRejected({ ...clone(readerNormalTree), audience: 'owner' });
    await expectRejected({ ...clone(ownerTree), audience: 'reader' });
    await expectRejected({ ...clone(ownerTree), audience: 'superuser' });
  });
});

describe('getWorldTree: failures are typed, never an empty success tree', () => {
  it('returns a retryable failure on an RPC error', async () => {
    const { supabase } = client({ data: null, error: { message: 'connection reset', code: '08006' } });
    expect(await getWorldTree(supabase, { workId })).toEqual({
      ok: false, code: 'rpc_failed', retryable: true, error: WORLD_TREE_QUERY_COPY.unavailable,
    });
  });

  it('returns a retryable failure when the client throws', async () => {
    const { supabase } = client(async () => { throw new Error('fetch failed'); });
    expect(await getWorldTree(supabase, { workId })).toMatchObject({ ok: false, code: 'rpc_failed', retryable: true });
  });

  it.each([[null], [undefined], [[]], ['ok'], [{ status: 'ok' }], [{ status: 'unavailable', extra: 1 }]])(
    'closes a malformed payload %j as invalid_response', async (data) => {
      await expectRejected(data);
    });
});

describe('getWorldTreeMetricBaseline', () => {
  const baseline = { maxTotalViews: 900, maxLikeCount: 40, authorViewsExcludedSince: '2026-10-19T00:00:00+00:00' };

  it('calls the RPC without arguments and returns the strict baseline', async () => {
    const { supabase, rpc } = client(ok(baseline));
    expect(await getWorldTreeMetricBaseline(supabase)).toEqual({ ok: true, baseline });
    expect(rpc).toHaveBeenCalledWith('get_world_tree_metric_baseline');
  });

  it.each([
    [{ ...baseline, maxTotalViews: -1 }], [{ ...baseline, maxLikeCount: 1.5 }], [{ ...baseline, extra: true }],
    [{ ...baseline, authorViewsExcludedSince: 'yesterday' }], [null],
  ])('rejects a malformed baseline %j', async (data) => {
    const { supabase } = client(ok(data));
    expect(await getWorldTreeMetricBaseline(supabase)).toMatchObject({ ok: false, code: 'invalid_response', retryable: false });
  });

  it('returns a retryable failure on an RPC error', async () => {
    const { supabase } = client({ data: null, error: { message: 'timeout' } });
    expect(await getWorldTreeMetricBaseline(supabase)).toMatchObject({ ok: false, code: 'rpc_failed', retryable: true });
  });
});
