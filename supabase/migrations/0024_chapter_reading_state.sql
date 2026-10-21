begin;

-- Phase 3 Reopen (03-11, READ-04): per-chapter reading position + active-time source.
--
-- Facts checked before writing (2026-10-17):
--   * lib/chapters/actions.ts saveChapterContent stores the studio <Textarea> string verbatim in
--     chapters.content (text not null default ''). Content is plain text, not HTML/document JSON,
--     so a whitespace-stripped length is a meaningful character count.
--
-- Shape:
--   * chapters.char_count     generated, stored. NO column grant: only SECURITY DEFINER completion
--                             RPCs read it. chapters has no table-level SELECT for anon/authenticated
--                             since 0005, so an ungranted column stays private. content stays revoked.
--   * chapter_reading_state   one row per (user, chapter). The browser may only SELECT its own rows;
--                             every write goes through open_chapter_reading / save_chapter_reading.
--                             completed_at is written by neither RPC (completion RPC is a later plan).
--   * session_* / last_sequence / end_visible_ms
--                             per-visit bookkeeping so replays, out-of-order samples and late flushes
--                             of a previous visit can neither inflate active_ms nor move the pointer.
--
-- Lock order follows 0008/0009: profile row FOR SHARE (a concurrent sanction waits), then the
-- chapter/work rows FOR SHARE (a concurrent blind waits), then the state row.
-- Access precedence is the existing contract: get_chapter_access_state(...)->>'state' = 'readable'
-- (existence/publication -> blind first -> free/entitled -> owner reading own published chapter).
--
-- No existing function is replaced, no profiles column is added, and 0008 is not edited: the three
-- restrictive write guards are added here for the new table only.

-- ---------------------------------------------------------------------------
-- 1. Character count (plain-text body, whitespace removed)
-- ---------------------------------------------------------------------------
alter table chapters add column if not exists char_count integer
  generated always as (char_length(regexp_replace(content, '\s', '', 'g'))) stored;
revoke select (char_count) on chapters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Per-chapter reading state
-- ---------------------------------------------------------------------------
create table if not exists chapter_reading_state (
  user_id uuid not null references profiles(id) on delete cascade,
  chapter_id uuid not null,
  work_id uuid not null references works(id),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  scroll_ratio numeric(5,4) not null default 0 check (scroll_ratio between 0 and 1),
  max_scroll_ratio numeric(5,4) not null default 0 check (max_scroll_ratio between 0 and 1),
  active_ms bigint not null default 0 check (active_ms >= 0),
  completed_at timestamptz,
  session_id uuid not null,
  session_started_at timestamptz not null default now(),
  session_active_ms bigint not null default 0 check (session_active_ms >= 0),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  end_visible_ms integer not null default 0 check (end_visible_ms >= 0),
  primary key (user_id, chapter_id),
  -- The chapter must belong to the recorded work.
  foreign key (chapter_id, work_id) references chapters(id, work_id) on delete cascade,
  check (scroll_ratio <= max_scroll_ratio)
);
create index if not exists chapter_reading_state_chapter_idx on chapter_reading_state (chapter_id);
create index if not exists chapter_reading_state_work_user_idx on chapter_reading_state (work_id, user_id);

alter table chapter_reading_state enable row level security;

-- Owner SELECT only. No INSERT/UPDATE/DELETE policy exists, so direct DML is denied by RLS as well
-- as by the missing table privileges below.
drop policy if exists chapter_reading_state_owner_select on chapter_reading_state;
create policy chapter_reading_state_owner_select on chapter_reading_state for select
  to authenticated using (user_id = auth.uid());

-- 0008 pattern, new table only (restrictive guards AND-ed with any future permissive policy).
drop policy if exists chapter_reading_state_write_access_insert on chapter_reading_state;
create policy chapter_reading_state_write_access_insert on chapter_reading_state
  as restrictive for insert with check (current_user_can_write());
drop policy if exists chapter_reading_state_write_access_update on chapter_reading_state;
create policy chapter_reading_state_write_access_update on chapter_reading_state
  as restrictive for update using (current_user_can_write()) with check (current_user_can_write());
drop policy if exists chapter_reading_state_write_access_delete on chapter_reading_state;
create policy chapter_reading_state_write_access_delete on chapter_reading_state
  as restrictive for delete using (current_user_can_write());

revoke all on table chapter_reading_state from public, anon, authenticated;
grant select on table chapter_reading_state to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Snapshot (internal helper; DTO = ChapterReadingState)
-- ---------------------------------------------------------------------------
create or replace function chapter_reading_snapshot(p_row chapter_reading_state) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'chapterId', p_row.chapter_id,
    'workId', p_row.work_id,
    'scrollRatio', p_row.scroll_ratio,
    'maxScrollRatio', p_row.max_scroll_ratio,
    'activeMs', p_row.active_ms,
    'completedAt', p_row.completed_at,
    'sessionId', p_row.session_id,
    'sessionActiveMs', p_row.session_active_ms,
    'lastSequence', p_row.last_sequence);
