begin;

-- Phase 7 (07-08): admin blueprint completion (comment moderation excluded).
--
-- Reserved migration number 0029 for Phase 7. 0006/0007/0008/0009 are not modified; every
-- existing signature (list_report_groups, unblind_moderation_target, resolve_review_request,
-- apply_user_sanction, refresh_sanction_cache) is preserved and reused.
--
-- Reopen decisions (07-CONTEXT.md, 2026-10-12):
--   * report queue "전체" filter                    -> list_report_groups_all
--   * per-user (reader and writer) current sanction
--     and warning/suspension/lift history           -> list_sanction_users, get_user_sanction_history
--   * early lift / duration change from the current
--     sanction row, internal + public reason,
--     recorded in admin_actions, through 'lift'     -> adjust_user_sanction
--   * publication notice to bookmark readers when
--     a blind is lifted                              -> publication_notifications + trigger
--
-- Every admin function is SECURITY DEFINER with a pinned search_path and service_role-only
-- EXECUTE. Internal notes are returned only by these admin reads.

-- ---------------------------------------------------------------------------
-- 1. Report queue "전체": every status, one group per target
-- ---------------------------------------------------------------------------
-- Same fields and ordering as list_report_groups (0007) plus the statuses present in the
-- group. Grouping is by (work_id, chapter_id) only, so a target with open, resolved and
-- dismissed reports is one group. Paging applies to groups, never splitting a target.
create function list_report_groups_all(p_limit integer, p_offset integer)
returns table (
  work_id uuid,
  chapter_id uuid,
  work_title text,
  chapter_title text,
  cover_image_url text,
  blinded boolean,
  report_count integer,
  reporter_count integer,
  categories text[],
  oldest_reported_at timestamptz,
  anchor_report_id uuid,
  total_groups integer,
  statuses text[]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_limit is null or p_limit not between 1 and 101 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page';
  end if;
  return query
    with g as (
      select r.work_id, r.chapter_id,
        count(*)::integer as report_count,
        count(distinct r.reporter_id)::integer as reporter_count,
        array_agg(distinct r.reason_category order by r.reason_category) as categories,
        min(r.created_at) as oldest_reported_at,
        (array_agg(r.id order by r.created_at, r.id))[1] as anchor_report_id,
        array_agg(distinct r.status order by r.status) as statuses
      from reports r
      group by r.work_id, r.chapter_id
    )
    select g.work_id, g.chapter_id, w.title, c.title, w.cover_image_url,
      case when g.chapter_id is null then w.admin_blinded else coalesce(c.admin_blinded, false) end,
      g.report_count, g.reporter_count, g.categories, g.oldest_reported_at, g.anchor_report_id,
      (count(*) over ())::integer,
      g.statuses
    from g
    join works w on w.id = g.work_id
    left join chapters c on c.id = g.chapter_id
    order by g.oldest_reported_at, g.work_id, g.chapter_id nulls first
    limit p_limit offset p_offset;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Sanction users and per-user timeline (DB time, user_sanctions is authoritative)
-- ---------------------------------------------------------------------------
-- Effective state derived from the 0006 cache (written only by refresh_sanction_cache) and
-- compared with DB now(): an expired timed suspension (sanctioned_until <= now()) is 'none'.
create function sanction_effective_kind(p_kind text, p_until timestamptz) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_kind = 'permanent_suspension' then 'permanent_suspension'
    when p_kind = 'suspension' and p_until > now() then 'suspension'
    else 'none' end;
$$;

-- One row per user that has any sanction history (warning-only users included), readers and
-- writers alike, newest activity first. expected_seq is the user's max(seq) as decimal text so
-- that a seq above Number.MAX_SAFE_INTEGER survives JSON; adjust_user_sanction takes it back
-- as bigint.
create function list_sanction_users(p_limit integer, p_offset integer)
returns table (
  user_id uuid,
  role text,
  pen_name text,
  effective_kind text,
  sanctioned_until timestamptz,
  latest_at timestamptz,
  expected_seq text,
  total_users integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_limit is null or p_limit not between 1 and 101 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page';
  end if;
  return query
    with u as (
      select s.user_id, max(s.seq) as max_seq
      from user_sanctions s
      group by s.user_id
    )
    select u.user_id, p.role, p.pen_name,
      sanction_effective_kind(p.sanction_kind, p.sanctioned_until),
      case when sanction_effective_kind(p.sanction_kind, p.sanctioned_until) = 'suspension'
        then p.sanctioned_until end,
      latest.created_at,
      coalesce(u.max_seq, 0)::text,
      (count(*) over ())::integer
    from u
    join profiles p on p.id = u.user_id
    join user_sanctions latest on latest.seq = u.max_seq
    order by u.max_seq desc, u.user_id
    limit p_limit offset p_offset;
end;
$$;

-- Timeline for one user: every warning/suspension/permanent/lift row, newest first, with the
-- linked audit metadata (duration changes are identified by metadata.operation/change_id).
-- seq is returned as decimal text for the same JSON-precision reason as expected_seq.
create function get_user_sanction_history(p_user_id uuid, p_limit integer, p_offset integer)
returns table (
  seq text,
  id uuid,
  kind text,
  public_reason text,
  internal_note text,
  ends_at timestamptz,
  created_at timestamptz,
  actor_id uuid,
  admin_action_id uuid,
  metadata jsonb,
  total_events integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_user_id is null then raise exception 'invalid_arguments'; end if;
  if p_limit is null or p_limit not between 1 and 101 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page';
  end if;
  return query
    select s.seq::text, s.id, s.kind, s.public_reason, s.internal_note, s.ends_at, s.created_at,
      s.created_by, s.admin_action_id, coalesce(a.metadata, '{}'::jsonb),
      (count(*) over ())::integer
    from user_sanctions s
    left join admin_actions a on a.id = s.admin_action_id
    where s.user_id = p_user_id
    order by s.seq desc
    limit p_limit offset p_offset;
end;
$$;

revoke all on function
  list_report_groups_all(integer, integer),
  sanction_effective_kind(text, timestamptz),
  list_sanction_users(integer, integer),
  get_user_sanction_history(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function
  list_report_groups_all(integer, integer),
  list_sanction_users(integer, integer),
  get_user_sanction_history(uuid, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
