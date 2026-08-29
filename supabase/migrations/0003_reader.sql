-- Additive public-read RLS: readers (anonymous or logged-in-but-not-owner) currently
-- get zero rows from works/chapters — 0002_studio.sql's policies only match the owner.
-- Postgres RLS policies are OR'd, not replaced, so these do not weaken the owner policies.
drop policy if exists "works_public_read" on works;
create policy "works_public_read" on works for select
  using (deleted_at is null);

drop policy if exists "chapters_public_read" on chapters;
create policy "chapters_public_read" on chapters for select
  using (is_published = true and deleted_at is null);

-- D-09: view_count increments by 1 on every chapter open, no per-user dedup in v1.
alter table chapters add column if not exists view_count integer not null default 0;

-- SECURITY DEFINER, scoped to exactly one column/condition — avoids opening a general
-- UPDATE policy on chapters to anonymous callers (matches handle_new_user() precedent).
create or replace function increment_chapter_view(p_chapter_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update chapters
  set view_count = view_count + 1
  where id = p_chapter_id and is_published = true and deleted_at is null;
end;
$$;

grant execute on function increment_chapter_view(uuid) to anon, authenticated;

-- D-08: toggleable like. Write is owner-only; read is public (feed/detail like counts).
create table if not exists work_likes (
  work_id uuid not null references works(id),
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

alter table work_likes enable row level security;
drop policy if exists "work_likes_owner_write" on work_likes;
create policy "work_likes_owner_write" on work_likes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "work_likes_public_read" on work_likes;
create policy "work_likes_public_read" on work_likes for select using (true);

-- READ-04 (이어보기): one row per user+work, upserted on every chapter open.
-- Chapter-level granularity only — no scroll-position tracking (D-14's explicit scope).
create table if not exists reading_progress (
  user_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid not null references chapters(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

alter table reading_progress enable row level security;
drop policy if exists "reading_progress_owner_all" on reading_progress;
create policy "reading_progress_owner_all" on reading_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- READ-05: fixed category set (D-16), shaped for Phase 7's ADMIN-01 report queue
-- (reporter, target content, reason category, timestamp, status) without Phase 3
-- building any admin read/action UI.
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid references chapters(id),
  reason_category text not null check (reason_category in (
    '내용 불일치/표절', '혐오·유해 콘텐츠', '스팸/광고', '기타'
  )),
  detail text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table reports enable row level security;
drop policy if exists "reports_reporter_insert" on reports;
create policy "reports_reporter_insert" on reports for insert with check (reporter_id = auth.uid());
drop policy if exists "reports_reporter_select_own" on reports;
create policy "reports_reporter_select_own" on reports for select using (reporter_id = auth.uid());
-- Phase 7 (ADMIN-01..04) will add a broader role-based read/update policy or use the
-- admin service-role client — deliberately not added here, out of this phase's scope.

-- READ-07 (알림): per-work new-chapter subscription toggle. Delivery channel is out of
-- scope (v1 tracks subscribe/unsubscribe state only) — owner-only, no public read needed.
create table if not exists work_subscriptions (
  work_id uuid not null references works(id),
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

alter table work_subscriptions enable row level security;
drop policy if exists "work_subscriptions_owner_all" on work_subscriptions;
create policy "work_subscriptions_owner_all" on work_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- READ-08 (선호작): personal bookmark list, distinct from work_likes/D-08 (D-19).
-- Owner-only — no "who bookmarked this" list is surfaced anywhere in v1.
create table if not exists work_bookmarks (
  work_id uuid not null references works(id),
  user_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);

alter table work_bookmarks enable row level security;
drop policy if exists "work_bookmarks_owner_all" on work_bookmarks;
create policy "work_bookmarks_owner_all" on work_bookmarks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
