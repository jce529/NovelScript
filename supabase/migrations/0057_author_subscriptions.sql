-- Phase 28-01 / APAGE-01..03. Requires 0056; serial_status is read-only here.
begin;

create table public.author_subscriptions (
  author_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (author_id, user_id),
  check (author_id <> user_id)
);
create index author_subscriptions_user_idx
  on public.author_subscriptions (user_id, created_at desc, author_id);
create index author_subscriptions_notifying_idx
  on public.author_subscriptions (author_id) where notify;

alter table public.author_subscriptions enable row level security;
create policy author_subscriptions_select_own on public.author_subscriptions
  for select to authenticated using (user_id = auth.uid());
-- Revoke Supabase default grants as well: RLS alone must not permit direct writes.
revoke all on table public.author_subscriptions from public, anon, authenticated, service_role;
grant select on table public.author_subscriptions to authenticated;
grant all on table public.author_subscriptions to service_role;

create or replace function public.get_public_author_profile(p_author_id uuid)
returns table (pen_name text, pen_name_bio text)
language sql stable security definer set search_path = '' as $$
  select p.pen_name, p.pen_name_bio
  from public.profiles p
  where p.id = p_author_id and p.deleted_at is null
    and nullif(btrim(p.pen_name), '') is not null
    and exists (select 1 from public.works w
                where w.owner_id = p.id and public.world_work_reader_visible(w.id));
$$;
revoke all on function public.get_public_author_profile(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_public_author_profile(uuid) to anon, authenticated;

create or replace function public.get_public_author_stats(p_author_id uuid)
returns table (work_count bigint, ongoing_count bigint, completed_count bigint, subscriber_count bigint)
language sql stable security definer set search_path = '' as $$
  select count(*), count(*) filter (where w.serial_status = 'ongoing'),
         count(*) filter (where w.serial_status = 'completed'),
         (select count(*) from public.author_subscriptions s
          where s.author_id = p_author_id and s.notify)
  from public.works w
  where w.owner_id = p_author_id and public.world_work_reader_visible(w.id)
    and exists (select 1 from public.get_public_author_profile(p_author_id))
  having count(*) > 0;
$$;
revoke all on function public.get_public_author_stats(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_public_author_stats(uuid) to anon, authenticated;

create or replace function public.list_public_author_works(
  p_author_id uuid, p_status text default 'all', p_sort text default 'updated',
  p_offset integer default 0, p_limit integer default 12
)
returns table (
  id uuid, title text, synopsis text, cover_image_url text, genre text,
  serial_status text, created_at timestamptz, latest_published_at timestamptz,
  chapter_count bigint, total_views bigint, like_count bigint, ctr numeric, popularity_score integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('all', 'ongoing', 'completed')
     or p_sort is null or p_sort not in ('updated', 'new', 'popular') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query
  with public_works as materialized (
    -- Global baseline precedes author/status filtering and pagination.
    select w.id, w.owner_id, w.title, w.synopsis, w.cover_image_url,
           w.genre, w.serial_status, w.created_at
    from public.works w where public.world_work_reader_visible(w.id)
  ), chapter_views as (
    -- Integer view counts cannot be NaN/Infinity; clamp negatives before sum AND ratios,
    -- matching chapterViewsToRaw / computeWorldTreePopularity's finiteNonNeg contract.
    select c.work_id, c.id, c.order_index, c.published_at,
           greatest(c.view_count, 0) as views
    from public.chapters c join public_works w on w.id = c.work_id
    where c.is_published and c.deleted_at is null
  ), adjacent as (
    select c.*, lag(c.views) over (partition by c.work_id order by c.order_index, c.id) as prev_views
    from chapter_views c
  ), chapter_metrics as (
    select c.work_id, count(*) as chapter_count, sum(c.views) as total_views,
           max(c.published_at) as latest_published_at,
           coalesce(avg(case when c.prev_views > 0 then least(c.views::numeric / c.prev_views, 1)
                             when c.prev_views is not null then 0::numeric end), 0) as ctr
    from adjacent c group by c.work_id
  ), likes as (
    select l.work_id, count(*) as like_count
    from public.work_likes l join public_works w on w.id = l.work_id group by l.work_id
  ), raw_metrics as (
    select w.*, c.chapter_count, c.total_views, c.latest_published_at, c.ctr,
           coalesce(l.like_count, 0::bigint) as like_count
    from public_works w join chapter_metrics c on c.work_id = w.id
    left join likes l on l.work_id = w.id
  ), baseline as (
    select max(r.total_views) as max_total_views, max(r.like_count) as max_like_count from raw_metrics r
  ), scored as (
    select r.*, round(100 * (
      0.4 * coalesce(r.total_views::numeric / nullif(b.max_total_views, 0), 0)
      + 0.3 * coalesce(r.like_count::numeric / nullif(b.max_like_count, 0), 0)
      + 0.3 * least(greatest(r.ctr, 0), 1)))::integer as score
    from raw_metrics r cross join baseline b
  )
  select s.id, s.title, s.synopsis, s.cover_image_url, s.genre, s.serial_status,
         s.created_at, s.latest_published_at, s.chapter_count, s.total_views,
         s.like_count, s.ctr, s.score
  from scored s
  where s.owner_id = p_author_id and (p_status = 'all' or s.serial_status = p_status)
    and exists (select 1 from public.get_public_author_profile(p_author_id))
  order by case when p_sort = 'popular' then s.score end desc nulls last,
           case when p_sort = 'updated' then s.latest_published_at end desc nulls last,
           s.created_at desc, s.id asc
  limit least(greatest(coalesce(p_limit, 12), 0), 12)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.list_public_author_works(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_author_works(uuid, text, text, integer, integer) to anon, authenticated;

create or replace function public.list_my_author_subscriptions()
returns table ("authorId" uuid, "penName" text, notify boolean, "subscribedAt" timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return query
  select s.author_id, p.pen_name, s.notify, s.created_at
  from public.author_subscriptions s
  left join lateral public.get_public_author_profile(s.author_id) p on true
  where s.user_id = auth.uid()
  order by s.created_at desc, s.author_id;
end;
$$;
revoke all on function public.list_my_author_subscriptions() from public, anon, authenticated, service_role;
grant execute on function public.list_my_author_subscriptions() to authenticated;

create or replace function public.toggle_author_subscriptions(p_author_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_notify boolean;
begin
  if v_uid is null or not public.user_can_write(v_uid) then
    raise exception 'write_access_denied' using errcode = '42501';
  end if;
  if p_author_id = v_uid then
    raise exception 'self_subscription_forbidden' using errcode = '22023';
  end if;
  if not exists (select 1 from public.get_public_author_profile(p_author_id)) then
    raise exception 'author_unavailable' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'author_subscriptions:' || p_author_id::text || ':' || v_uid::text, 0));
  update public.author_subscriptions s
    set notify = not s.notify, updated_at = clock_timestamp()
    where s.author_id = p_author_id and s.user_id = v_uid returning s.notify into v_notify;
  if not found then
    insert into public.author_subscriptions (author_id, user_id) values (p_author_id, v_uid);
    v_notify := true;
  end if;
  return v_notify;
end;
$$;
revoke all on function public.toggle_author_subscriptions(uuid) from public, anon, authenticated, service_role;
grant execute on function public.toggle_author_subscriptions(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
