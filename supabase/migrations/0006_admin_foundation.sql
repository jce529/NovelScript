begin;

-- Phase 7 (07-01): moderation schema and administrator trust boundary.
--
-- D-01  Administrator membership lives in admin_users, never in profiles.role.
-- D-02  Operational tables are readable by service_role only; no admin RLS on reports.
-- D-04  admin_actions and membership history are append-only.
-- D-05  Membership is granted by privileged SQL (grant_admin) or the optional seed
--       below, never by an app route. service_role cannot grant membership.
-- D-06  user_sanctions is authoritative; profiles.sanction_kind/sanctioned_until is a
--       cache written only by apply_user_sanction().
-- D-11  admin_blinded is independent of is_published.
--
-- Lock order used by every function in this file and expected by later plans:
--   admin_users (actor membership) -> profiles (target user) -> content rows.

-- ---------------------------------------------------------------------------
-- 1. Administrator membership (grant/revoke history, one active row per user)
-- ---------------------------------------------------------------------------
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  granted_by uuid references profiles(id),
  granted_by_label text,
  grant_reason text not null check (char_length(trim(grant_reason)) > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references profiles(id),
  revoked_by_label text,
  revoke_reason text,
  check (granted_by is not null or char_length(trim(coalesce(granted_by_label, ''))) > 0),
  check ((revoked_at is null) = (revoke_reason is null)),
  check (revoked_at is null or revoked_by is not null
    or char_length(trim(coalesce(revoked_by_label, ''))) > 0)
);
create unique index admin_users_one_active on admin_users(user_id) where revoked_at is null;

create function guard_admin_users_history() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'admin_membership_history_immutable';
  end if;
  -- The only permitted UPDATE is the one-way revocation of an active row.
  if old.revoked_at is not null or new.revoked_at is null
    or new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.granted_by is distinct from old.granted_by
    or new.granted_by_label is distinct from old.granted_by_label
    or new.grant_reason is distinct from old.grant_reason
    or new.granted_at is distinct from old.granted_at
  then
    raise exception 'admin_membership_history_immutable';
  end if;
  return new;
end;
$$;
create trigger admin_users_history_guard before update or delete on admin_users
  for each row execute function guard_admin_users_history();

-- ---------------------------------------------------------------------------
-- 2. Append-only audit log
-- ---------------------------------------------------------------------------
create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  actor_label text,
  action_type text not null check (action_type in (
    'report_resolve', 'report_dismiss',
    'work_blind', 'work_unblind', 'chapter_blind', 'chapter_unblind',
    'user_warn', 'user_suspend', 'user_permanent_suspend', 'user_sanction_lift',
    'review_maintain', 'review_unblind',
    'admin_grant', 'admin_revoke'
  )),
  target_work_id uuid references works(id),
  target_chapter_id uuid,
  target_user_id uuid references profiles(id),
  target_review_request_id uuid,
  report_ids uuid[] not null default '{}',
  reason text,
  public_reason text,
  metadata jsonb not null default '{}',
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  foreign key (target_chapter_id, target_work_id) references chapters(id, work_id),
  -- Only membership changes made by manual SQL may lack an in-app actor.
  check (actor_id is not null or (
    action_type in ('admin_grant', 'admin_revoke')
    and char_length(trim(coalesce(actor_label, ''))) > 0
  )),
  check (target_chapter_id is null or target_work_id is not null)
);
create unique index admin_actions_actor_idempotency
  on admin_actions(actor_id, idempotency_key) where idempotency_key is not null;
create index admin_actions_target_user_idx on admin_actions(target_user_id, created_at desc);
create index admin_actions_target_work_idx on admin_actions(target_work_id, created_at desc);

create function guard_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception '%_append_only', tg_table_name;
end;
$$;
create trigger admin_actions_append_only before update or delete on admin_actions
  for each row execute function guard_append_only();

