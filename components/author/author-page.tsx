'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthorSubscribeButton, authorSubscriptionState } from './author-subscribe-button';
import { authorStatusLabel, normalizeAuthorWorksQuery } from '@/lib/author/queries';
import { loadAuthorWorksAction } from '@/app/author/[authorId]/actions';
import type { AuthorProfile, AuthorStats, AuthorWork, AuthorWorkPage } from '@/lib/author/types';

type QueryInput = { status?: unknown; sort?: unknown; offset?: unknown };
export const normalizeAuthorPageQuery = normalizeAuthorWorksQuery;

export function buildAuthorPageHref(authorId: string, input: QueryInput): string {
  const { status, sort } = normalizeAuthorPageQuery(input);
  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (sort !== 'updated') query.set('sort', sort);
  return `/author/${authorId}${query.size ? `?${query}` : ''}`;
}

export function mergeAuthorWorks(current: AuthorWork[], incoming: AuthorWork[]) {
  const seen = new Set(current.map((work) => work.id));
  const added = incoming.filter((work) => {
    if (seen.has(work.id)) return false;
    seen.add(work.id);
    return true;
  });
  return { items: [...current, ...added], firstAddedId: added[0]?.id ?? null, addedCount: added.length };
}

const FILTERS = [{ value: 'all', label: '전체' }, { value: 'ongoing', label: '연재중' }, { value: 'completed', label: '완결' }];
const SORTS = [{ value: 'updated', label: '업데이트순' }, { value: 'new', label: '신작순' }, { value: 'popular', label: '인기순' }];
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const number = (value: number) => value.toLocaleString('ko-KR');

function ChoiceRow({ label, options, value, onChange, className = '' }: {
  label: string; options: typeof FILTERS; value: string; onChange: (value: string) => void; className?: string;
}) {
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % options.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + options.length - 1) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
    onChange(options[next].value);
  }
  return (
    <div role="radiogroup" aria-label={label} className={`flex min-w-0 gap-2 overflow-x-auto p-1 ${className}`}>
      {options.map((option, index) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1} onClick={() => onChange(option.value)}
          onKeyDown={(event) => move(event, index)}
          className={`min-h-11 shrink-0 rounded-lg border px-2 text-sm font-semibold ${FOCUS} ${value === option.value ? 'border-primary bg-background text-foreground' : 'border-border bg-background text-muted-foreground'}`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function workDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(value)).replace(/\. /g, '.').replace(/\.$/, '');
}

// SeriesCard cannot supply this page's link name, cover alt or title-derived fallback.
// Keep the author card here rather than changing the shared Phase 21 card contract.
function AuthorWorkCard({ work, linkRef }: { work: AuthorWork; linkRef: (node: HTMLAnchorElement | null) => void }) {
  const status = authorStatusLabel(work.serialStatus);
  const hue = Array.from(work.title).reduce((sum, letter) => sum + letter.codePointAt(0)!, 0) % 360;
  const continuation = work.chapterCount > 1 && work.totalViews > 0 ? Math.round(work.ctr * 100) : null;
  // No completion-rate field exists in the public DTO: omit that chip until it is measured.
  return (
    <li className="min-w-0">
      <Link ref={linkRef} href={`/works/${work.id}`} aria-label={`${work.title}, ${status}, ${number(work.chapterCount)}화`}
        className={`flex min-h-11 h-full min-w-0 flex-col gap-2 rounded-lg border bg-card p-2 ${FOCUS}`}>
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
          {work.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={work.coverImageUrl} alt={`${work.title} 표지`} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div aria-hidden className="flex h-full items-center justify-center p-4 text-center text-sm font-semibold text-white"
              style={{ background: `linear-gradient(145deg, hsl(${hue} 24% 34%), hsl(${(hue + 40) % 360} 24% 20%))` }}>
              <span className="line-clamp-4 break-all">{work.title}</span>
            </div>
          )}
          <div className="absolute inset-x-2 top-2 flex flex-wrap justify-between gap-2">
            <span className="rounded-full bg-black/80 px-2 py-1 text-xs text-white">{status}</span>
            {continuation !== null && <span className="rounded-full bg-black/80 px-2 py-1 text-xs text-white">연독률 {continuation}%</span>}
          </div>
        </div>
        <h2 className="line-clamp-2 break-all text-sm leading-[1.2] font-semibold">{work.title}</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {work.genre && <Badge variant="secondary" className="max-w-full whitespace-normal break-all text-xs font-normal">{work.genre}</Badge>}
          <Badge variant="secondary" className="text-xs font-normal">{number(work.chapterCount)}화</Badge>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">
          {workDate(work.createdAt)} 연재 시작 · {work.serialStatus === 'completed' ? '완결'
            : work.latestPublishedAt ? `${workDate(work.latestPublishedAt)} 업데이트` : '연재중'}
        </p>
      </Link>
    </li>
  );
}

