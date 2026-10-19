'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { GripVertical, Lock } from 'lucide-react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  TIMELINE_COPY, addEra, movePlacement, removeEra, setConcurrent, validateTimeline,
  type MoveTarget, type TimelineBaseline, type TimelineDraft, type TimelineIssue, type TransitionFailure,
} from '@/lib/world-tree/timeline';
import type { BranchKind } from '@/lib/world-tree/types';
import type { SaveWorldTimelineActionResult, SaveWorldTimelineActionInput } from '@/app/studio/[workId]/world/actions';

/**
 * Desktop timeline editor (18-08, WTREE-01/02/06). Serializable props only. Drag and the
 * prev/next/up/down buttons call the same lib/world-tree/timeline movePlacement transition;
 * the server action stays the authority, and a failed save keeps the local edit state.
 */

export interface EraBoardWorkInfo {
  title: string;
  kind: BranchKind;
}

export interface EraBoardBranchTab {
  branchId: string;
  label: string;
  href: string;
  active: boolean;
}

export interface EraBoardInitialState {
  draft: TimelineDraft;
  baseline: TimelineBaseline;
  /** workId -> display info (from the owner tree projection; missing entries fall back). */
  works: Record<string, EraBoardWorkInfo>;
  tabs: EraBoardBranchTab[];
}

export interface EraBoardProps {
  initialState: EraBoardInitialState;
  onSave: (input: SaveWorldTimelineActionInput) => Promise<SaveWorldTimelineActionResult>;
}