-- ---------------------------------------------------------------------------
-- 3. Sanction history (source of truth) and warning acknowledgements
-- ---------------------------------------------------------------------------
create table user_sanctions (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  user_id uuid not null references profiles(id),
  kind text not null check (kind in ('warning', 'suspension', 'permanent_suspension', 'lift')),
  public_reason text not null check (char_length(trim(public_reason)) > 0),
  internal_note text,
  ends_at timestamptz,
  created_by uuid not null references profiles(id),
  admin_action_id uuid not null references admin_actions(id),
  created_at timestamptz not null default now(),
  -- Permanent is an explicit kind, never inferred from a null timestamp.
  check ((kind = 'suspension') = (ends_at is not null)),
  unique (id, user_id, kind)
);
create index user_sanctions_user_idx on user_sanctions(user_id, seq desc);
create trigger user_sanctions_append_only before update or delete on user_sanctions
  for each row execute function guard_append_only();

create table warning_acknowledgements (
  sanction_id uuid primary key,
  user_id uuid not null references profiles(id),
  kind text not null default 'warning' check (kind = 'warning'),
  acknowledged_at timestamptz not null default now(),
  foreign key (sanction_id, user_id, kind) references user_sanctions(id, user_id, kind)
);
create trigger warning_acknowledgements_append_only before update or delete on warning_acknowledgements
  for each row execute function guard_append_only();

-- Effective-state cache. 'suspension' keeps its expiry; callers compare with DB now().
alter table profiles
  add column sanction_kind text not null default 'none'
    check (sanction_kind in ('none', 'suspension', 'permanent_suspension')),
  add column sanctioned_until timestamptz,
  add constraint profiles_sanction_cache_shape
    check ((sanction_kind = 'suspension') = (sanctioned_until is not null));

create function guard_profile_sanction_cache() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.sanction_cache_writer', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.sanction_kind <> 'none' or new.sanctioned_until is not null then
      raise exception 'sanction_cache_protected';
    end if;
  elsif new.sanction_kind is distinct from old.sanction_kind
    or new.sanctioned_until is distinct from old.sanctioned_until then
    raise exception 'sanction_cache_protected';
  end if;
  return new;
end;
$$;
create trigger profiles_sanction_cache_guard before insert or update on profiles
  for each row execute function guard_profile_sanction_cache();

-- ---------------------------------------------------------------------------
-- 4. Blinding flags (independent of author publication state)
-- ---------------------------------------------------------------------------
alter table works
  add column admin_blinded boolean not null default false,
  add column admin_blind_reason text,
  add column admin_blinded_at timestamptz,
  add constraint works_admin_blind_shape check (
    (admin_blinded and char_length(trim(coalesce(admin_blind_reason, ''))) > 0 and admin_blinded_at is not null)
    or (not admin_blinded and admin_blind_reason is null and admin_blinded_at is null)
  );

alter table chapters
  add column admin_blinded boolean not null default false,
  add column admin_blind_reason text,
  add column admin_blinded_at timestamptz,
  add constraint chapters_admin_blind_shape check (
    (admin_blinded and char_length(trim(coalesce(admin_blind_reason, ''))) > 0 and admin_blinded_at is not null)
    or (not admin_blinded and admin_blind_reason is null and admin_blinded_at is null)
  );

-- ---------------------------------------------------------------------------
-- 5. Writer re-review requests (D-15/D-16)
-- ---------------------------------------------------------------------------
create table moderation_review_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid,
  message text check (message is null or char_length(message) <= 2000),
  status text not null default 'open' check (status in ('open', 'maintained', 'unblinded')),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  -- Chapter must belong to the requested work (MATCH SIMPLE: null chapter = work target).
  foreign key (chapter_id, work_id) references chapters(id, work_id),
  check ((status = 'open') = (resolved_at is null)),
  check ((status = 'open') = (resolved_by is null))
);
-- At most one open request per target. NULL chapter IDs never collide in a plain unique
-- index, so work-level and chapter-level targets get separate partial indexes.
create unique index moderation_review_requests_open_work
  on moderation_review_requests(work_id) where status = 'open' and chapter_id is null;