function AuthorWorkGrid({ authorId, initialPage, status, sort, reset, navigating }: {
  authorId: string; initialPage: AuthorWorkPage; status: string; sort: string; reset: () => void; navigating: boolean;
}) {
  const [page, setPage] = useState(initialPage);
  const [error, setError] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const links = useRef(new Map<string, HTMLAnchorElement>());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    // An older pagination response must not take focus away from a newly selected filter.
    if (focusId && !navigating) links.current.get(focusId)?.focus();
  }, [focusId, navigating]);

  function more() {
    if (navigating || pending || inFlight.current || page.nextOffset === null) return;
    inFlight.current = true;
    setError(false);
    startTransition(async () => {
      try {
        const result = await loadAuthorWorksAction(authorId, { status, sort, offset: page.nextOffset });
        if (!mounted.current) return;
        if (!result.ok) { setError(true); return; }
        const merged = mergeAuthorWorks(page.items, result.page.items);
        setPage({ ...result.page, items: merged.items });
        setAnnouncement(`${number(merged.addedCount)}편을 더 불러왔어요`);
        setFocusId(merged.firstAddedId);
      } catch { if (mounted.current) setError(true); }
      finally { inFlight.current = false; }
    });
  }

  return (
    <section aria-label="공개 작품" aria-busy={pending} className="flex min-w-0 flex-col gap-4">
      <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground">
        {number(page.items.length)}편 표시 중{announcement ? ` · ${announcement}` : ''}
      </p>
      {page.items.length ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {page.items.map((work) => <AuthorWorkCard key={work.id} work={work} linkRef={(node) => {
            if (node) links.current.set(work.id, node); else links.current.delete(work.id);
          }} />)}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <h2 className="text-lg leading-[1.2] font-semibold">{status === 'completed' ? '완결' : status === 'ongoing' ? '연재중' : '공개'} 작품이 없어요</h2>
          <p className="text-sm text-muted-foreground">다른 상태를 선택해 보세요</p>
          <Button type="button" variant="outline" className="min-h-11 px-4 font-semibold" onClick={reset}>전체 보기</Button>
        </div>
      )}
      {error && <p role="alert" className="text-center text-sm">작품을 더 불러오지 못했어요</p>}
      {page.nextOffset !== null ? (
        <Button type="button" variant="outline" onClick={more} disabled={pending || navigating} aria-busy={pending}
          className="min-h-11 self-center px-4 text-sm font-semibold">작품 더보기</Button>
      ) : page.totalCount > 0 && <p className="text-center text-xs text-muted-foreground">공개 작품 {number(page.totalCount)}편을 모두 보여드렸어요</p>}
    </section>
  );
}

export function AuthorRetry() {
  const router = useRouter();
  return (
    <main className="mx-auto flex w-full max-w-[1152px] flex-col items-center gap-4 px-4 py-12 text-center">
      <h1 className="text-lg leading-[1.2] font-semibold">작가 정보를 불러오지 못했어요</h1>
      <p className="text-sm text-muted-foreground">잠시 후 다시 시도해 주세요</p>
      <Button type="button" className="min-h-11 px-4 font-semibold" onClick={() => router.refresh()}>다시 시도</Button>
    </main>
  );
}