const KIND_LABEL: Record<BranchKind, string> = { trunk: '본가지', if: 'If', expand: '확장' };
const FOOTER_NOTE =
  '연표를 비교하고 싶을 때는 세계수 보기에서 가지의 분기점을 기준으로 이어서 봐요. 연표가 가지마다 독립이라 구간 이름이 같아도 가지끼리 시점이 일치한다고 보장하지 않아요.';

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function WorkCard({
  workId, info, locked, selected, concurrent, first, onSelect,
}: {
  workId: string; info: EraBoardWorkInfo | undefined; locked: boolean; selected: boolean;
  concurrent: boolean; first: boolean; onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workId, disabled: locked });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid="era-work-card"
      data-selected={selected ? 'true' : undefined}
      className={`flex items-center gap-2 rounded-md border bg-secondary px-2 py-2 ${selected ? 'ring-2 ring-primary' : ''} ${locked ? 'opacity-70' : ''}`}
    >
      {locked ? (
        <Lock size={14} aria-hidden className="text-muted-foreground" />
      ) : (
        <span
          {...attributes}
          {...listeners}
          aria-label="끌어서 이동 (키보드: 스페이스 후 방향키)"
          className={`cursor-grab ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <GripVertical size={16} />
        </span>
      )}
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm"
        aria-pressed={selected}
        onClick={onSelect}
      >
        {info?.title ?? '작품'}
      </button>
      {info && <Badge variant="outline">{KIND_LABEL[info.kind]}</Badge>}
      {concurrent && !first && <Badge>동시 진행</Badge>}
      {locked && <span className="sr-only">{TIMELINE_COPY.inheritedLocked}</span>}
    </li>
  );
}

function EraDrop({ eraId, children }: { eraId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `era:${eraId}` });
  return (
    <ul ref={setNodeRef} className={`flex min-h-16 flex-col gap-2 rounded-md p-1 ${isOver ? 'bg-primary/10' : ''}`}>
      {children}
    </ul>
  );
}

export function EraBoard({ initialState, onSave }: EraBoardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<TimelineDraft>(initialState.draft);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<TimelineIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { baseline, works, tabs } = initialState;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const eras = useMemo(() => [...draft.eras].sort((a, b) => a.position - b.position), [draft.eras]);
  const lists = useMemo(() => {
    const map = new Map<string, typeof draft.placements>(eras.map((e) => [e.id, []]));
    const sorted = [...draft.placements].sort((a, b) => a.orderIndex - b.orderIndex);
    for (const p of sorted) map.get(p.eraId)?.push(p);
    return map;
  }, [eras, draft.placements]);

  const notice = useCallback((text: string) => {
    setMessage(text);
    toast.error(text);
  }, []);

  const apply = useCallback((result: { ok: true; draft: TimelineDraft } | TransitionFailure) => {
    if (!result.ok) {
      notice(result.message);
      return false;
    }
    setDraft(result.draft);
    setDirty(true);
    setMessage(null);
    setIssues([]);
    setError(null);
    return true;
  }, [notice]);

  const move = useCallback((workId: string, to: MoveTarget) => {
    // Same transition for buttons and drops.
    const result = movePlacement(draft, { workId, to });
    if (apply(result) && result.ok && result.released.length > 0) {
      toast.message(TIMELINE_COPY.firstConcurrent);
    }
  }, [draft, apply]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const workId = String(active.id);
    const overId = String(over.id);
    let eraId: string;
    let index: number;
    if (overId.startsWith('era:')) {
      eraId = overId.slice(4);
      index = Number.MAX_SAFE_INTEGER;
    } else {
      const overPlacement = draft.placements.find((p) => p.workId === overId);
      if (!overPlacement) return;
      eraId = overPlacement.eraId;
      const list = lists.get(eraId) ?? [];
      const fromIndex = list.findIndex((p) => p.workId === workId);
      const others = list.filter((p) => p.workId !== workId);
      const overIdx = others.findIndex((p) => p.workId === overId);
      index = fromIndex >= 0 && fromIndex < list.findIndex((p) => p.workId === overId) ? overIdx + 1 : overIdx;
    }
    move(workId, { eraId, index });
    setSelected(workId);
  };

  const patchEra = (eraId: string, patch: { name?: string; yearLabel?: string | null; memo?: string | null }) => {
    setDraft((d) => ({ ...d, eras: d.eras.map((e) => (e.id === eraId && !e.inherited ? { ...e, ...patch } : e)) }));
    setDirty(true);
  };

  const selectedPlacement = selected ? draft.placements.find((p) => p.workId === selected) : undefined;
  const selectedEra = selectedPlacement ? eras.find((e) => e.id === selectedPlacement.eraId) : undefined;
  const selectedList = selectedPlacement ? lists.get(selectedPlacement.eraId) ?? [] : [];
  const selectedIndex = selectedPlacement ? selectedList.findIndex((p) => p.workId === selectedPlacement.workId) : -1;
  const barLocked = !selectedEra || selectedEra.inherited;

  const save = () => {
    const checked = validateTimeline(draft, baseline);
    if (!checked.ok) {
      setIssues(checked.issues);
      setError(TIMELINE_COPY.invalidTimeline);
      toast.error(TIMELINE_COPY.invalidTimeline);
      return;
    }
    startTransition(async () => {
      let result: SaveWorldTimelineActionResult;
      try {
        result = await onSave({ eras: draft.eras, placements: draft.placements });
      } catch {
        // Edit state stays untouched on any failure.
        setError(TIMELINE_COPY.unavailable);
        toast.error(TIMELINE_COPY.unavailable);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        setIssues('issues' in result && result.issues ? result.issues : []);
        toast.error(result.error);
        return;
      }
      // Canonical positions come from the server answer; nothing else is trusted to change.
      const positions = new Map(result.eras.map((e) => [e.id, e.position]));
      setDraft((d) => ({ ...d, eras: d.eras.map((e) => ({ ...e, position: positions.get(e.id) ?? e.position })) }));
      setDirty(false);
      setError(null);
      setIssues([]);
      setMessage(null);
      toast.success(TIMELINE_COPY.saved);
      router.refresh();
    });
  };

  const isBranch = draft.branchKind !== 'trunk';

  return (
    <section className="flex flex-col gap-4" aria-label="세계관 연표 편집">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">세계관 연표</h1>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => apply(addEra(draft, { id: newId(), name: `새 시대 구간 ${eras.length + 1}` }))}
              disabled={pending}
            >
              + 시대 구간 추가
            </Button>
            <Button type="button" onClick={save} disabled={pending || !dirty}>
              {pending ? '저장 중…' : '연표 저장'}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{TIMELINE_COPY.description}</p>
      </header>

      {tabs.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="가지별 연표">
          {tabs.map((tab) => (
            <Link
              key={tab.branchId}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              className={`rounded-md border px-3 py-1 text-sm ${tab.active ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      )}

      {(error || message) && (
        <div role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">
          <p>{error ?? message}</p>
          {issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {issues.map((issue, i) => <li key={`${issue.code}-${i}`}>{issue.message}</li>)}
            </ul>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {eras.map((era) => {
            const list = lists.get(era.id) ?? [];
            return (
              <div
                key={era.id}
                data-testid="era-column"
                data-inherited={era.inherited ? 'true' : undefined}
                className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-3 ${era.inherited ? 'border-dashed bg-muted/40' : 'bg-card'}`}
              >
                <div className="flex items-center gap-2">
                  {era.inherited && <Lock size={14} aria-hidden />}
                  <Input
                    aria-label="구간 이름"
                    value={era.name}
                    disabled={era.inherited}
                    onChange={(e) => patchEra(era.id, { name: e.target.value })}
                  />
                  <Badge variant="outline">{list.length}편</Badge>
                </div>
                <Input
                  aria-label="연도"
                  placeholder="연도(선택) 예: 세계력 120~180년"
                  value={era.yearLabel ?? ''}
                  disabled={era.inherited}
                  onChange={(e) => patchEra(era.id, { yearLabel: e.target.value === '' ? null : e.target.value })}
                />
                {era.inherited ? (
                  <p className="text-xs text-muted-foreground">
                    본가지에서 이어받음(분기 시점까지, 수정 불가). {TIMELINE_COPY.inheritedLocked}
                  </p>
                ) : (
                  isBranch && (
                    <Input
                      aria-label="본가지 대응 메모(선택)"
                      placeholder={TIMELINE_COPY.memoPlaceholder}
                      value={era.memo ?? ''}
                      onChange={(e) => patchEra(era.id, { memo: e.target.value === '' ? null : e.target.value })}
                    />
                  )
                )}
                <SortableContext items={list.map((p) => p.workId)} strategy={verticalListSortingStrategy}>
                  <EraDrop eraId={era.id}>
                    {list.map((p, i) => (
                      <WorkCard
                        key={p.workId}
                        workId={p.workId}
                        info={works[p.workId]}
                        locked={era.inherited}
                        selected={selected === p.workId}
                        concurrent={p.concurrentWithPrev}
                        first={i === 0}
                        onSelect={() => {
                          setSelected(p.workId);
                          if (era.inherited) notice(TIMELINE_COPY.inheritedLocked);
                        }}
                      />
                    ))}
                  </EraDrop>
                </SortableContext>
                {!era.inherited && list.length === 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => apply(removeEra(draft, era.id))} disabled={pending}>
                    빈 구간 지우기
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DndContext>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2" role="toolbar" aria-label="선택한 작품 이동">
        <span className="text-sm text-muted-foreground">
          {selectedPlacement ? `선택한 작품: ${works[selectedPlacement.workId]?.title ?? '작품'}` : '이동할 작품을 선택해 주세요.'}
        </span>
        <Button type="button" size="sm" variant="outline" disabled={!selectedPlacement || pending}
          onClick={() => selected && move(selected, 'prevEra')}>← 이전 구간으로</Button>
        <Button type="button" size="sm" variant="outline" disabled={!selectedPlacement || pending}
          onClick={() => selected && move(selected, 'nextEra')}>다음 구간으로 →</Button>
        <Button type="button" size="sm" variant="outline" disabled={!selectedPlacement || pending}
          onClick={() => selected && move(selected, 'up')}>구간 안에서 ↑</Button>
        <Button type="button" size="sm" variant="outline" disabled={!selectedPlacement || pending}
          onClick={() => selected && move(selected, 'down')}>↓</Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedPlacement || pending || barLocked || selectedIndex === 0}
          title={selectedIndex === 0 ? TIMELINE_COPY.firstConcurrent : undefined}
          onClick={() => selected && apply(setConcurrent(draft, selected, !selectedPlacement?.concurrentWithPrev))}
        >
          {selectedPlacement?.concurrentWithPrev ? '동시 진행 해제' : '앞 작품과 동시 진행'}
        </Button>
        {selectedIndex === 0 && <span className="text-xs text-muted-foreground">{TIMELINE_COPY.firstConcurrent}</span>}
        {selectedEra?.inherited && <span className="text-xs text-muted-foreground">{TIMELINE_COPY.inheritedLocked}</span>}
      </div>

      <p className="text-xs text-muted-foreground">{FOOTER_NOTE}</p>
    </section>
  );
}
