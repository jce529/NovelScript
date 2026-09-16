begin;

-- Phase 7 (07-02): transactional moderation commands and grouped queue reads.
--
-- Every function here is SECURITY DEFINER with a pinned search_path and is executable by
-- service_role only. The application calls them from lib/admin/* after requireAdmin(), and
-- passes the session-derived actor. Each command re-checks active membership inside the
-- transaction, so a revoked administrator cannot finish an operation.
--
-- D-04  One admin_actions row per operation, written in the same transaction as the
--       target/report/sanction change. Any failure rolls all of it back.
-- D-15  Blinding is cleared only by unblind_moderation_target / resolve_review_request.
-- D-16  Review requests reach an explicit terminal state (maintained | unblinded).
-- D-18  Commands resolve exactly the report IDs the operator reviewed. Reports that
--       arrive later stay open. A reviewed report that is no longer open, or a target
--       whose version changed, makes the command fail with stale_target.
-- D-19  blind/warn/suspend/permanent_suspend require an internal reason and a public
--       reason. resolve/dismiss notes are optional.
-- D-20  list_report_groups: one status at a time, oldest group first, stable tie-break.
--
-- Lock order (extends 0006 and matches 0005 commerce: profile before content):
--   advisory xact lock (actor, idempotency key)
--   -> admin_users (actor, FOR SHARE)
--   -> profiles (sanctioned author, FOR UPDATE)
--   -> chapters/works (target, FOR UPDATE, locked in one statement like commerce)
--   -> reports (ORDER BY id, FOR UPDATE)
--   -> moderation_review_requests (FOR UPDATE)
--
-- Idempotency: (actor_id, idempotency_key) is unique on admin_actions. A retry with the
-- same key and the same operation returns the recorded action ID without repeating
-- anything. The same key with a different operation raises idempotency_conflict.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers (no browser or service_role execute)
-- ---------------------------------------------------------------------------
create function moderation_lock_actor(p_actor_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_actor_id is null then raise exception 'actor_not_admin'; end if;
  perform 1 from admin_users where user_id = p_actor_id and revoked_at is null for share;
  if not found then raise exception 'actor_not_admin'; end if;
  perform 1 from profiles where id = p_actor_id and deleted_at is null;
  if not found then raise exception 'actor_not_admin'; end if;
end;
$$;

-- Version of a moderation target as the operator saw it: blind state of that exact row
-- plus the audit trail on that exact target. New reports do not change it.
create function moderation_target_version(p_work_id uuid, p_chapter_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select md5(concat_ws('|',
    case when p_chapter_id is null then
      (select w.admin_blinded::text || ':' || coalesce(w.admin_blinded_at::text, '')
         from works w where w.id = p_work_id)
    else
      (select c.admin_blinded::text || ':' || coalesce(c.admin_blinded_at::text, '')
         from chapters c where c.id = p_chapter_id and c.work_id = p_work_id)
    end,
    (select count(*)::text || ':' || coalesce(max(a.created_at)::text, '')
       from admin_actions a
       where a.target_work_id = p_work_id and a.target_chapter_id is not distinct from p_chapter_id)
  ));
$$;

-- Locks the target row(s) for update. Chapter targets lock chapter and work in one
-- statement, the same shape commerce uses for its content lock.
create function moderation_lock_target(p_work_id uuid, p_chapter_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_work_id is null then raise exception 'target_not_found'; end if;
  if p_chapter_id is null then
    perform 1 from works w where w.id = p_work_id for update;
  else
    perform 1 from chapters c join works w on w.id = c.work_id
      where c.id = p_chapter_id and c.work_id = p_work_id for update of c, w;
  end if;
  if not found then raise exception 'target_not_found'; end if;
end;
$$;

create function moderation_target_blinded(p_work_id uuid, p_chapter_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_chapter_id is null
    then (select w.admin_blinded from works w where w.id = p_work_id)
    else (select c.admin_blinded from chapters c where c.id = p_chapter_id and c.work_id = p_work_id)
  end;
$$;

create function moderation_set_blind(p_work_id uuid, p_chapter_id uuid, p_public_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- is_published is never touched (D-11).
  if p_chapter_id is null then
    update works set admin_blinded = p_public_reason is not null,
      admin_blind_reason = p_public_reason,
      admin_blinded_at = case when p_public_reason is null then null else now() end
      where id = p_work_id;
  else
    update chapters set admin_blinded = p_public_reason is not null,
      admin_blind_reason = p_public_reason,
      admin_blinded_at = case when p_public_reason is null then null else now() end
      where id = p_chapter_id and work_id = p_work_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Report group command: resolve | dismiss | blind | warn | suspend | permanent_suspend
-- ---------------------------------------------------------------------------
create function moderate_report_group(
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_work_id uuid,
  p_chapter_id uuid,
  p_report_ids uuid[],
  p_expected_version text,
  p_action text,
  p_reason text,
  p_public_reason text,
  p_ends_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_public text := nullif(trim(coalesce(p_public_reason, '')), '');
  v_is_sanction boolean := p_action in ('warn', 'suspend', 'permanent_suspend');
  v_ids uuid[];
  v_type text;
  v_existing admin_actions%rowtype;
  v_owner uuid;
  v_action uuid;
begin
  if p_idempotency_key is null or p_work_id is null then raise exception 'invalid_arguments'; end if;
  if p_action is null or p_action not in ('resolve', 'dismiss', 'blind', 'warn', 'suspend', 'permanent_suspend') then
    raise exception 'invalid_action';
  end if;
  if p_report_ids is null or cardinality(p_report_ids) is null
    or cardinality(p_report_ids) not between 1 and 500
    or exists (select 1 from unnest(p_report_ids) x where x is null)
    or cardinality(p_report_ids) <> (select count(distinct x) from unnest(p_report_ids) x)
  then raise exception 'invalid_report_ids'; end if;
  if (p_action = 'blind' or v_is_sanction) and (v_reason is null or v_public is null) then
    raise exception 'reason_required';
  end if;
  if (p_action = 'suspend') <> (p_ends_at is not null) then raise exception 'invalid_sanction_expiry'; end if;

  select array_agg(x order by x) into v_ids from unnest(p_report_ids) x;
  v_type := case p_action
    when 'resolve' then 'report_resolve'
    when 'dismiss' then 'report_dismiss'
    when 'blind' then case when p_chapter_id is null then 'work_blind' else 'chapter_blind' end
    when 'warn' then 'user_warn'
    when 'suspend' then 'user_suspend'
    else 'user_permanent_suspend' end;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_actor_id::text, '') || ':' || p_idempotency_key::text, 0));
  perform moderation_lock_actor(p_actor_id);

  select * into v_existing from admin_actions
    where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.action_type = v_type
      and v_existing.target_work_id = p_work_id
      and v_existing.target_chapter_id is not distinct from p_chapter_id
      and v_existing.report_ids = v_ids
    then
      return v_existing.id;
    end if;
    raise exception 'idempotency_conflict';
  end if;

  -- works.owner_id is not writable by browser roles, so reading it before the lock is safe.
  select owner_id into v_owner from works where id = p_work_id;
  if not found then raise exception 'target_not_found'; end if;

  if v_is_sanction then
    if v_owner = p_actor_id then raise exception 'self_sanction_forbidden'; end if;
    perform 1 from profiles where id = v_owner and deleted_at is null for update;
    if not found then raise exception 'profile_not_found'; end if;
  end if;

  perform moderation_lock_target(p_work_id, p_chapter_id);

  perform 1 from reports where id = any(v_ids) order by id for update;
  if exists (
    select 1 from unnest(v_ids) x left join reports r on r.id = x
    where r.id is null or r.work_id <> p_work_id or r.chapter_id is distinct from p_chapter_id
  ) then raise exception 'report_target_mismatch'; end if;
  if exists (select 1 from reports where id = any(v_ids) and status <> 'open') then
    raise exception 'stale_target';
  end if;
  if p_expected_version is distinct from moderation_target_version(p_work_id, p_chapter_id) then
    raise exception 'stale_target';
  end if;

  if p_action = 'blind' then
    if moderation_target_blinded(p_work_id, p_chapter_id) then raise exception 'stale_target'; end if;
    perform moderation_set_blind(p_work_id, p_chapter_id, v_public);
  end if;

  insert into admin_actions(actor_id, action_type, target_work_id, target_chapter_id, target_user_id,
      report_ids, reason, public_reason, metadata, idempotency_key)
    values (p_actor_id, v_type, p_work_id, p_chapter_id,
      case when v_is_sanction then v_owner end,
      v_ids, v_reason, case when p_action in ('resolve', 'dismiss') then null else v_public end,
      jsonb_strip_nulls(jsonb_build_object('ends_at', p_ends_at, 'author_id', v_owner)),
      p_idempotency_key)
    returning id into v_action;

  if v_is_sanction then
    perform apply_user_sanction(p_actor_id, v_owner,
      case p_action when 'warn' then 'warning' when 'suspend' then 'suspension' else 'permanent_suspension' end,
      v_public, v_reason, p_ends_at, v_action);
  end if;

  update reports
    set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
        resolution_note = v_reason,
        resolved_by = p_actor_id,
        resolved_at = now()
    where id = any(v_ids);

  return v_action;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Direct unblind (closes an open review request on that target as 'unblinded')
-- ---------------------------------------------------------------------------
create function unblind_moderation_target(
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_work_id uuid,
  p_chapter_id uuid,
  p_expected_version text,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_type text := case when p_chapter_id is null then 'work_unblind' else 'chapter_unblind' end;
  v_existing admin_actions%rowtype;
  v_request uuid;
  v_action uuid;
begin
  if p_idempotency_key is null or p_work_id is null then raise exception 'invalid_arguments'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_actor_id::text, '') || ':' || p_idempotency_key::text, 0));
  perform moderation_lock_actor(p_actor_id);

  select * into v_existing from admin_actions
    where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.action_type = v_type and v_existing.target_work_id = p_work_id
      and v_existing.target_chapter_id is not distinct from p_chapter_id then
      return v_existing.id;
    end if;
    raise exception 'idempotency_conflict';
  end if;

  perform moderation_lock_target(p_work_id, p_chapter_id);
  if p_expected_version is distinct from moderation_target_version(p_work_id, p_chapter_id)
    or not moderation_target_blinded(p_work_id, p_chapter_id) then
    raise exception 'stale_target';
  end if;

  select id into v_request from moderation_review_requests
    where work_id = p_work_id and chapter_id is not distinct from p_chapter_id and status = 'open'
    for update;

  perform moderation_set_blind(p_work_id, p_chapter_id, null);

  insert into admin_actions(actor_id, action_type, target_work_id, target_chapter_id,
      target_review_request_id, reason, idempotency_key)
    values (p_actor_id, v_type, p_work_id, p_chapter_id, v_request, v_reason, p_idempotency_key)
    returning id into v_action;

  if v_request is not null then
    update moderation_review_requests
      set status = 'unblinded', resolved_by = p_actor_id, resolved_at = now(), resolution_note = v_reason
      where id = v_request;
  end if;
  return v_action;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Writer re-review request outcome: maintained | unblinded
-- ---------------------------------------------------------------------------
create function resolve_review_request(
  p_actor_id uuid,
  p_idempotency_key uuid,
  p_request_id uuid,
  p_outcome text,
  p_expected_version text,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_type text;
  v_existing admin_actions%rowtype;
  v_work uuid;
  v_chapter uuid;
  v_status text;
  v_action uuid;
begin
  if p_idempotency_key is null or p_request_id is null then raise exception 'invalid_arguments'; end if;
  if p_outcome is null or p_outcome not in ('maintained', 'unblinded') then raise exception 'invalid_action'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;
  v_type := case p_outcome when 'maintained' then 'review_maintain' else 'review_unblind' end;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_actor_id::text, '') || ':' || p_idempotency_key::text, 0));
  perform moderation_lock_actor(p_actor_id);

  select * into v_existing from admin_actions
    where actor_id = p_actor_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.action_type = v_type and v_existing.target_review_request_id = p_request_id then
      return v_existing.id;
    end if;
    raise exception 'idempotency_conflict';
  end if;

  -- work_id/chapter_id of a request are immutable (no UPDATE grant to any role).
  select work_id, chapter_id into v_work, v_chapter from moderation_review_requests where id = p_request_id;
  if not found then raise exception 'review_request_not_found'; end if;

  perform moderation_lock_target(v_work, v_chapter);
  select status into v_status from moderation_review_requests where id = p_request_id for update;
  if v_status <> 'open'
    or p_expected_version is distinct from moderation_target_version(v_work, v_chapter)
    or not moderation_target_blinded(v_work, v_chapter)
  then raise exception 'stale_target'; end if;

  if p_outcome = 'unblinded' then
    perform moderation_set_blind(v_work, v_chapter, null);
  end if;

  insert into admin_actions(actor_id, action_type, target_work_id, target_chapter_id,
      target_review_request_id, reason, idempotency_key)
    values (p_actor_id, v_type, v_work, v_chapter, p_request_id, v_reason, p_idempotency_key)
    returning id into v_action;

  update moderation_review_requests
    set status = p_outcome, resolved_by = p_actor_id, resolved_at = now(), resolution_note = v_reason
    where id = p_request_id;
  return v_action;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Queue reads (service_role only; lib/admin/queries.ts maps to safe DTOs)
-- ---------------------------------------------------------------------------
-- Groups are (work_id, chapter_id) with NULL chapter meaning a work-level target. The
-- limit/offset applies to groups, so one target never splits across pages.
create function list_report_groups(p_status text, p_limit integer, p_offset integer)
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
  total_groups integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_status is null or p_status not in ('open', 'resolved', 'dismissed') then raise exception 'invalid_status'; end if;
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
        (array_agg(r.id order by r.created_at, r.id))[1] as anchor_report_id
      from reports r
      where r.status = p_status
      group by r.work_id, r.chapter_id
    )
    select g.work_id, g.chapter_id, w.title, c.title, w.cover_image_url,
      case when g.chapter_id is null then w.admin_blinded else coalesce(c.admin_blinded, false) end,
      g.report_count, g.reporter_count, g.categories, g.oldest_reported_at, g.anchor_report_id,
      (count(*) over ())::integer
    from g
    join works w on w.id = g.work_id
    left join chapters c on c.id = g.chapter_id
    order by g.oldest_reported_at, g.work_id, g.chapter_id nulls first
    limit p_limit offset p_offset;
end;
$$;

create function get_report_group_detail(p_anchor_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_work uuid;
  v_chapter uuid;
  v_owner uuid;
  v_result jsonb;
begin
  select r.work_id, r.chapter_id into v_work, v_chapter from reports r where r.id = p_anchor_report_id;
  if not found then return null; end if;
  select w.owner_id into v_owner from works w where w.id = v_work;

  select jsonb_build_object(
    'work_id', w.id,
    'chapter_id', c.id,
    'work_title', w.title,
    'chapter_title', c.title,
    'author_id', w.owner_id,
    'author_pen_name', p.pen_name,
    'target_body', case when v_chapter is null then w.synopsis else c.content end,
    'blinded', case when v_chapter is null then w.admin_blinded else c.admin_blinded end,
    'public_blind_reason', case when v_chapter is null then w.admin_blind_reason else c.admin_blind_reason end,
    'target_version', moderation_target_version(v_work, v_chapter),
    'reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', r.id, 'reporter_id', r.reporter_id, 'work_id', r.work_id, 'chapter_id', r.chapter_id,
          'reason_category', r.reason_category, 'detail', r.detail, 'status', r.status,
          'created_at', r.created_at, 'resolved_at', r.resolved_at, 'resolution_note', r.resolution_note)
        order by r.created_at, r.id), '[]'::jsonb)
      from reports r where r.work_id = v_work and r.chapter_id is not distinct from v_chapter),
    'reviewed_report_ids', (
      select coalesce(jsonb_agg(r.id order by r.id), '[]'::jsonb)
      from reports r
      where r.work_id = v_work and r.chapter_id is not distinct from v_chapter and r.status = 'open'),
    'author_report_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', h.id, 'reporter_id', h.reporter_id, 'work_id', h.work_id, 'chapter_id', h.chapter_id,
          'reason_category', h.reason_category, 'detail', h.detail, 'status', h.status,
          'created_at', h.created_at, 'resolved_at', h.resolved_at, 'resolution_note', h.resolution_note)
        order by h.created_at desc, h.id), '[]'::jsonb)
      from (
        select r.* from reports r join works ow on ow.id = r.work_id
        where ow.owner_id = v_owner
          and not (r.work_id = v_work and r.chapter_id is not distinct from v_chapter)
        order by r.created_at desc, r.id limit 50
      ) h),
    'author_action_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'actor_id', a.actor_id, 'action_type', a.action_type,
          'work_id', a.target_work_id, 'chapter_id', a.target_chapter_id,
          'target_user_id', a.target_user_id, 'reason', a.reason,
          'public_reason', a.public_reason, 'created_at', a.created_at)
        order by a.created_at desc, a.id), '[]'::jsonb)
      from (
        select x.* from admin_actions x
        where x.action_type not in ('admin_grant', 'admin_revoke')
          and (x.target_user_id = v_owner
            or x.target_work_id in (select ow.id from works ow where ow.owner_id = v_owner))
        order by x.created_at desc, x.id limit 50
      ) a)
  ) into v_result
  from works w
  left join chapters c on c.id = v_chapter
  left join profiles p on p.id = w.owner_id
  where w.id = v_work;
  return v_result;
end;
$$;

create function list_review_requests(p_status text, p_limit integer, p_offset integer)
returns table (
  id uuid,
  work_id uuid,
  chapter_id uuid,
  work_title text,
  chapter_title text,
  requester_id uuid,
  message text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz,
  total_requests integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_status is null or p_status not in ('open', 'maintained', 'unblinded') then raise exception 'invalid_status'; end if;
  if p_limit is null or p_limit not between 1 and 101 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_page';
  end if;
  return query
    select m.id, m.work_id, m.chapter_id, w.title, c.title, m.requester_id, m.message, m.status,
      m.created_at, m.resolved_at, (count(*) over ())::integer
    from moderation_review_requests m
    join works w on w.id = m.work_id
    left join chapters c on c.id = m.chapter_id
    where m.status = p_status
    order by m.created_at, m.id
    limit p_limit offset p_offset;
end;
$$;

create function get_review_request_detail(p_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'id', m.id,
    'work_id', m.work_id,
    'chapter_id', m.chapter_id,
    'work_title', w.title,
    'chapter_title', c.title,
    'requester_id', m.requester_id,
    'message', m.message,
    'status', m.status,
    'created_at', m.created_at,
    'resolved_at', m.resolved_at,
    'resolution_note', m.resolution_note,
    'target_body', case when m.chapter_id is null then w.synopsis else c.content end,
    'blinded', case when m.chapter_id is null then w.admin_blinded else c.admin_blinded end,
    'public_blind_reason', case when m.chapter_id is null then w.admin_blind_reason else c.admin_blind_reason end,
    'target_version', moderation_target_version(m.work_id, m.chapter_id),
    'target_action_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'actor_id', a.actor_id, 'action_type', a.action_type,
          'work_id', a.target_work_id, 'chapter_id', a.target_chapter_id,
          'target_user_id', a.target_user_id, 'reason', a.reason,
          'public_reason', a.public_reason, 'created_at', a.created_at)
        order by a.created_at desc, a.id), '[]'::jsonb)
      from (
        select x.* from admin_actions x
        where x.target_work_id = m.work_id and x.target_chapter_id is not distinct from m.chapter_id
        order by x.created_at desc, x.id limit 50
      ) a)
  ) into v_result
  from moderation_review_requests m
  join works w on w.id = m.work_id
  left join chapters c on c.id = m.chapter_id
  where m.id = p_request_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Privileges
-- ---------------------------------------------------------------------------
revoke all on function
  moderation_lock_actor(uuid),
  moderation_target_version(uuid, uuid),
  moderation_lock_target(uuid, uuid),
  moderation_target_blinded(uuid, uuid),
  moderation_set_blind(uuid, uuid, text),
  moderate_report_group(uuid, uuid, uuid, uuid, uuid[], text, text, text, text, timestamptz),
  unblind_moderation_target(uuid, uuid, uuid, uuid, text, text),
  resolve_review_request(uuid, uuid, uuid, text, text, text),
  list_report_groups(text, integer, integer),
  get_report_group_detail(uuid),
  list_review_requests(text, integer, integer),
  get_review_request_detail(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  moderate_report_group(uuid, uuid, uuid, uuid, uuid[], text, text, text, text, timestamptz),
  unblind_moderation_target(uuid, uuid, uuid, uuid, text, text),
  resolve_review_request(uuid, uuid, uuid, text, text, text),
  list_report_groups(text, integer, integer),
  get_report_group_detail(uuid),
  list_review_requests(text, integer, integer),
  get_review_request_detail(uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