create unique index moderation_review_requests_open_chapter
  on moderation_review_requests(chapter_id) where status = 'open' and chapter_id is not null;
create index moderation_review_requests_open_created
  on moderation_review_requests(created_at) where status = 'open';

create index if not exists reports_status_created_idx on reports(status, created_at);

-- ---------------------------------------------------------------------------
-- 6. Privileges: browser roles
-- ---------------------------------------------------------------------------
alter table admin_users enable row level security;
alter table admin_actions enable row level security;
alter table user_sanctions enable row level security;
alter table warning_acknowledgements enable row level security;
alter table moderation_review_requests enable row level security;

revoke all on admin_users, admin_actions, user_sanctions, warning_acknowledgements,
  moderation_review_requests from public, anon, authenticated, service_role;

-- Recipients read their own sanctions/acknowledgements (warning notice, D-09).
create policy user_sanctions_read_own on user_sanctions for select using (user_id = auth.uid());
create policy warning_acknowledgements_read_own on warning_acknowledgements for select
  using (user_id = auth.uid());
grant select (id, user_id, kind, public_reason, ends_at, created_at) on user_sanctions to authenticated;
grant select on warning_acknowledgements to authenticated;

-- Writers read and create their own review requests for their own blinded target.
create policy moderation_review_requests_read_own on moderation_review_requests for select
  using (requester_id = auth.uid());
create policy moderation_review_requests_insert_own on moderation_review_requests for insert
  with check (
    requester_id = auth.uid()
    and exists (
      select 1 from works w
      where w.id = moderation_review_requests.work_id
        and w.owner_id = auth.uid() and w.deleted_at is null
        and (
          (moderation_review_requests.chapter_id is null and w.admin_blinded)
          or exists (
            select 1 from chapters c
            where c.id = moderation_review_requests.chapter_id and c.work_id = w.id
              and c.deleted_at is null and c.admin_blinded
          )
        )
    )
  );
grant select (id, work_id, chapter_id, message, status, resolved_at, created_at)
  on moderation_review_requests to authenticated;
grant insert (requester_id, work_id, chapter_id, message) on moderation_review_requests to authenticated;

-- Profiles: sanction cache and deletion state are not owner-writable.
revoke insert, update, delete, truncate, references, trigger on profiles from anon, authenticated;
grant update (role, pen_name, pen_name_bio, pen_name_set_at, updated_at) on profiles to authenticated;

-- Works: owner-editable columns only; moderation flags are excluded from INSERT and UPDATE.
revoke insert, update, delete, truncate, references, trigger on works from anon, authenticated;
grant insert (id, owner_id, title, synopsis, cover_image_url, genre) on works to authenticated;
grant update (title, synopsis, cover_image_url, genre, updated_at, deleted_at) on works to authenticated;

-- Chapters: preserve every existing studio edit column; keep content SELECT protected.
revoke insert, update, delete, truncate, references, trigger on chapters from anon, authenticated;
grant insert (id, work_id, title, content, order_index, is_published, price_tier,
  published_at, unpublished_at, folder_id) on chapters to authenticated;
grant update (title, content, order_index, is_published, price_tier, published_at,
  unpublished_at, updated_at, deleted_at, folder_id) on chapters to authenticated;
grant select (admin_blinded, admin_blind_reason, admin_blinded_at) on chapters to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Privileges: service role (operational reads; mutations via functions only)
-- ---------------------------------------------------------------------------
grant select on admin_users, admin_actions, user_sanctions, warning_acknowledgements,
  moderation_review_requests to service_role;
grant insert on admin_actions to service_role;

