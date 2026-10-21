import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LocalTime } from '@/components/admin/report-queue';
import { SanctionChangeForm } from '@/components/admin/sanction-change-form';
import { queueHref, type AdminQueueState } from '@/lib/admin/queue-params';
import type {
  AdminPage,
  AdminSanctionHistoryEntry,
  AdminSanctionUserSummary,
  EffectiveSanction,
  SanctionKind,
} from '@/lib/admin/types';

/*
 * Sanction history tab (ADMIN-03, Reopen 2026-10-12). Readers and writers with any sanction
 * history, their current sanction, and a per-user timeline. Pure server-renderable markup:
 * every piece of state is a URL, and all user text goes through React text nodes.
 */

export const SANCTION_KIND_LABELS: Record<SanctionKind, string> = {
  warning: '경고',
  suspension: '기간 정지',
  permanent_suspension: '영구 정지',
  lift: '제재 해제',
};

const ROLE_LABELS = { reader: '독자', writer: '작가' } as const;

/** Display name; falls back to a short, safe slice of the id (never an empty label). */
export function sanctionUserName(user: Pick<AdminSanctionUserSummary, 'userId' | 'penName'>): string {
  const name = user.penName?.trim();
  return name ? name : `사용자 ${user.userId.slice(0, 8)}`;
}

export function CurrentSanctionLabel({ sanction }: { sanction: EffectiveSanction }) {
  if (sanction.kind === 'permanent_suspension') return <Badge variant="destructive">영구 정지 중</Badge>;
  if (sanction.kind === 'suspension') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">기간 정지 중</Badge>
        {sanction.sanctionedUntil ? (
          <span className="text-sm text-muted-foreground">
            <LocalTime value={sanction.sanctionedUntil} withZone /> 까지
          </span>
        ) : null}
      </span>
    );
  }
  return <Badge variant="secondary">현재 제재 없음</Badge>;
}

/* ---------- Timeline grouping ---------- */

export type TimelineItem =
  | { type: 'entry'; entry: AdminSanctionHistoryEntry }
  | {
      type: 'duration_change';
      changeId: string;
      /** Every audit entry that belongs to this change, newest first, IDs preserved. */
      entries: AdminSanctionHistoryEntry[];
      previousEndsAt: string | null | undefined;
      newEndsAt: string | null | undefined;
      createdAt: string;
    };

/**
 * Collapses the lift + suspension rows written by one duration change into a single item.
 * A page boundary can leave only one of the two rows; metadata alone still marks it as a
 * duration change, and no entry is ever dropped.
 */
