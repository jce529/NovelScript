import type { Ref } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { WORLD_TREE_ELIGIBILITY } from '@/lib/world-tree/eligibility';
import { STUB_STROKE_PX, branchProximity, fruitDiameter, strokeForNode } from '@/lib/world-tree/metrics';
import type { BranchKind, WorldTreeProjection } from '@/lib/world-tree/types';

/**
 * Selection model + detail panel shared by the SVG canvas and the list view (18-10).
 *
 * Reader entries are built only from the reader projection. A broken-branch stub entry never
 * carries a title, work id, parent id or metrics, so no component can render them by mistake.
 * WTREE-09 note: when a parent turns private the pre-fork lock follows the child's reader
 * progress; that lock/progress logic is intentionally NOT implemented here.
 */

export const STUB_LABEL = '비공개된 본작 자리';
export const STUB_KIND = '비공개된 작품 자리';
export const STUB_TITLE = '비공개된 가지';
export const STUB_BODY_PLACE = '원래 본작이 있었던 자리예요.';
export const STUB_BODY_CHILDREN = '이어진 작품은 계속 볼 수 있어요.';
export const BROKEN_BRANCH_LABEL = '부러진 가지';
export const OWNER_UNPUBLISHED_NOTICE = '독자에게는 이 자리가 ‘부러진 가지’로 보여요. 다시 발행하면 가지가 이어져요.';
export const SNAPSHOT_NOTICE = '분기 시점 스냅샷으로 고정돼요. 원작 설정이 바뀌어도 이 가지에는 반영되지 않아요.';

export const KIND_LABEL: Record<BranchKind, string> = {
  trunk: '본가지',
  if: 'If 가지',
  expand: '확장 가지',
};

export type PublishState = 'published' | 'unpublished';

export interface WorldTreeEntry {
  key: string;
  type: 'work' | 'broken';
  parentKey: string | null;
  /** null for stubs. */
  title: string | null;
  kind: BranchKind | null;
  /** null for stubs. */
  workId: string | null;
  /** Owner/admin view only; reader entries are always 'published'. */
  publish: PublishState | null;
  diffCount: number | null;
  /** 0..100 temporary popularity, null when unknown or for stubs. */
  score: number | null;
  eraName: string | null;
  concurrent: boolean;
  /** Only the real placement meta (owner view); never invented. */
  relationLabel: string | null;
  depth: number;
  visibleDescendants: number;
  proximity: number | null;
  stroke: number;
  diameter: number;
}

export interface WorldTreeEntries {
  byKey: Record<string, WorldTreeEntry>;
  /** Insertion order of the projection (not the display order; use layout.listOrder). */
  keys: string[];
  workCount: number;
  stubCount: number;
  defaultKey: string | null;
}

interface RawEntry {
  key: string;
  type: 'work' | 'broken';
  parentKey: string | null;
  title: string | null;
  kind: BranchKind | null;
  workId: string | null;
  publish: PublishState | null;
  diffCount: number | null;
  eraName: string | null;
  concurrent: boolean;
  relationLabel: string | null;
}

function rawFromProjection(projection: WorldTreeProjection): { raws: RawEntry[]; defaultKey: string } {
  if (projection.audience === 'reader') {
    const eraName = new Map(projection.eras.map((era) => [era.eraKey, era.name] as const));
    const raws: RawEntry[] = projection.nodes.map((node) =>
      node.nodeType === 'broken'
        ? {
            key: node.nodeKey,
            type: 'broken',
            parentKey: node.parentNodeKey,
            title: null,
            kind: null,
            workId: null,
            publish: null,
            diffCount: null,
            eraName: null,
            concurrent: false,
            relationLabel: null,
          }
        : {
            key: node.nodeKey,
            type: 'work',
            parentKey: node.parentNodeKey,
            title: node.title,
            kind: node.kind,
            workId: node.workId,
            publish: 'published',
            diffCount: node.diffCount,
            eraName: node.placement ? (eraName.get(node.placement.eraKey) ?? null) : null,
            concurrent: node.placement?.concurrentWithPrev ?? false,
            relationLabel: null,
          },
    );
    return { raws, defaultKey: projection.focusNodeKey };
  }
  const eraName = new Map(projection.eras.filter((era) => era.deletedAt === null).map((era) => [era.id, era.name] as const));
  const workByBranch = new Map(projection.branches.map((b) => [b.branchId, b.workId] as const));
  const first = new Map<string, (typeof projection.placements)[number]>();
  for (const pl of projection.placements) {
    const prev = first.get(pl.workId);
    if (!prev || pl.orderIndex < prev.orderIndex) first.set(pl.workId, pl);
  }
  const raws: RawEntry[] = projection.branches.map((b) => {
    const pl = first.get(b.workId);
    return {
      key: b.workId,
      type: 'work',
      parentKey: b.parentBranchId === null ? null : (workByBranch.get(b.parentBranchId) ?? b.parentBranchId),
      title: b.title,
      kind: b.kind,
      workId: b.workId,
      publish: b.readerVisible ? 'published' : 'unpublished',
      diffCount: b.diffCount,
      eraName: pl ? (eraName.get(pl.eraId) ?? null) : null,
      concurrent: pl?.concurrentWithPrev ?? false,
      relationLabel: pl?.relationLabel ?? null,
    };
  });
  return { raws, defaultKey: projection.focusWorkId };
}