export function AuthorPage({ profile, stats, page, loggedIn, isSelf, notify, query: input }: {
  profile: AuthorProfile; stats: AuthorStats; page: AuthorWorkPage;
  loggedIn: boolean; isSelf: boolean; notify: boolean; query: QueryInput;
}) {
  const router = useRouter();
  const query = normalizeAuthorPageQuery(input);
  const [selectedQuery, selectQuery] = useOptimistic(query, (current, patch: QueryInput) =>
    normalizeAuthorPageQuery({ ...current, ...patch }));
  const [subscription, setSubscription] = useState(() => authorSubscriptionState(notify, stats.subscriberCount));
  const [source, setSource] = useState({ notify, count: stats.subscriberCount });
  const [navigating, startNavigation] = useTransition();
  // Revalidation may deliver new server props while an optimistic action is pending.
  // Retain that optimistic snapshot until its own authoritative response arrives.
  if (!subscription.pending && (source.notify !== notify || source.count !== stats.subscriberCount)) {
    setSource({ notify, count: stats.subscriberCount });
    setSubscription(authorSubscriptionState(notify, stats.subscriberCount));
  }
  function change(next: QueryInput) {
    const href = buildAuthorPageHref(profile.authorId, { ...selectedQuery, ...next });
    if (href === buildAuthorPageHref(profile.authorId, selectedQuery)) return;
    startNavigation(() => {
      selectQuery(next);
      router.replace(href, { scroll: false });
    });
  }
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1152px] flex-col gap-6 px-4 py-6 pb-12 text-sm leading-normal">
      <button type="button" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/'); }}
        className={`inline-flex min-h-11 w-fit items-center gap-2 rounded-lg text-sm text-muted-foreground ${FOCUS}`}>
        <ArrowLeft className="size-4" aria-hidden /> 이전 화면으로
      </button>
      <section aria-label="작가 프로필" className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[84px_minmax(0,1fr)_minmax(160px,240px)] sm:p-6">
        <div aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/30 text-2xl font-semibold sm:row-span-2 sm:row-start-1 sm:size-[84px]">
          {Array.from(profile.penName)[0]}
        </div>
        <h1 className="line-clamp-2 min-w-0 break-all text-2xl leading-[1.2] font-semibold sm:col-start-2 sm:row-start-1 sm:self-end">{profile.penName}</h1>
        <div className="col-span-2 flex min-w-0 flex-col gap-4 sm:col-span-1 sm:col-start-2 sm:row-start-2">
          {profile.penNameBio?.trim() && <p className="line-clamp-4 whitespace-pre-line break-words text-sm">{profile.penNameBio}</p>}
          <div className="flex flex-wrap gap-2">
            {[`작품 ${number(stats.workCount)}편`, `연재중 ${number(stats.ongoingCount)}편`, `완결 ${number(stats.completedCount)}편`, `구독자 ${number(subscription.subscriberCount)}명`]
              .map((label) => <Badge key={label} variant="secondary" className="text-xs font-normal">{label}</Badge>)}
          </div>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1">
          <AuthorSubscribeButton authorId={profile.authorId} loggedIn={loggedIn} isSelf={isSelf} state={subscription} setState={setSubscription} />
        </div>
      </section>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
        <ChoiceRow label="작품 상태" options={FILTERS} value={selectedQuery.status} onChange={(status) => change({ status })} />
        <ChoiceRow label="작품 정렬" options={SORTS} value={selectedQuery.sort} onChange={(sort) => change({ sort })} className="hidden sm:flex" />
        <div className="min-w-0 sm:hidden">
          <Select value={selectedQuery.sort} onValueChange={(sort) => change({ sort })} items={SORTS}>
            <SelectTrigger aria-label="작품 정렬" className="min-h-11 min-w-0 px-2 text-sm focus-visible:ring-2"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((sort) => <SelectItem key={sort.value} value={sort.value} className="min-h-11 text-sm">{sort.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div aria-busy={navigating}>
        <AuthorWorkGrid key={`${profile.authorId}:${query.status}:${query.sort}`} authorId={profile.authorId}
          status={query.status} sort={query.sort} initialPage={page} navigating={navigating} reset={() => change({ status: 'all' })} />
      </div>
      <p className="text-xs text-muted-foreground">공개된 작품만 보여드려요. 숨김 처리되거나 아직 회차가 공개되지 않은 작품은 나타나지 않아요.</p>
    </main>
  );
}
