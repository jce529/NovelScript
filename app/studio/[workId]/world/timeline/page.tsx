import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getWorldTreeOwnerState, type WorldTreeOwnerState } from '@/lib/world-tree/owner';
import { EraBoard, type EraBoardBranchTab, type EraBoardWorkInfo } from '@/components/world-tree/era-board';
import { saveWorldTimelineAction } from '@/app/studio/[workId]/world/actions';

/**
 * Owner timeline page (18-08). The owner is always the session user. `branchId` may only pick a
 * branch listed in this world's owner tree whose work the user owns; anything else is notFound.
 * Only serializable DTOs reach the client board; save is the session-derived Server Action bound
 * to the edited branch's work (the action re-derives branch, baseline and ownership itself).
 * WTREE-09 pre-fork lock-by-reader-progress is out of scope.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function WorldTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { workId } = await params;
  const query = await searchParams;
  const rawBranch = Array.isArray(query.branchId) ? query.branchId[0] : query.branchId;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const own = await getWorldTreeOwnerState(supabase, { ownerId: user.id, workId });
  if (!own.ok) {
    if (own.code === 'unavailable') return <p role="alert" className="text-sm text-muted-foreground">{own.error}</p>;
    notFound();
  }

  const projection = own.state.tree.status === 'ok' ? own.state.tree.projection : null;
  let state: WorldTreeOwnerState = own.state;
  let targetWorkId = workId;

  if (rawBranch !== undefined) {
    if (!UUID_RE.test(rawBranch)) notFound();
    const target = projection?.branches.find((b) => b.branchId === rawBranch);
    if (!target) notFound();
    if (target.workId !== workId) {
      const other = await getWorldTreeOwnerState(supabase, { ownerId: user.id, workId: target.workId });
      if (!other.ok) notFound();
      state = other.state;
      targetWorkId = target.workId;
    }
  }

  if (!state.timeline || !state.branch) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">세계관 연표</h1>
        <p className="text-sm text-muted-foreground">아직 세계수가 없어요. 세계수를 시작하면 연표를 편집할 수 있어요.</p>
      </div>
    );
  }

  const works: Record<string, EraBoardWorkInfo> = {};
  for (const b of projection?.branches ?? []) works[b.workId] = { title: b.title, kind: b.kind };

  const activeBranchId = state.branch.id;
  let branchNo = 0;
  const tabs: EraBoardBranchTab[] = (projection?.branches ?? []).map((b) => {
    const label = b.kind === 'trunk' ? `본가지 (${b.title})` : `가지 ${String.fromCharCode(65 + branchNo++)} (${b.title})`;
    return {
      branchId: b.branchId,
      label,
      href: `/studio/${workId}/world/timeline?branchId=${b.branchId}`,
      active: b.branchId === activeBranchId,
    };
  });

  const initialState = { draft: state.timeline.draft, baseline: state.timeline.baseline, works, tabs };

  return (
    <EraBoard
      key={`${activeBranchId}:${JSON.stringify(state.timeline.draft)}`}
      initialState={initialState}
      onSave={saveWorldTimelineAction.bind(null, targetWorkId)}
    />
  );
}
