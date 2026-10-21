import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getWorldTree } from '@/lib/world-tree/queries';
import { loadWorldTreePopularity, type WorldTreePopularityResult } from '@/lib/world-tree/metric-adapter';
import { WORLD_TREE_UNAVAILABLE, type ReaderWorldTreeProjection } from '@/lib/world-tree/types';
import { ReaderWorldTreeClient } from '@/components/world-tree/world-tree-client';

/**
 * Reader world-tree entry (18-11): the 03-08 work detail `lore` tab and the standalone
 * /works/{workId}/world-tree page share this one loader and panel.
 *
 * Security boundary (fail closed):
 * - Only the server's reader projection ever reaches a reader surface. get_world_tree answers an
 *   owner/admin viewer with the full projection, so for them the loader asks again with
 *   p_reader_preview (the same DB reader projection); anything that is still not a reader
 *   projection is an error, never rendered.
 * - The work in the URL may be a branch: the RPC resolves its world/root on the server. Private
 *   ancestors are identity-free broken-branch stubs; this file never maps keys back to ids.
 * - Unpublished/draft/deleted/blinded entries are `unavailable` (same as a missing work).
 * - Fruit size comes from the single WTREE-08 temporary adapter (feed proxy, not completion).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const WORLD_TREE_TAB_COPY = Object.freeze({
  expand: '크게 보기',
  unavailable: '아직 세계수에 보일 작품이 없어요.',
  manage: '세계관 설정에서 전체 보기',
});

export type ReaderWorldTreeLoad =
  | {
      status: 'ok';
      projection: ReaderWorldTreeProjection;
      metricResult: WorldTreePopularityResult | null;
      /** The session user is the owner (studio link only; the projection is still the reader one). */
      viewerManages: boolean;
    }
  | { status: 'unavailable' }
  | { status: 'error' };

async function loadMetrics(supabase: SupabaseClient, projection: ReaderWorldTreeProjection): Promise<WorldTreePopularityResult | null> {
  try {
    return await loadWorldTreePopularity(supabase, projection.nodes);
  } catch {
    return null;
  }
}

/** Reader projection + metrics for one entry work. Never returns an owner/admin projection. */
export async function loadReaderWorldTree(supabase: SupabaseClient, workId: string): Promise<ReaderWorldTreeLoad> {
  if (typeof workId !== 'string' || !UUID_RE.test(workId)) return { status: 'unavailable' };

  const first = await getWorldTree(supabase, { workId });
  if (!first.ok) return { status: 'error' };
  if (first.status === 'unavailable') return { status: 'unavailable' };

  let projection: ReaderWorldTreeProjection;
  let viewerManages = false;
  if (first.mode === 'reader') {
    projection = first.projection;
  } else {
    // Owner/admin on a reader surface: re-ask the DB for its reader projection.
    const again = await getWorldTree(supabase, { workId, readerPreview: true });
    if (!again.ok) return { status: 'error' };
    if (again.status === 'unavailable') return { status: 'unavailable' };
    if (again.mode !== 'reader' || again.projection.audience !== 'reader') return { status: 'error' };
    projection = again.projection;
    viewerManages = first.mode === 'owner';
  }
  if (projection.audience !== 'reader') return { status: 'error' };

  const metricResult = await loadMetrics(supabase, projection);
  return { status: 'ok', projection, metricResult, viewerManages };
}

const linkClass =
  'inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted';

/** Presentational panel for a loaded result (shared by the tab and the standalone page). */
export function WorldTreeReaderPanel({ workId, load, expanded = false }: { workId: string; load: ReaderWorldTreeLoad; expanded?: boolean }) {
  if (load.status === 'unavailable') {
    return (
      <p role="status" className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        {WORLD_TREE_TAB_COPY.unavailable}
      </p>
    );
  }
  if (load.status === 'error') {
    return <ReaderWorldTreeClient projection={WORLD_TREE_UNAVAILABLE} metricResult={null} />;
  }
  return (
    <div className="flex flex-col gap-3" data-part="world-tree-tab">
      {!expanded || load.viewerManages ? (
        <div className="flex flex-wrap justify-end gap-2">
          {load.viewerManages ? (
            <Link href={`/studio/${workId}/world`} className={linkClass}>
              {WORLD_TREE_TAB_COPY.manage}
            </Link>
          ) : null}
          {!expanded ? (
            <Link href={`/works/${workId}/world-tree`} className={linkClass}>
              {WORLD_TREE_TAB_COPY.expand}
            </Link>
          ) : null}
        </div>
      ) : null}
      <ReaderWorldTreeClient projection={load.projection} metricResult={load.metricResult} />
    </div>
  );
}

/** 03-08 lore slot content: session client -> reader projection -> metric adapter -> view. */
export async function WorldTreeTab({ workId }: { workId: string }) {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const load = await loadReaderWorldTree(supabase, workId);
  return <WorldTreeReaderPanel workId={workId} load={load} />;
}
