begin;

-- Phase 18 (18-03): per-branch timelines (WORLD-TREE rules 10, 11, 12, 16; WTREE-01/02/03/04).
-- Apply after 0032_world_tree_schema.sql, 0033_world_tree_eligibility.sql and
-- 0034_world_tree_branching.sql.
--
-- Contents:
--   1. Deferrable order uniqueness for era positions and placement order (replaces the 0032
--      partial unique indexes so a reorder/swap inside one save never trips a transient dupe).
--   2. Internal helpers (input shape checks, clone flag).
--   3. Placement world/owner rule (guard_world_tree_same_world re-created: a placement work is
--      either a branch work of the same world or a plain, live, same-owner work = "new fruit").
--   4. Era / placement guards: inherited copies are immutable on every path, independent eras
--      only come after the inherited span, memo only on independent eras of a child branch,
--      one work belongs to one line only.
--   5. ensure_world_tree(p_work_id) -> {"branch_id","root_work_id","created"}: trunk + first era
--      + the original's placement, idempotent.
--   6. clone_world_branch_timeline(p_branch_id, p_fork_era_id): replaces the 0034 fail-closed
--      placeholder with the SAME signature. Internal only (no API grant); confirm_world_branch
--      calls it inside its own transaction.
--   7. save_world_timeline(p_branch_id, p_eras, p_placements) -> {"branch_id","eras","placementCount"}.
--
-- Rules implemented here:
--   * An era needs a non-empty name and a position; the year label is optional (rule 10).
--     Positions are dense (0..n-1) per branch, placement order is dense (0..m-1) per era, and
--     the first work of an era can never be concurrent (rule 11).
--   * A child branch copies its DIRECT parent's eras up to and including the fork era, together
--     with their live placements, as inherited rows (source_era_id = parent era). A nested
--     branch therefore inherits from its parent line, not from the trunk. The first independent
--     era ("분기 이후") follows and holds the new work (rule 12). Copies are rows of their own:
--     later edits of the parent timeline are never propagated (snapshot principle, rule 3).
--   * Inherited eras and their placements cannot be changed, deleted or added to by any path
--     (trigger, so SECURITY DEFINER code is bound too). save_world_timeline additionally
--     requires the full inherited span to be resent unchanged, so omitting it cannot delete or
--     alter it.
--   * "본가지 대응 메모" (rule 16) is only stored on independent eras of If/expand branches;
--     the trunk and inherited eras never carry a memo.
--   * A change-free copy is not a branch (rule 2): it is added as a plain owned work placement
--     on an existing trunk/branch line through save_world_timeline. A work belongs to one line
--     only (duplicate own placements and placements in another world are rejected).
--
-- Lock order (same as 0034): root work FOR UPDATE -> parent work FOR UPDATE -> branch work
-- FOR UPDATE -> world_branches row FOR UPDATE -> plain fruit works FOR UPDATE (by id).
-- A concurrent confirm of a child (which reads the parent timeline in clone) and a save of that
-- parent therefore serialise on the same rows.
--
-- WTREE-09 note: when a parent is private, pre-fork document locks follow the child reader's
-- progress. Not implemented in Phase 18.
-- Static source checks (tests/world-tree/timeline-source.test.ts) are not runtime proof; the
-- live-DB suite (tests/world-tree/timeline.database.test.ts) runs in 18-12.

-- ---------------------------------------------------------------------------
-- 1. Deferrable order uniqueness
-- ---------------------------------------------------------------------------
drop index if exists world_eras_live_position;
alter table world_eras drop constraint if exists world_eras_live_position_excl;
alter table world_eras add constraint world_eras_live_position_excl
  exclude using btree (branch_id with =, position with =) where (deleted_at is null)
  deferrable initially deferred;

drop index if exists world_era_placements_live_order;
alter table world_era_placements drop constraint if exists world_era_placements_live_order_excl;
alter table world_era_placements add constraint world_era_placements_live_order_excl
  exclude using btree (branch_id with =, era_id with =, order_index with =) where (deleted_at is null)
  deferrable initially deferred;

create index if not exists world_era_placements_era_idx on world_era_placements (era_id)
  where deleted_at is null;
create index if not exists world_branches_fork_era_idx on world_branches (fork_era_id)
  where fork_era_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Internal helpers (no API grants)
