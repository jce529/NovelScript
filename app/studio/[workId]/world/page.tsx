import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getOwnedBranch, getWorldTreeOwnerState, type WorldTreeOwnerState } from '@/lib/world-tree/owner';
import { loadWorldTreePopularity, type WorldTreePopularityResult } from '@/lib/world-tree/metric-adapter';
import { WORLD_TREE_UNAVAILABLE, type ChildBranchKind } from '@/lib/world-tree/types';
import { WorldSettings } from '@/components/world-tree/world-settings';
import { EnsureWorldTreeButton, OwnerWorldTreeClient } from '@/components/world-tree/world-tree-client';

/**
 * Owner world settings page (18-11): assembles the 18-07 owner state, the 18-09 WorldSettings /
 * BranchWizard and the 18-10 WorldTreeView (owner projection + reader preview).
 *
 * - The owner is always the session user. Someone else's work (or a missing one) is notFound and
 *   nothing is created for it.
 * - Rendering never writes. A work without a tree gets an owner-only "세계수 만들기" trigger that
 *   calls the session-checked ensureWorldTreeAction (idempotent ensure_world_tree RPC).
 * - `?draft=` is never trusted: it must be a UUID naming a live draft branch the user owns whose
 *   parent branch is this work's branch. Anything else is notFound.
 * - Eligibility is the server summary as-is (a failed lookup stays a failure, never eligible).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResumeDraft = { draftWorkId: string; kind: ChildBranchKind; requestId: string };

/** Validates ?draft= on the server. 'invalid' = notFound; 'unavailable' = transient lookup failure. */
async function resolveResumeDraft(
  supabase: SupabaseClient,
  ownerId: string,
  workId: string,
  raw: string,
): Promise<ResumeDraft | 'invalid' | 'unavailable'> {
  if (!UUID_RE.test(raw)) return 'invalid';
  const found = await getOwnedBranch(supabase, { ownerId, workId: raw });
  if (!found.ok) return found.code === 'unavailable' ? 'unavailable' : 'invalid';
  const draft = found.branch;
  if (!draft || draft.workId !== raw || draft.ownerId !== ownerId) return 'invalid';
  if (draft.status !== 'draft' || draft.kind === 'trunk' || !draft.parentBranchId || !draft.requestId) return 'invalid';

  const parent = await getOwnedBranch(supabase, { ownerId, branchId: draft.parentBranchId });
  if (!parent.ok) return parent.code === 'unavailable' ? 'unavailable' : 'invalid';
  if (!parent.branch || parent.branch.workId !== workId || parent.branch.rootWorkId !== draft.rootWorkId) return 'invalid';
  return { draftWorkId: raw, kind: draft.kind, requestId: draft.requestId };
}

async function ownerMetrics(supabase: SupabaseClient, state: WorldTreeOwnerState): Promise<WorldTreePopularityResult | null> {
  if (state.tree.status !== 'ok') return null;
  // Owner projection nodes are keyed by workId (18-10 buildWorldTreeEntries).
  const nodes = state.tree.projection.branches.map((b) => ({ nodeType: 'work' as const, nodeKey: b.workId, metrics: b.metrics }));
  try {
    return await loadWorldTreePopularity(supabase, nodes);
  } catch {
    return null;
  }
}

function Unavailable({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export default async function WorldSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { workId } = await params;
  const query = await searchParams;
  if (!UUID_RE.test(workId)) notFound();
  const rawDraft = Array.isArray(query.draft) ? query.draft[0] : query.draft;

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const own = await getWorldTreeOwnerState(supabase, { ownerId: user.id, workId });
  if (!own.ok) {
    if (own.code === 'unavailable') return <Unavailable message={own.error} />;
    notFound();
  }
  const state = own.state;

  let resumeDraft: ResumeDraft | null = null;
  if (rawDraft !== undefined) {
    const resolved = await resolveResumeDraft(supabase, user.id, workId, rawDraft);
    if (resolved === 'invalid') notFound();
    if (resolved === 'unavailable') return <Unavailable message="가지 초안을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />;
    resumeDraft = resolved;
  }

  const timelineHref = `/studio/${workId}/world/timeline`;
  const studioLinks = { timelineHref, branchHref: `/studio/${workId}/world#world-branching` };

  let ownerTreeSlot: ReactNode = undefined;
  if (state.tree.status === 'ok') {
    const metricResult = await ownerMetrics(supabase, state);
    ownerTreeSlot = <OwnerWorldTreeClient workId={workId} projection={state.tree.projection} metricResult={metricResult} studioLinks={studioLinks} />;
  } else if (state.tree.status === 'error') {
    ownerTreeSlot = <OwnerWorldTreeClient workId={workId} projection={WORLD_TREE_UNAVAILABLE} metricResult={null} studioLinks={studioLinks} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {state.branch === null && state.draft === null ? <EnsureWorldTreeButton workId={workId} /> : null}
      <WorldSettings
        ownerState={state}
        ownerTreeSlot={ownerTreeSlot}
        resumeDraft={resumeDraft}
        timelineHref={timelineHref}
        publishHref={`/studio/${workId}/chapters`}
      />
    </div>
  );
}