/**
 * Builds the shared entry model. `scores` is keyed like the layout nodes (reader nodeKey /
 * owner workId). The stroke uses the eligibility minimum as the fork-time document baseline
 * because the projection carries no baseline count (a parent that could branch has at least that
 * many qualifying documents), so it is an upper-bound estimate of the real thickness.
 */
export function buildWorldTreeEntries(projection: WorldTreeProjection, scores: Record<string, number> | null): WorldTreeEntries {
  const { raws, defaultKey } = rawFromProjection(projection);
  const index = new Map(raws.map((r) => [r.key, r] as const));
  const childrenOf = new Map<string, string[]>();
  for (const raw of raws) {
    if (raw.parentKey === null) continue;
    const list = childrenOf.get(raw.parentKey) ?? [];
    list.push(raw.key);
    childrenOf.set(raw.parentKey, list);
  }
  const depthOf = (key: string): number => {
    let depth = 0;
    let cursor = index.get(key)?.parentKey ?? null;
    const seen = new Set<string>([key]);
    while (cursor !== null && index.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      depth += 1;
      cursor = index.get(cursor)?.parentKey ?? null;
    }
    return depth;
  };
  const descendants = (key: string): number => {
    let count = 0;
    const stack = [...(childrenOf.get(key) ?? [])];
    const seen = new Set<string>([key]);
    while (stack.length > 0) {
      const next = stack.pop() as string;
      if (seen.has(next)) continue;
      seen.add(next);
      if (index.get(next)?.type === 'work') count += 1;
      stack.push(...(childrenOf.get(next) ?? []));
    }
    return count;
  };

  const byKey: Record<string, WorldTreeEntry> = {};
  let workCount = 0;
  let stubCount = 0;
  for (const raw of raws) {
    if (raw.type === 'broken') {
      stubCount += 1;
      byKey[raw.key] = {
        ...raw,
        score: null,
        depth: depthOf(raw.key),
        visibleDescendants: 0,
        proximity: null,
        stroke: STUB_STROKE_PX,
        diameter: 44,
      };
      continue;
    }
    workCount += 1;
    const depth = depthOf(raw.key);
    const visibleDescendants = descendants(raw.key);
    const rawScore = scores ? scores[raw.key] : undefined;
    const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : scores ? 0 : null;
    const isBranch = raw.kind !== 'trunk' && raw.diffCount !== null;
    const proximity = isBranch
      ? branchProximity({
          baselineDocCount: WORLD_TREE_ELIGIBILITY.minSettingDocuments,
          modified: raw.diffCount as number,
          deleted: 0,
          added: 0,
          depth,
        })
      : null;
    byKey[raw.key] = {
      ...raw,
      score,
      depth,
      visibleDescendants,
      proximity,
      stroke: strokeForNode({
        nodeType: 'work',
        proximity: {
          baselineDocCount: WORLD_TREE_ELIGIBILITY.minSettingDocuments,
          modified: isBranch ? (raw.diffCount as number) : 0,
          deleted: 0,
          added: 0,
          depth,
        },
        visibleDescendantCount: visibleDescendants,
      }),
      diameter: fruitDiameter(score ?? 0),
    };
  }
  return {
    byKey,
    keys: raws.map((r) => r.key),
    workCount,
    stubCount,
    defaultKey: byKey[defaultKey] ? defaultKey : (raws[0]?.key ?? null),
  };
}

/** Tick labels for the era scale: first non-null era name per layout column. */
export function columnLabels(entries: WorldTreeEntries, nodeColumns: Record<string, number>): Record<number, string> {
  const labels: Record<number, string> = {};
  for (const key of entries.keys) {
    const entry = entries.byKey[key];
    const col = nodeColumns[key];
    if (entry.type !== 'work' || !entry.eraName || col === undefined) continue;
    if (labels[col] === undefined) labels[col] = entry.eraName;
  }
  return labels;
}

export function entryAriaLabel(entry: WorldTreeEntry): string {
  if (entry.type === 'broken') return STUB_LABEL;
  const parts = [entry.title ?? '', entry.kind ? KIND_LABEL[entry.kind] : ''];
  if (entry.eraName) parts.push(entry.eraName);
  if (entry.concurrent) parts.push('동시 진행');
  if (entry.publish === 'unpublished') parts.push('미발행');
  return parts.filter(Boolean).join(', ');
}