-- ---------------------------------------------------------------------------
create or replace function world_timeline_is_uuid(p_value text) returns boolean
language sql immutable parallel safe set search_path = public as $$
  select coalesce(p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;
revoke all on function world_timeline_is_uuid(text) from public, anon, authenticated, service_role;

-- A non-negative JSON integer (no fraction, no exponent, at most 5 digits).
create or replace function world_timeline_is_index(p_value jsonb) returns boolean
language sql immutable parallel safe set search_path = public as $$
  select coalesce(jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]{1,5}$', false);
$$;
revoke all on function world_timeline_is_index(jsonb) from public, anon, authenticated, service_role;

-- JSON null / missing, or a string no longer than p_max characters.
create or replace function world_timeline_is_optional_text(p_value jsonb, p_max integer) returns boolean
language sql immutable parallel safe set search_path = public as $$
  select case coalesce(jsonb_typeof(p_value), 'null')
           when 'null' then true
           when 'string' then char_length(p_value #>> '{}') <= p_max
           else false end;
$$;
revoke all on function world_timeline_is_optional_text(jsonb, integer) from public, anon, authenticated, service_role;

-- True only inside clone_world_branch_timeline for that branch (transaction-local setting).
create or replace function world_timeline_clone_active(p_branch_id uuid) returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('world_tree.timeline_clone', true), '') = p_branch_id::text;
$$;
revoke all on function world_timeline_clone_active(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Same-world guard (0032 body; only the placement branch changes)
-- ---------------------------------------------------------------------------
create or replace function guard_world_tree_same_world() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_branch world_branches%rowtype;
begin
  select * into v_branch from world_branches where id = NEW.branch_id;
  if not found then
    raise exception 'world_branch_not_found';
  end if;

  if TG_TABLE_NAME = 'world_era_placements' then
    -- Tombstoning a placement never re-validates the (possibly deleted) work.
    if TG_OP = 'UPDATE' and NEW.deleted_at is not null and NEW.work_id = OLD.work_id
       and NEW.branch_id = OLD.branch_id then
      return NEW;
    end if;
    if exists (select 1 from world_branches b where b.work_id = NEW.work_id) then
      -- A branch work: it must belong to this world and be live.
      if not exists (select 1 from world_branches b
                      where b.work_id = NEW.work_id and b.root_work_id = v_branch.root_work_id
                        and b.deleted_at is null) then
        raise exception 'world_tree_cross_world';
      end if;
    elsif not exists (select 1 from works w
                       where w.id = NEW.work_id and w.owner_id = v_branch.owner_id
                         and w.deleted_at is null and not w.is_branch_draft) then
      -- A plain work (new fruit without a branch): same owner, live, not a branch draft.
      raise exception 'world_tree_cross_world';
    end if;
  elsif TG_TABLE_NAME = 'world_branch_notices' then
    if not exists (select 1 from world_branches b
                    where b.work_id = NEW.source_work_id and b.root_work_id = v_branch.root_work_id) then
      raise exception 'world_tree_cross_world';
    end if;
  elsif TG_TABLE_NAME = 'world_branch_docs' then
    if NEW.copied_node_id is not null and not exists (
      select 1 from kb_nodes n where n.id = NEW.copied_node_id and n.work_id = v_branch.work_id
    ) then
      raise exception 'world_tree_cross_world';
    end if;
    if NEW.source_node_id is not null and not exists (
      select 1 from kb_nodes n join world_branches b on b.work_id = n.work_id
       where n.id = NEW.source_node_id and b.root_work_id = v_branch.root_work_id
    ) then
      raise exception 'world_tree_cross_world';
    end if;
  elsif TG_TABLE_NAME = 'world_eras' then
    if NEW.source_era_id is not null and not exists (
      select 1 from world_eras e join world_branches b on b.id = e.branch_id
       where e.id = NEW.source_era_id and b.root_work_id = v_branch.root_work_id
    ) then
      raise exception 'world_tree_cross_world';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_tree_same_world() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Era / placement guards (every write path, including SECURITY DEFINER code)
-- ---------------------------------------------------------------------------
create or replace function guard_world_era_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_kind text;
  v_last_inherited integer;
begin
  -- Inherited copies never change and are never deleted.
  if TG_OP in ('UPDATE', 'DELETE') and OLD.inherited then
    raise exception 'world_timeline_inherited_locked';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  if TG_OP = 'UPDATE'
     and (NEW.id, NEW.branch_id, NEW.inherited, NEW.source_era_id, NEW.created_at)
         is distinct from (OLD.id, OLD.branch_id, OLD.inherited, OLD.source_era_id, OLD.created_at) then
    raise exception 'world_timeline_inherited_locked';
  end if;

  if NEW.inherited then
    -- Only clone_world_branch_timeline creates inherited rows (INSERT; UPDATE was rejected above).
    if not world_timeline_clone_active(NEW.branch_id) then
      raise exception 'world_timeline_inherited_locked';
    end if;
    if NEW.memo is not null then
      raise exception 'world_timeline_memo_not_allowed';
    end if;
  elsif NEW.deleted_at is null then
    -- Independent eras only come after the inherited span.
    select coalesce(max(e.position), -1) into v_last_inherited
      from world_eras e
     where e.branch_id = NEW.branch_id and e.inherited and e.deleted_at is null;
    if NEW.position <= v_last_inherited then
      raise exception 'world_timeline_inherited_locked';
    end if;
    -- "본가지 대응 메모" only on independent eras of a child branch (never on the trunk).
    if NEW.memo is not null then
      select b.kind into v_kind from world_branches b where b.id = NEW.branch_id;
      if v_kind is null or v_kind not in ('if', 'expand') then
        raise exception 'world_timeline_memo_not_allowed';
      end if;
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function guard_world_era_rules() from public, anon, authenticated, service_role;

drop trigger if exists world_eras_guard_timeline on world_eras;
create trigger world_eras_guard_timeline before insert or update or delete on world_eras
  for each row execute function guard_world_era_rules();

create or replace function guard_world_era_placement_rules() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_era world_eras%rowtype;
  v_root uuid;
begin
  -- A placement inside an inherited era never changes and is never deleted.
  if TG_OP in ('UPDATE', 'DELETE')
     and exists (select 1 from world_eras e where e.id = OLD.era_id and e.inherited) then
    raise exception 'world_timeline_inherited_locked';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  if TG_OP = 'UPDATE'
     and (NEW.id, NEW.branch_id, NEW.work_id, NEW.created_at)
         is distinct from (OLD.id, OLD.branch_id, OLD.work_id, OLD.created_at) then
    raise exception 'world_timeline_placement_invalid';
  end if;

  select * into v_era from world_eras e where e.id = NEW.era_id;
  if not found then
    raise exception 'world_timeline_era_invalid';
  end if;

  if v_era.inherited then
    if TG_OP <> 'INSERT' or not world_timeline_clone_active(NEW.branch_id) then
      raise exception 'world_timeline_inherited_locked';
    end if;
  elsif NEW.deleted_at is null then
    if v_era.deleted_at is not null then
      raise exception 'world_timeline_era_invalid';
    end if;
    -- Another branch's work is placed on its own line only.
    if exists (select 1 from world_branches b where b.work_id = NEW.work_id and b.id <> NEW.branch_id) then
      raise exception 'world_timeline_work_not_placeable';
    end if;
    -- One work belongs to one line: no own placement on another line, nothing in another world.
    -- (Inherited copies of the same world are snapshots, not membership.)
    select b.root_work_id into v_root from world_branches b where b.id = NEW.branch_id;
    if exists (
      select 1
        from world_era_placements p
        join world_branches b on b.id = p.branch_id
        join world_eras e on e.id = p.era_id
       where p.work_id = NEW.work_id and p.deleted_at is null and p.branch_id <> NEW.branch_id
         and (b.root_work_id <> v_root or not e.inherited)
    ) then
      raise exception 'world_timeline_duplicate_work';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function guard_world_era_placement_rules() from public, anon, authenticated, service_role;

drop trigger if exists world_era_placements_guard_timeline on world_era_placements;
create trigger world_era_placements_guard_timeline before insert or update or delete on world_era_placements
  for each row execute function guard_world_era_placement_rules();

-- ---------------------------------------------------------------------------
-- 5. ensure_world_tree (trunk + first era + original placement, idempotent)
-- ---------------------------------------------------------------------------
create or replace function ensure_world_tree(p_work_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_work works%rowtype;
  v_branch world_branches%rowtype;
  v_era uuid;
  v_created boolean := false;
begin
  -- 1. auth -> writer -> write access
  v_uid := world_tree_require_writer();

  -- 2. ownership (a missing work and someone else's work raise the same code)
  select * into v_work from works w where w.id = p_work_id;
  if not found or v_work.owner_id <> v_uid or v_work.deleted_at is not null or v_work.is_branch_draft then
    raise exception 'world_tree_forbidden';
  end if;

  -- 3. root -> work locks, then the branch row
  perform world_tree_lock_root_then(p_work_id);
  select * into v_branch from world_branches b where b.work_id = p_work_id for update of b;

  if found then
    if v_branch.deleted_at is not null or v_branch.status <> 'confirmed' then
      raise exception 'world_tree_forbidden';
    end if;
    if v_branch.kind <> 'trunk' then
      -- A child branch got its timeline at confirm (clone_world_branch_timeline).
      return jsonb_build_object('branch_id', v_branch.id, 'root_work_id', v_branch.root_work_id,
                                'created', false);
    end if;
  else
    -- A plain fruit already placed on another line belongs to that world.
    if exists (select 1 from world_era_placements p where p.work_id = p_work_id and p.deleted_at is null) then
      raise exception 'world_timeline_duplicate_work';
    end if;
    insert into world_branches (root_work_id, work_id, owner_id, parent_branch_id, kind, status,
                                fork_era_id, depth, confirmed_at)
    values (p_work_id, p_work_id, v_uid, null, 'trunk', 'confirmed', null, 0, now())
    returning * into v_branch;
    v_created := true;
  end if;

  -- 4. the trunk always has at least one era and the original's own placement
  if not exists (select 1 from world_eras e where e.branch_id = v_branch.id and e.deleted_at is null) then
    insert into world_eras (branch_id, position, name) values (v_branch.id, 0, '1기');
    v_created := true;
  end if;
  if not exists (select 1 from world_era_placements p
                  where p.branch_id = v_branch.id and p.work_id = p_work_id and p.deleted_at is null) then
    select e.id into v_era from world_eras e
     where e.branch_id = v_branch.id and e.deleted_at is null
     order by e.position, e.id limit 1;
    insert into world_era_placements (branch_id, era_id, work_id, order_index, concurrent_with_prev)
    values (v_branch.id, v_era, p_work_id,
            (select count(*)::integer from world_era_placements p
              where p.branch_id = v_branch.id and p.era_id = v_era and p.deleted_at is null),
            false);
    v_created := true;
  end if;

  return jsonb_build_object('branch_id', v_branch.id, 'root_work_id', v_branch.root_work_id,
                            'created', v_created);
end;
$$;
revoke all on function ensure_world_tree(uuid) from public, anon, service_role;
grant execute on function ensure_world_tree(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. clone_world_branch_timeline (internal; called by confirm_world_branch only)
-- ---------------------------------------------------------------------------
-- Same signature as the 0034 placeholder, so `create or replace` swaps the body and confirm
-- stops failing closed. p_fork_era_id is the era of the SOURCE parent line chosen in step 4 of
-- the branch flow; it must equal the stored fork (confirm sets it before calling).
create or replace function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_branch world_branches%rowtype;
  v_fork world_eras%rowtype;
  v_new_era uuid;
  v_own_era uuid;
  v_next integer := 0;
  r record;
begin
  select * into v_branch from world_branches b where b.id = p_branch_id;
  if not found or v_branch.kind = 'trunk' or v_branch.deleted_at is not null
     or v_branch.status <> 'confirmed' or v_branch.fork_era_id is distinct from p_fork_era_id then
    raise exception 'world_branch_fork_era_invalid';
  end if;
  -- The fork is an era of the direct parent line (never an era of the new branch itself).
  select * into v_fork from world_eras e where e.id = p_fork_era_id;
  if not found or v_fork.branch_id <> v_branch.parent_branch_id or v_fork.deleted_at is not null then
    raise exception 'world_branch_fork_era_invalid';
  end if;
  if exists (select 1 from world_eras e where e.branch_id = p_branch_id) then
    raise exception 'world_timeline_already_cloned';
  end if;

  perform set_config('world_tree.timeline_clone', p_branch_id::text, true);

  -- Parent eras up to and including the fork, in order, as inherited copies (dense positions).
  for r in
    select e.id, e.name, e.year_label
      from world_eras e
     where e.branch_id = v_branch.parent_branch_id and e.deleted_at is null
       and e.position <= v_fork.position
     order by e.position, e.id
  loop
    insert into world_eras (branch_id, source_era_id, position, name, year_label, memo, inherited)
    values (p_branch_id, r.id, v_next, r.name, r.year_label, null, true)
    returning id into v_new_era;

    -- Live placements of live works, order re-densified; the first is never concurrent.
    insert into world_era_placements (branch_id, era_id, work_id, order_index, concurrent_with_prev,
                                      relation_label)
    select p_branch_id, v_new_era, x.work_id, x.rn - 1, x.concurrent_with_prev and x.rn > 1, x.relation_label
      from (select p.work_id, p.concurrent_with_prev, p.relation_label,
                   row_number() over (order by p.order_index, p.id) as rn
              from world_era_placements p
              join works w on w.id = p.work_id
             where p.branch_id = v_branch.parent_branch_id and p.era_id = r.id
               and p.deleted_at is null and w.deleted_at is null and not w.is_branch_draft) x;

    v_next := v_next + 1;
  end loop;

  perform set_config('world_tree.timeline_clone', '', true);

  -- The first independent era right after the fork holds the new work.
  insert into world_eras (branch_id, position, name, inherited)
  values (p_branch_id, v_next, '분기 이후', false)
  returning id into v_own_era;
  insert into world_era_placements (branch_id, era_id, work_id, order_index, concurrent_with_prev)
  values (p_branch_id, v_own_era, v_branch.work_id, 0, false);
end;
$$;
revoke all on function clone_world_branch_timeline(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. save_world_timeline
-- ---------------------------------------------------------------------------
-- p_eras:       [{ id: uuid|null, position: int, name: text, yearLabel: text|null, memo: text|null }]
--               id null or an unknown id = a new independent era (the client may pre-assign a
--               uuid so new eras can already hold placements).
-- p_placements: [{ eraId: uuid, workId: uuid, orderIndex: int, concurrentWithPrev: bool,
--                  relationLabel: text|null }]
-- The payload is the FULL timeline of the branch: the inherited span must be resent unchanged,
-- an omitted independent era is deleted (only when it holds no work and is no live fork point),
-- an omitted placement is removed from the line (the branch's own work can never be removed).
create or replace function save_world_timeline(p_branch_id uuid, p_eras jsonb, p_placements jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_branch world_branches%rowtype;
  v_parent_work uuid;
  v_item jsonb;
  v_eras jsonb := '[]'::jsonb;
  v_places jsonb := '[]'::jsonb;
  v_last_inherited integer;
  v_count integer;
begin
  -- 1. auth -> writer -> write access
  v_uid := world_tree_require_writer();

  -- 2. ownership (a missing branch and someone else's branch raise the same code)
  select * into v_branch from world_branches b where b.id = p_branch_id;
  if not found or v_branch.owner_id <> v_uid then
    raise exception 'world_tree_forbidden';
  end if;

  -- 3. root -> parent work -> branch work -> branch row (same order as confirm_world_branch)
  if v_branch.parent_branch_id is not null then
    select b.work_id into v_parent_work from world_branches b where b.id = v_branch.parent_branch_id;
    perform world_tree_lock_root_then(v_parent_work);
    perform 1 from works w where w.id = v_branch.work_id for update of w;
  else
    perform world_tree_lock_root_then(v_branch.work_id);
  end if;
  select * into v_branch from world_branches b where b.id = p_branch_id for update of b;
  if v_branch.deleted_at is not null or v_branch.status <> 'confirmed'
     or not exists (select 1 from works w where w.id = v_branch.work_id and w.deleted_at is null) then
    raise exception 'world_tree_forbidden';
  end if;

  -- 4. payload shape (exact keys, types, lengths)
  if jsonb_typeof(p_eras) is distinct from 'array' or jsonb_typeof(p_placements) is distinct from 'array'
     or jsonb_array_length(p_eras) < 1 or jsonb_array_length(p_eras) > 256
     or jsonb_array_length(p_placements) > 4096 then
    raise exception 'world_timeline_input_invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_eras) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_item) k
                   where k not in ('id', 'position', 'name', 'yearLabel', 'memo'))
       or not (coalesce(jsonb_typeof(v_item -> 'id'), 'null') = 'null'
               or (jsonb_typeof(v_item -> 'id') = 'string' and world_timeline_is_uuid(v_item ->> 'id')))
       or not world_timeline_is_index(v_item -> 'position')
       or jsonb_typeof(v_item -> 'name') is distinct from 'string'
       or char_length(v_item ->> 'name') > 80
       or not world_timeline_is_optional_text(v_item -> 'yearLabel', 80)
       or not world_timeline_is_optional_text(v_item -> 'memo', 500) then
      raise exception 'world_timeline_input_invalid';
    end if;
    if char_length(btrim(v_item ->> 'name')) = 0 then
      raise exception 'world_timeline_era_name_required';
    end if;
    v_eras := v_eras || jsonb_build_array(jsonb_build_object(
      'id', coalesce(v_item ->> 'id', gen_random_uuid()::text),
      'position', (v_item ->> 'position')::integer,
      'name', btrim(v_item ->> 'name'),
      'year_label', nullif(btrim(coalesce(v_item ->> 'yearLabel', '')), ''),
      'memo', nullif(btrim(coalesce(v_item ->> 'memo', '')), '')));
  end loop;

  for v_item in select value from jsonb_array_elements(p_placements) loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_item) k
                   where k not in ('eraId', 'workId', 'orderIndex', 'concurrentWithPrev', 'relationLabel'))
       or jsonb_typeof(v_item -> 'eraId') is distinct from 'string'
       or not world_timeline_is_uuid(v_item ->> 'eraId')
       or jsonb_typeof(v_item -> 'workId') is distinct from 'string'
       or not world_timeline_is_uuid(v_item ->> 'workId')
       or not world_timeline_is_index(v_item -> 'orderIndex')
       or jsonb_typeof(v_item -> 'concurrentWithPrev') is distinct from 'boolean'
       or not world_timeline_is_optional_text(v_item -> 'relationLabel', 40) then
      raise exception 'world_timeline_input_invalid';
    end if;
    v_places := v_places || jsonb_build_array(jsonb_build_object(
      'era_id', v_item ->> 'eraId',
      'work_id', v_item ->> 'workId',
      'order_index', (v_item ->> 'orderIndex')::integer,
      'concurrent', (v_item ->> 'concurrentWithPrev')::boolean,
      'relation_label', nullif(btrim(coalesce(v_item ->> 'relationLabel', '')), '')));
  end loop;

  -- 5. eras: unique ids, dense positions, ids of this branch only
  if (select count(*) <> count(distinct x.id)
        from jsonb_to_recordset(v_eras) as x(id uuid, position integer)) then
    raise exception 'world_timeline_input_invalid';
  end if;
  if (select count(distinct x.position) <> count(*) or min(x.position) <> 0 or max(x.position) <> count(*) - 1
        from jsonb_to_recordset(v_eras) as x(id uuid, position integer)) then
    raise exception 'world_timeline_order_invalid';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid)
               join world_eras e on e.id = x.id
              where e.branch_id <> p_branch_id) then
    raise exception 'world_tree_forbidden';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid)
               join world_eras e on e.id = x.id
              where e.branch_id = p_branch_id and e.deleted_at is not null) then
    raise exception 'world_timeline_era_invalid';
  end if;

  -- 6. the inherited span must be resent exactly (no omission, no change, no memo)
  if exists (
    select 1 from world_eras e
     where e.branch_id = p_branch_id and e.inherited and e.deleted_at is null
       and not exists (
         select 1 from jsonb_to_recordset(v_eras) as x(id uuid, position integer, name text,
                                                        year_label text, memo text)
          where x.id = e.id and x.position = e.position and x.name = btrim(e.name)
            and x.year_label is not distinct from nullif(btrim(coalesce(e.year_label, '')), '')
            and x.memo is null)
  ) then
    raise exception 'world_timeline_inherited_locked';
  end if;

  -- 7. independent eras only after the inherited span; memo only on a child branch
  select coalesce(max(e.position), -1) into v_last_inherited
    from world_eras e where e.branch_id = p_branch_id and e.inherited and e.deleted_at is null;
  if exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid, position integer)
              where x.position <= v_last_inherited
                and not exists (select 1 from world_eras e
                                 where e.id = x.id and e.branch_id = p_branch_id and e.inherited)) then
    raise exception 'world_timeline_inherited_locked';
  end if;
  if v_branch.kind = 'trunk'
     and exists (select 1 from jsonb_to_recordset(v_eras) as x(memo text) where x.memo is not null) then
    raise exception 'world_timeline_memo_not_allowed';
  end if;

  -- 8. placements: target era exists in the payload, one row per work, dense order per era,
  --    the first work of an era is never concurrent
  if exists (select 1 from jsonb_to_recordset(v_places) as p(era_id uuid)
              where not exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid) where x.id = p.era_id)) then
    raise exception 'world_timeline_era_invalid';
  end if;
  if (select count(*) <> count(distinct p.work_id) from jsonb_to_recordset(v_places) as p(work_id uuid)) then
    raise exception 'world_timeline_duplicate_work';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_places) as p(era_id uuid, order_index integer)
     group by p.era_id
    having count(distinct p.order_index) <> count(*) or min(p.order_index) <> 0
        or max(p.order_index) <> count(*) - 1
  ) then
    raise exception 'world_timeline_order_invalid';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_places) as p(order_index integer, concurrent boolean)
              where p.order_index = 0 and p.concurrent) then
    raise exception 'world_timeline_first_concurrent';
  end if;

  -- 9. placements inside inherited eras must equal the stored copies exactly
  if exists (
      (select p.era_id, p.work_id, p.order_index, p.concurrent_with_prev, p.relation_label
         from world_era_placements p join world_eras e on e.id = p.era_id
        where p.branch_id = p_branch_id and p.deleted_at is null and e.inherited)
      except
      (select p.era_id, p.work_id, p.order_index, p.concurrent, p.relation_label
         from jsonb_to_recordset(v_places) as p(era_id uuid, work_id uuid, order_index integer,
                                                concurrent boolean, relation_label text))
    ) or exists (
      (select p.era_id, p.work_id, p.order_index, p.concurrent, p.relation_label
         from jsonb_to_recordset(v_places) as p(era_id uuid, work_id uuid, order_index integer,
                                                concurrent boolean, relation_label text)
         join world_eras e on e.id = p.era_id and e.branch_id = p_branch_id and e.inherited)
      except
      (select p.era_id, p.work_id, p.order_index, p.concurrent_with_prev, p.relation_label
         from world_era_placements p join world_eras e on e.id = p.era_id
        where p.branch_id = p_branch_id and p.deleted_at is null and e.inherited)
    ) then
    raise exception 'world_timeline_inherited_locked';
  end if;

  -- 10. independent placements: own branch work or plain live works of the caller only
  if exists (
    select 1
      from jsonb_to_recordset(v_places) as p(era_id uuid, work_id uuid)
     where not exists (select 1 from world_eras e where e.id = p.era_id and e.branch_id = p_branch_id and e.inherited)
       and not exists (select 1 from works w
                        where w.id = p.work_id and w.owner_id = v_uid and w.deleted_at is null
                          and not w.is_branch_draft)
  ) then
    raise exception 'world_tree_forbidden';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(v_places) as p(era_id uuid, work_id uuid)
      join world_branches b on b.work_id = p.work_id
     where b.id <> p_branch_id
       and not exists (select 1 from world_eras e where e.id = p.era_id and e.branch_id = p_branch_id and e.inherited)
  ) then
    raise exception 'world_timeline_work_not_placeable';
  end if;
  if not exists (
    select 1 from jsonb_to_recordset(v_places) as p(era_id uuid, work_id uuid)
     where p.work_id = v_branch.work_id
       and not exists (select 1 from world_eras e where e.id = p.era_id and e.branch_id = p_branch_id and e.inherited)
  ) then
    raise exception 'world_timeline_branch_work_required';
  end if;

  -- Plain fruit works are locked (by id) before the one-line membership check.
  perform 1 from works w
   where w.id in (select p.work_id from jsonb_to_recordset(v_places) as p(work_id uuid))
     and w.id <> v_branch.work_id
     and not exists (select 1 from world_branches b where b.work_id = w.id)
   order by w.id
   for update of w;
  if exists (
    select 1
      from jsonb_to_recordset(v_places) as x(era_id uuid, work_id uuid)
      join world_era_placements p on p.work_id = x.work_id and p.deleted_at is null and p.branch_id <> p_branch_id
      join world_branches b on b.id = p.branch_id
      join world_eras e on e.id = p.era_id
     where not exists (select 1 from world_eras ie where ie.id = x.era_id and ie.branch_id = p_branch_id and ie.inherited)
       and (b.root_work_id <> v_branch.root_work_id or not e.inherited)
  ) then
    raise exception 'world_timeline_duplicate_work';
  end if;

  -- 11. removed independent eras: never a live fork point, never one that still holds a work
  --     (its works must be moved first; an emptied target is not created implicitly)
  if exists (
    select 1 from world_eras e
      join world_branches c on c.fork_era_id = e.id and c.deleted_at is null
     where e.branch_id = p_branch_id and not e.inherited and e.deleted_at is null
       and not exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid) where x.id = e.id)
  ) then
    raise exception 'world_timeline_fork_era_in_use';
  end if;
  if exists (
    select 1 from world_eras e
      join world_era_placements p on p.era_id = e.id and p.deleted_at is null
     where e.branch_id = p_branch_id and not e.inherited and e.deleted_at is null
       and not exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid) where x.id = e.id)
       and not exists (select 1 from jsonb_to_recordset(v_places) as x(work_id uuid) where x.work_id = p.work_id)
  ) then
    raise exception 'world_timeline_era_not_empty';
  end if;

  -- 12. apply: independent eras (update / insert), placements (remove / move / insert), then
  --     tombstone removed eras. Order uniqueness is deferred, so swaps never collide midway.
  update world_eras e
     set position = x.position, name = x.name, year_label = x.year_label, memo = x.memo
    from jsonb_to_recordset(v_eras) as x(id uuid, position integer, name text, year_label text, memo text)
   where e.id = x.id and e.branch_id = p_branch_id and not e.inherited and e.deleted_at is null
     and (e.position, e.name, e.year_label, e.memo) is distinct from (x.position, x.name, x.year_label, x.memo);

  insert into world_eras (id, branch_id, position, name, year_label, memo, inherited)
  select x.id, p_branch_id, x.position, x.name, x.year_label, x.memo, false
    from jsonb_to_recordset(v_eras) as x(id uuid, position integer, name text, year_label text, memo text)
   where not exists (select 1 from world_eras e where e.id = x.id);

  update world_era_placements p
     set deleted_at = now()
   where p.branch_id = p_branch_id and p.deleted_at is null
     and not exists (select 1 from world_eras e where e.id = p.era_id and e.inherited)
     and not exists (select 1 from jsonb_to_recordset(v_places) as x(work_id uuid) where x.work_id = p.work_id);

  update world_era_placements p
     set era_id = x.era_id, order_index = x.order_index, concurrent_with_prev = x.concurrent,
         relation_label = x.relation_label
    from jsonb_to_recordset(v_places) as x(era_id uuid, work_id uuid, order_index integer,
                                           concurrent boolean, relation_label text)
   where p.branch_id = p_branch_id and p.work_id = x.work_id and p.deleted_at is null
     and not exists (select 1 from world_eras e where e.id = p.era_id and e.inherited)
     and (p.era_id, p.order_index, p.concurrent_with_prev, p.relation_label)
         is distinct from (x.era_id, x.order_index, x.concurrent, x.relation_label);

  insert into world_era_placements (branch_id, era_id, work_id, order_index, concurrent_with_prev, relation_label)
  select p_branch_id, x.era_id, x.work_id, x.order_index, x.concurrent, x.relation_label
    from jsonb_to_recordset(v_places) as x(era_id uuid, work_id uuid, order_index integer,
                                           concurrent boolean, relation_label text)
   where not exists (select 1 from world_era_placements p
                      where p.branch_id = p_branch_id and p.work_id = x.work_id and p.deleted_at is null);

  update world_eras e
     set deleted_at = now()
   where e.branch_id = p_branch_id and not e.inherited and e.deleted_at is null
     and not exists (select 1 from jsonb_to_recordset(v_eras) as x(id uuid) where x.id = e.id);

  if exists (select 1 from world_era_placements p join world_eras e on e.id = p.era_id
              where p.branch_id = p_branch_id and p.deleted_at is null and e.deleted_at is not null) then
    raise exception 'world_timeline_era_not_empty';
  end if;

  -- Surface any order collision inside this call instead of at commit.
  set constraints world_eras_live_position_excl, world_era_placements_live_order_excl immediate;

  select count(*)::integer into v_count
    from world_era_placements p where p.branch_id = p_branch_id and p.deleted_at is null;

  return jsonb_build_object(
    'branch_id', p_branch_id,
    'eras', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'position', e.position) order by e.position)
                        from world_eras e where e.branch_id = p_branch_id and e.deleted_at is null), '[]'::jsonb),
    'placementCount', v_count);
end;
$$;
revoke all on function save_world_timeline(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function save_world_timeline(uuid, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
