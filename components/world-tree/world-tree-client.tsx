'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ensureWorldTreeAction, getReaderPreviewWithMetricsAction } from '@/app/studio/[workId]/world/actions';
import type { WorldTreePopularityResult } from '@/lib/world-tree/metric-adapter';
import type { ReaderWorldTreeProjection, WorldTreeResponse } from '@/lib/world-tree/types';
import type { WorldTreeStudioLinks } from '@/components/world-tree/world-tree-detail';
import { WorldTreeView, type WorldTreePreviewResult } from '@/components/world-tree/world-tree-view';

/**
 * Client wrappers that wire WorldTreeView (18-10) into routes (18-11). They only add the
 * callbacks a server component cannot pass: retry = router.refresh() (server re-projection) and
 * the owner's reader preview = a Server Action that re-asks the database for the reader
 * projection. No projection is ever filtered or re-shaped on the client.
 */

/** Reader surfaces: only a reader projection (or unavailable/null) is accepted. */
export function ReaderWorldTreeClient({
  projection,
  metricResult,
}: {
  projection: ReaderWorldTreeProjection | WorldTreeResponse | null;
  metricResult: WorldTreePopularityResult | null;
}) {
  const router = useRouter();
  return <WorldTreeView projection={projection} metricResult={metricResult} mode="reader" onRetry={() => router.refresh()} />;
}

/** Empty reader projection used when the owner's work itself is not reader-visible yet. */
const EMPTY_READER_PROJECTION: ReaderWorldTreeProjection = Object.freeze({
  status: 'ok',
  audience: 'reader',
  header: { title: '세계수' },
  focusNodeKey: '',
  eras: [],
  nodes: [],
}) as ReaderWorldTreeProjection;

export function OwnerWorldTreeClient({
  workId,
  projection,
  metricResult,
  studioLinks,
}: {
  workId: string;
  projection: WorldTreeResponse;
  metricResult: WorldTreePopularityResult | null;
  studioLinks: WorldTreeStudioLinks;
}) {
  const router = useRouter();
  const onReaderPreview = useCallback(async (): Promise<WorldTreePreviewResult> => {
    const result = await getReaderPreviewWithMetricsAction(workId);
    if (!result.ok) throw new Error(result.error);
    // Not reader-visible yet (no published chapter): readers see nothing of this world from here.
    if (result.status === 'unavailable') return { projection: EMPTY_READER_PROJECTION, metricResult: null };
    return { projection: result.projection, metricResult: result.metricResult };
  }, [workId]);

  return (
    <WorldTreeView
      projection={projection}
      metricResult={metricResult}
      mode="owner"
      onRetry={() => router.refresh()}
      onReaderPreview={onReaderPreview}
      studioLinks={studioLinks}
    />
  );
}

/** Owner-only trunk creation (18-07 ensureWorldTreeAction, idempotent ensure_world_tree RPC). */
export function EnsureWorldTreeButton({ workId }: { workId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ensureWorldTreeAction(workId);
      if (result.ok) router.refresh();
      else setError(result.error);
    } catch {
      setError('세계수를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="world-start" className="rounded-xl border bg-card p-4" data-part="ensure-world-tree">
      <h2 id="world-start" className="text-sm font-semibold">
        세계수 시작하기
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        이 작품을 본가지로 세계수와 첫 시대 구간을 만들어요. 연표 편집과 세계수 보기는 세계수를 만든 뒤에 쓸 수 있어요.
      </p>
      <Button type="button" className="mt-3 min-h-11" disabled={busy} onClick={() => void start()}>
        {busy ? '만드는 중…' : '세계수 만들기'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