$$;
revoke all on function chapter_reading_snapshot(chapter_reading_state)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Shared gate: authenticated, non-deleted, write-allowed reader of a readable chapter
-- ---------------------------------------------------------------------------
-- Raises: authentication_required | invalid_input | write_access_denied | chapter_unavailable
--         | chapter_not_readable. Takes the profile and content share locks (0008/0009 order).
create or replace function assert_chapter_reading_access(p_work_id uuid, p_chapter_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_work_id is null or p_chapter_id is null then raise exception 'invalid_input'; end if;
  perform 1 from profiles where id = v_user and deleted_at is null for share;
  if not found then raise exception 'authentication_required'; end if;
  if not user_can_write(v_user) then raise exception 'write_access_denied'; end if;
  -- Actual chapter.work_id must equal the requested work.
  perform 1 from chapters c join works w on w.id = c.work_id
    where c.id = p_chapter_id and w.id = p_work_id
    for share of c, w;
  if not found then raise exception 'chapter_unavailable'; end if;
  if get_chapter_access_state(p_work_id, p_chapter_id)->>'state' is distinct from 'readable' then
    raise exception 'chapter_not_readable';
  end if;
  return v_user;
end;
$$;
revoke all on function assert_chapter_reading_access(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. open_chapter_reading: start (or resume) a visit + move the work pointer
-- ---------------------------------------------------------------------------
-- First opened_at is preserved. The same session re-opened (StrictMode, reload of the same visit)
-- keeps its session clock and sequence. A new session starts a fresh visit at DB now().
create or replace function open_chapter_reading(p_work_id uuid, p_chapter_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
begin
  v_user := assert_chapter_reading_access(p_work_id, p_chapter_id);
  if p_session_id is null then raise exception 'invalid_input'; end if;

  insert into chapter_reading_state as s (user_id, chapter_id, work_id, session_id, session_started_at)
    values (v_user, p_chapter_id, p_work_id, p_session_id, now())
  on conflict (user_id, chapter_id) do update set
    last_seen_at = now(),
    session_id = excluded.session_id,
    session_started_at = case when s.session_id = excluded.session_id
      then s.session_started_at else now() end,
    session_active_ms = case when s.session_id = excluded.session_id
      then s.session_active_ms else 0 end,
    last_sequence = case when s.session_id = excluded.session_id
      then s.last_sequence else 0 end,
    end_visible_ms = case when s.session_id = excluded.session_id
      then s.end_visible_ms else 0 end
  returning * into v_row;

  -- Continue-reading pointer, same transaction.
  insert into reading_progress (user_id, work_id, chapter_id, updated_at)
    values (v_user, p_work_id, p_chapter_id, now())
  on conflict (user_id, work_id) do update set
    chapter_id = excluded.chapter_id, updated_at = excluded.updated_at;

  return chapter_reading_snapshot(v_row);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. save_chapter_reading: one ordered sample of the current visit
-- ---------------------------------------------------------------------------
-- Accepted only for the currently open session and a strictly larger sequence. A missing open,
-- a previous session or a stale/duplicate sequence returns the unchanged snapshot (missing open:
-- a zero snapshot with sessionId null). Never touches reading_progress or completed_at, so a late
-- flush of chapter A cannot rewind the work pointer that chapter B already moved.
create or replace function save_chapter_reading(
  p_work_id uuid, p_chapter_id uuid, p_session_id uuid, p_sequence bigint,
  p_scroll_ratio numeric, p_session_active_ms bigint, p_end_visible_ms integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
  v_ratio numeric(5,4);
  v_limit_ms bigint;
begin
  v_user := assert_chapter_reading_access(p_work_id, p_chapter_id);
  if p_session_id is null or p_sequence is null or p_sequence < 1
    or p_scroll_ratio is null or p_scroll_ratio < 0 or p_scroll_ratio > 1
    or p_session_active_ms is null or p_session_active_ms < 0
  then raise exception 'invalid_input'; end if;
  v_ratio := round(p_scroll_ratio, 4);

  select * into v_row from chapter_reading_state
    where user_id = v_user and chapter_id = p_chapter_id
    for update;
  if not found then
    return jsonb_build_object('chapterId', p_chapter_id, 'workId', p_work_id,
      'scrollRatio', 0, 'maxScrollRatio', 0, 'activeMs', 0, 'completedAt', null,
      'sessionId', null, 'sessionActiveMs', 0, 'lastSequence', 0);
  end if;
  if v_row.session_id is distinct from p_session_id or p_sequence <= v_row.last_sequence then
    return chapter_reading_snapshot(v_row);
  end if;
  -- Session active time is cumulative and monotonic: a smaller value is an out-of-order sample.
  if p_session_active_ms < v_row.session_active_ms then
    return chapter_reading_snapshot(v_row);
  end if;

  -- Upper bound: DB-measured session elapsed time + 5000 ms slack.
  v_limit_ms := floor(extract(epoch from (now() - v_row.session_started_at)) * 1000)::bigint + 5000;
  if p_session_active_ms > v_limit_ms then raise exception 'active_time_exceeds_elapsed'; end if;

  update chapter_reading_state set
    scroll_ratio = v_ratio,
    max_scroll_ratio = greatest(max_scroll_ratio, v_ratio),
    active_ms = active_ms + greatest(p_session_active_ms - session_active_ms, 0),
    session_active_ms = p_session_active_ms,
    last_sequence = p_sequence,
    -- Only a non-negative value within the elapsed bound is stored; otherwise the old value stays.
    end_visible_ms = case
      when p_end_visible_ms is not null and p_end_visible_ms >= 0 and p_end_visible_ms <= v_limit_ms
        then p_end_visible_ms else end_visible_ms end,
    last_seen_at = now()
  where user_id = v_user and chapter_id = p_chapter_id
  returning * into v_row;

  return chapter_reading_snapshot(v_row);
end;
$$;

revoke all on function open_chapter_reading(uuid, uuid, uuid),
  save_chapter_reading(uuid, uuid, uuid, bigint, numeric, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function open_chapter_reading(uuid, uuid, uuid),
  save_chapter_reading(uuid, uuid, uuid, bigint, numeric, bigint, integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