export function publishChip(entry: WorldTreeEntry) {
  if (entry.publish !== 'unpublished') return null;
  return <Badge variant="outline">미발행</Badge>;
}

export interface WorldTreeStudioLinks {
  timelineHref: string;
  branchHref: string;
}

export interface WorldTreeDetailProps {
  entry: WorldTreeEntry | null;
  entries: WorldTreeEntries;
  audience: 'reader' | 'owner';
  studioLinks?: WorldTreeStudioLinks;
  titleRef?: Ref<HTMLHeadingElement>;
  popularityUnavailable?: boolean;
  className?: string;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}

function popularityText(entry: WorldTreeEntry, unavailable: boolean | undefined): string {
  if (unavailable || entry.score === null) return '불러오지 못했어요';
  return `${Math.round(entry.score)}점 (임시 지수)`;
}

export function WorldTreeDetail({ entry, entries, audience, studioLinks, titleRef, popularityUnavailable, className }: WorldTreeDetailProps) {
  if (!entry) {
    return (
      <section aria-label="세계수 상세" className={className}>
        <h2 ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          열매나 가지를 눌러 보세요
        </h2>
        <p className="text-xs text-muted-foreground">선택하면 작품과 가지의 자세한 정보를 볼 수 있어요.</p>
      </section>
    );
  }

  if (entry.type === 'broken') {
    return (
      <section aria-labelledby="wt-detail-title" className={className} data-selected-type="broken">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{STUB_KIND}</span>
          <Badge variant="outline">비공개</Badge>
        </div>
        <h2 id="wt-detail-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold leading-snug outline-none">
          {STUB_TITLE}
        </h2>
        <p className="text-sm leading-relaxed">
          {STUB_BODY_PLACE} {STUB_BODY_CHILDREN}
        </p>
      </section>
    );
  }

  const kind = entry.kind as BranchKind;
  const isTrunk = kind === 'trunk';
  const seriesChip = entry.relationLabel;
  const branchCount = Object.values(entries.byKey).filter((e) => e.type === 'work' && e.kind !== 'trunk').length;

  return (
    <section aria-labelledby="wt-detail-title" className={className} data-selected-type="work">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{KIND_LABEL[kind]}</span>
        {seriesChip ? <Badge variant="secondary">{seriesChip}</Badge> : null}
        {entry.concurrent ? <Badge variant="secondary">동시 진행</Badge> : null}
        {publishChip(entry)}
      </div>
      <h2 id="wt-detail-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold leading-snug outline-none">
        {entry.title}
      </h2>
      {audience === 'owner' && entry.publish === 'unpublished' ? (
        <p className="text-xs text-muted-foreground">{OWNER_UNPUBLISHED_NOTICE}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2">
        <Fact label="세계관 내 시점" value={entry.eraName ?? '시점 미정'} />
        <Fact label="속한 가지" value={KIND_LABEL[kind]} />
        <Fact label="인기" value={popularityText(entry, popularityUnavailable)} />
        <Fact label="연재 상태" value={entry.publish === 'unpublished' ? '미발행' : '발행됨'} />
      </dl>

      {isTrunk ? (
        <p className="text-sm">
          {audience === 'owner' ? '열매' : '공개된 열매'} {entries.workCount}개 · 잔가지 {branchCount}개
          {branchCount === 0 ? <span className="block text-xs text-muted-foreground">아직 갈라진 가지가 없어요</span> : null}
        </p>
      ) : (
        <div className="flex flex-col gap-2" data-part="branch">
          <h3 className="text-xs font-semibold text-muted-foreground">가지</h3>
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="종류" value={KIND_LABEL[kind]} />
            <Fact
              label="본가지와의 근접도"
              value={entry.proximity === null ? '집계 없음' : `${Math.round(entry.proximity * 100)}% (추정)`}
            />
            <Fact label="변경한 설정 문서" value={entry.diffCount === null ? '집계 없음' : `${entry.diffCount}건`} />
            <Fact label="굵기" value={`${entry.stroke.toFixed(1)}px`} />
          </dl>
          <Badge variant="outline" className="h-auto whitespace-normal">
            스냅샷 고정
          </Badge>
          <p className="text-xs text-muted-foreground">{SNAPSHOT_NOTICE}</p>
        </div>
      )}

      {entry.workId ? (
        <Link
          href={`/works/${entry.workId}`}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          작품 보러 가기
        </Link>
      ) : null}

      {audience === 'owner' && studioLinks ? (
        <div className="flex flex-wrap gap-2" data-part="owner-actions">
          <Link
            href={studioLinks.timelineHref}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            연표 편집
          </Link>
          <Link
            href={studioLinks.branchHref}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            이 세계관에서 가지 치기
          </Link>
        </div>
      ) : null}
    </section>
  );
}