export function groupSanctionTimeline(entries: AdminSanctionHistoryEntry[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const byChange = new Map<string, Extract<TimelineItem, { type: 'duration_change' }>>();
  for (const entry of entries) {
    const { operation, changeId } = entry.metadata;
    if (operation !== 'change_duration' || !changeId) {
      items.push({ type: 'entry', entry });
      continue;
    }
    let item = byChange.get(changeId);
    if (!item) {
      item = {
        type: 'duration_change',
        changeId,
        entries: [],
        previousEndsAt: undefined,
        newEndsAt: undefined,
        createdAt: entry.createdAt,
      };
      byChange.set(changeId, item);
      items.push(item);
    }
    item.entries.push(entry);
    if (item.previousEndsAt === undefined && 'previousEndsAt' in entry.metadata) {
      item.previousEndsAt = entry.metadata.previousEndsAt;
    }
    if (item.newEndsAt === undefined && 'newEndsAt' in entry.metadata) item.newEndsAt = entry.metadata.newEndsAt;
    if (item.newEndsAt === undefined && entry.kind === 'suspension') item.newEndsAt = entry.endsAt;
  }
  return items;
}

function EndsAt({ value, empty }: { value: string | null | undefined; empty: string }) {
  return value ? <LocalTime value={value} withZone /> : <span>{empty}</span>;
}

function Reasons({ entry }: { entry: AdminSanctionHistoryEntry }) {
  return (
    <>
      {entry.internalNote ? (
        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="font-medium text-muted-foreground">내부 사유 </span>
          {entry.internalNote}
        </p>
      ) : null}
      {entry.publicReason ? (
        <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
          <span className="font-medium text-muted-foreground">공개 사유 </span>
          {entry.publicReason}
        </p>
      ) : null}
    </>
  );
}

export function SanctionTimeline({ entries }: { entries: AdminSanctionHistoryEntry[] }) {
  if (entries.length === 0) return <p className="py-4 text-muted-foreground">제재 이력이 없습니다</p>;
  const items = groupSanctionTimeline(entries);
  return (
    <ol className="flex flex-col">
      {items.map((item) =>
        item.type === 'entry' ? (
          <li key={item.entry.id} data-audit-id={item.entry.adminActionId ?? undefined} className="flex flex-col gap-1 border-b border-border py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{SANCTION_KIND_LABELS[item.entry.kind]}</span>
              <span className="text-sm text-muted-foreground">
                <LocalTime value={item.entry.createdAt} />
              </span>
            </div>
            {item.entry.kind === 'suspension' ? (
              <p className="text-sm">
                종료: <EndsAt value={item.entry.endsAt} empty="-" />
              </p>
            ) : null}
            <Reasons entry={item.entry} />
          </li>
        ) : (
          <li key={item.changeId} className="flex flex-col gap-1 border-b border-border py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">기간 변경</span>
              <span className="text-sm text-muted-foreground">
                <LocalTime value={item.createdAt} />
              </span>
            </div>
            <p className="text-sm">
              <EndsAt value={item.previousEndsAt} empty="영구 또는 알 수 없음" /> →{' '}
              <EndsAt value={item.newEndsAt} empty="해제" />
            </p>
            {item.entries.map((entry) => (
              <div key={entry.id} data-audit-id={entry.adminActionId ?? undefined} className="flex flex-col gap-1">
                <Reasons entry={entry} />
              </div>
            ))}
          </li>
        )
      )}
    </ol>
  );
}

/* ---------- Pagination ---------- */

function PageNav({
  label,
  current,
  hasNext,
  hrefFor,
}: {
  label: string;
  current: number;
  hasNext: boolean;
  hrefFor: (page: number) => string;
}) {
  const iconClass = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11');
  const disabled = cn(iconClass, 'pointer-events-none opacity-50');
  return (
    <nav aria-label={label} className="flex items-center justify-end gap-2">
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} className={iconClass} aria-label={`${label} 이전`}>
          <ChevronLeft />
        </Link>
      ) : (
        <span className={disabled} aria-disabled="true" aria-label={`${label} 이전`}>
          <ChevronLeft />
        </span>
      )}
      <span className="min-w-12 text-center text-sm text-muted-foreground">{current} 페이지</span>
      {hasNext ? (
        <Link href={hrefFor(current + 1)} className={iconClass} aria-label={`${label} 다음`}>
          <ChevronRight />
        </Link>
      ) : (
        <span className={disabled} aria-disabled="true" aria-label={`${label} 다음`}>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}

/* ---------- Tab ---------- */

export interface SanctionHistoryProps {
  state: AdminQueueState;
  users: AdminPage<AdminSanctionUserSummary>;
  /** Loaded only when state.userId is on the current user list page. */
  history: AdminPage<AdminSanctionHistoryEntry> | null;
}

export function SanctionHistory({ state, users, history }: SanctionHistoryProps) {
  const selected = state.userId
    ? users.items.find((user) => user.userId.toLowerCase() === state.userId)
    : undefined;
  const historyPage = state.historyPage ?? 1;
  // Changing the user list page clears the selection; selecting a user clears the history page.
  const listHref = (page: number) => queueHref({ tab: 'sanctions', status: 'open', page });
  const selectHref = (userId: string) => queueHref({ tab: 'sanctions', status: 'open', page: state.page, userId });
  const historyHref = (page: number) => queueHref({ ...state, historyPage: page });

  return (
    <section aria-labelledby="sanction-history-heading" className="flex flex-col gap-4">
      <h2 id="sanction-history-heading" className="text-xl font-semibold">
        제재 이력
      </h2>

      {users.items.length === 0 ? (
        <p className="py-8 text-muted-foreground">제재 이력이 있는 사용자가 없습니다</p>
      ) : (
        <ul aria-label="제재 이력 사용자" className="flex flex-col">
          {users.items.map((user) => {
            const active = selected?.userId === user.userId;
            return (
              <li key={user.userId} className="border-b border-border">
                <Link
                  href={selectHref(user.userId)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-sm px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
                    active && 'bg-muted'
                  )}
                >
                  <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{sanctionUserName(user)}</span>
                  <CurrentSanctionLabel sanction={user.effectiveSanction} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <PageNav label="사용자 목록" current={users.page} hasNext={users.hasNext} hrefFor={listHref} />

      {state.userId && !selected ? (
        <p role="status" className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          선택한 사용자가 현재 목록 페이지에 없습니다. 목록에서 사용자를 다시 선택해 주세요.
        </p>
      ) : null}

      {selected ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4" aria-labelledby="sanction-user-heading" role="region">
          <h3 id="sanction-user-heading" className="text-lg font-semibold [overflow-wrap:anywhere]">
            {sanctionUserName(selected)} · {ROLE_LABELS[selected.role]}
          </h3>
          <div
            data-current-sanction={selected.effectiveSanction.kind}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">현재 제재</span>
              <CurrentSanctionLabel sanction={selected.effectiveSanction} />
            </div>
            {/* Adjustment lives only on the current active sanction row; warnings/expired have none. */}
            {selected.effectiveSanction.kind !== 'none' ? (
              <SanctionChangeForm
                userId={selected.userId}
                userName={sanctionUserName(selected)}
                current={selected.effectiveSanction}
                expectedSeq={selected.expectedSeq}
              />
            ) : null}
          </div>
          {history ? (
            <>
              <SanctionTimeline entries={history.items} />
              <PageNav label="이력" current={historyPage} hasNext={history.hasNext} hrefFor={historyHref} />
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