-- ---------------------------------------------------------------------------
-- 8. Membership management (privileged SQL only; see docs/admin-bootstrap.md)
-- ---------------------------------------------------------------------------
create function grant_admin(p_user_id uuid, p_reason text, p_operator_label text,
  p_granted_by uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_user_id is null then raise exception 'explicit_user_id_required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason_required'; end if;
  if p_granted_by is null and char_length(trim(coalesce(p_operator_label, ''))) = 0 then
    raise exception 'operator_label_required';
  end if;
  if p_granted_by is not null then
    perform 1 from admin_users where user_id = p_granted_by and revoked_at is null for share;
    if not found then raise exception 'actor_not_admin'; end if;
  end if;
  perform 1 from profiles where id = p_user_id and deleted_at is null for update;
  if not found then raise exception 'profile_not_found'; end if;
  if exists (select 1 from admin_users where user_id = p_user_id and revoked_at is null) then
    raise exception 'admin_already_active';
  end if;

  insert into admin_users(user_id, granted_by, granted_by_label, grant_reason)
    values (p_user_id, p_granted_by, nullif(trim(p_operator_label), ''), trim(p_reason))
    returning id into v_id;
  insert into admin_actions(actor_id, actor_label, action_type, target_user_id, reason, metadata)
    values (p_granted_by, nullif(trim(p_operator_label), ''), 'admin_grant', p_user_id, trim(p_reason),
      jsonb_build_object('admin_user_id', v_id));
  return v_id;
end;
$$;

create function revoke_admin(p_user_id uuid, p_reason text, p_operator_label text,
  p_revoked_by uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_user_id is null then raise exception 'explicit_user_id_required'; end if;
  if char_length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'reason_required'; end if;
  if p_revoked_by is null and char_length(trim(coalesce(p_operator_label, ''))) = 0 then
    raise exception 'operator_label_required';
  end if;
  if p_revoked_by is not null then
    perform 1 from admin_users where user_id = p_revoked_by and revoked_at is null for share;
    if not found then raise exception 'actor_not_admin'; end if;
  end if;

  update admin_users
    set revoked_at = now(), revoked_by = p_revoked_by,
        revoked_by_label = nullif(trim(p_operator_label), ''), revoke_reason = trim(p_reason)
    where user_id = p_user_id and revoked_at is null
    returning id into v_id;
  if v_id is null then raise exception 'admin_not_active'; end if;

  insert into admin_actions(actor_id, actor_label, action_type, target_user_id, reason, metadata)
    values (p_revoked_by, nullif(trim(p_operator_label), ''), 'admin_revoke', p_user_id, trim(p_reason),
      jsonb_build_object('admin_user_id', v_id));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Single sanction write path: history row + derived cache in one locked step
-- ---------------------------------------------------------------------------
create function refresh_sanction_cache(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_last_lift bigint;
  v_kind text := 'none';
  v_until timestamptz;
begin
  select max(seq) into v_last_lift from user_sanctions where user_id = p_user_id and kind = 'lift';

  -- Warnings never participate. After the latest explicit lift, permanent dominates and
  -- otherwise the furthest timed expiry wins, so a later shorter suspension cannot shorten
  -- an existing one; only 'lift' reduces a sanction.
  if exists (select 1 from user_sanctions where user_id = p_user_id
      and kind = 'permanent_suspension' and seq > coalesce(v_last_lift, 0)) then
    v_kind := 'permanent_suspension';
  else
    select max(ends_at) into v_until from user_sanctions
      where user_id = p_user_id and kind = 'suspension' and seq > coalesce(v_last_lift, 0);
    if v_until is not null then v_kind := 'suspension'; end if;
  end if;

  perform set_config('app.sanction_cache_writer', 'on', true);
  update profiles set sanction_kind = v_kind, sanctioned_until = v_until where id = p_user_id;
  perform set_config('app.sanction_cache_writer', '', true);
end;
$$;

create function apply_user_sanction(p_actor_id uuid, p_user_id uuid, p_kind text,
  p_public_reason text, p_internal_note text, p_ends_at timestamptz, p_admin_action_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_expected_action text;
begin
  if p_kind not in ('warning', 'suspension', 'permanent_suspension', 'lift') then
    raise exception 'invalid_sanction_kind';
  end if;
  if char_length(trim(coalesce(p_public_reason, ''))) = 0 then raise exception 'reason_required'; end if;
  if (p_kind = 'suspension') <> (p_ends_at is not null) then raise exception 'invalid_sanction_expiry'; end if;
  if p_kind = 'suspension' and p_ends_at <= now() then raise exception 'invalid_sanction_expiry'; end if;
  if p_actor_id is not distinct from p_user_id then raise exception 'self_sanction_forbidden'; end if;

  perform 1 from admin_users where user_id = p_actor_id and revoked_at is null for share;
  if not found then raise exception 'actor_not_admin'; end if;
  perform 1 from profiles where id = p_user_id and deleted_at is null for update;
  if not found then raise exception 'profile_not_found'; end if;

  v_expected_action := case p_kind
    when 'warning' then 'user_warn'
    when 'suspension' then 'user_suspend'
    when 'permanent_suspension' then 'user_permanent_suspend'
    else 'user_sanction_lift' end;
  perform 1 from admin_actions where id = p_admin_action_id and actor_id = p_actor_id
    and target_user_id = p_user_id and action_type = v_expected_action;
  if not found then raise exception 'audit_action_mismatch'; end if;

  insert into user_sanctions(user_id, kind, public_reason, internal_note, ends_at, created_by, admin_action_id)
    values (p_user_id, p_kind, trim(p_public_reason), nullif(trim(coalesce(p_internal_note, '')), ''),
      p_ends_at, p_actor_id, p_admin_action_id)
    returning id into v_id;
  if p_kind <> 'warning' then
    perform refresh_sanction_cache(p_user_id);
  end if;
  return v_id;
end;
$$;

-- Recipient-only warning acknowledgement (D-09 account-control exception).
create function acknowledge_warning(p_sanction_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  perform 1 from profiles where id = v_user and deleted_at is null;
  if not found then raise exception 'authentication_required'; end if;
  perform 1 from user_sanctions where id = p_sanction_id and user_id = v_user and kind = 'warning';
  if not found then raise exception 'warning_not_found'; end if;
  insert into warning_acknowledgements(sanction_id, user_id) values (p_sanction_id, v_user)
    on conflict (sanction_id) do nothing;
  return true;
end;
$$;

revoke all on function grant_admin(uuid, text, text, uuid), revoke_admin(uuid, text, text, uuid),
  refresh_sanction_cache(uuid), apply_user_sanction(uuid, uuid, text, text, text, timestamptz, uuid),
  acknowledge_warning(uuid), guard_admin_users_history(), guard_append_only(),
  guard_profile_sanction_cache()
  from public, anon, authenticated, service_role;
grant execute on function apply_user_sanction(uuid, uuid, text, text, text, timestamptz, uuid) to service_role;
grant execute on function acknowledge_warning(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Optional first-administrator seed (D-05). Runs only when the operator supplies an
--     existing profile ID in this session, e.g.
--       set app.bootstrap_admin_user_id = '<uuid>'; set app.bootstrap_admin_operator = '<name>';
--     Absent setting => no-op. There is no default identity and no "first user" fallback.
-- ---------------------------------------------------------------------------
do $$
declare
  v_raw text := nullif(trim(coalesce(current_setting('app.bootstrap_admin_user_id', true), '')), '');
  v_operator text := nullif(trim(coalesce(current_setting('app.bootstrap_admin_operator', true), '')), '');
begin
  if v_raw is null then
    raise notice 'admin bootstrap skipped: app.bootstrap_admin_user_id not supplied';
    return;
  end if;
  if exists (select 1 from admin_users where user_id = v_raw::uuid and revoked_at is null) then
    raise notice 'admin bootstrap skipped: membership already active';
    return;
  end if;
  perform grant_admin(v_raw::uuid, 'initial administrator bootstrap', coalesce(v_operator, 'migration-seed'));
end;
$$;

notify pgrst, 'reload schema';
commit;
