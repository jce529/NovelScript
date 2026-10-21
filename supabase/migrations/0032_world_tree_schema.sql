begin;

-- Phase 18 (18-01): world-tree base schema + minimal draft isolation.
-- Contract mirror: lib/world-tree/types.ts (WorldBranch / Era / EraPlacement / BranchNotice).
--
-- Facts checked before writing (2026-10-17):
--   * works has no publish flag. lib/discovery/actions.ts treats a work as published while it has
--     >= 1 live published chapter. That stays the only publish rule (unpublish = 0 live published
--     chapters, republish = >= 1 again). No second visibility flag / per-connection toggle exists.
--   * 0006 replaced table-level INSERT/UPDATE on works and chapters with column grants. The new
--     works.is_branch_draft column is NOT added to those grants: only SECURITY DEFINER RPCs (0034)
--     may set it.
--   * kb_nodes still has Supabase's default table-level privileges, so a column grant cannot hide
--     kb_nodes.inherited_from_node_id. A BEFORE trigger rejects direct anon/authenticated writes to
--     it instead; SECURITY DEFINER RPCs run as the function owner and pass.
--
-- Scope split (later migrations):
--   0033 (18-14) world_work_reader_visible + eligibility, 0034 (18-02) branch RPCs / delete guards,
--   0035 (18-03) timeline RPCs, 0036 (18-04) reader projection + full public-read guards.
-- This file creates tables, integrity triggers, owner-read RLS and the minimal draft filter on
-- works_public_read / chapters_public_read. It grants no write privilege on any new table.
-- Static source checks (tests/world-tree/schema-source.test.ts) are not RLS runtime proof; the
-- live-DB proof is 18-12.
-- WTREE-09 note: when a parent is private, pre-fork document locks follow the child reader's
-- progress. Not implemented in Phase 18.

-- ---------------------------------------------------------------------------
-- 1. Columns on existing tables (no grant changes)
-- ---------------------------------------------------------------------------
alter table works add column if not exists is_branch_draft boolean not null default false;
alter table kb_nodes add column if not exists inherited_from_node_id uuid references kb_nodes(id);

create index if not exists kb_nodes_inherited_from_idx on kb_nodes (inherited_from_node_id)
  where inherited_from_node_id is not null and deleted_at is null;

-- Direct client writes to RPC-managed columns are rejected. Inside a SECURITY DEFINER RPC
-- current_user is the function owner, so the RPC path is unaffected.
create or replace function guard_world_tree_rpc_columns() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return NEW;
  end if;
  if TG_TABLE_NAME = 'works' then
    if (TG_OP = 'INSERT' and NEW.is_branch_draft)
       or (TG_OP = 'UPDATE' and NEW.is_branch_draft is distinct from OLD.is_branch_draft) then
      raise exception 'world_tree_rpc_only';
    end if;
  elsif TG_TABLE_NAME = 'kb_nodes' then
    if (TG_OP = 'INSERT' and NEW.inherited_from_node_id is not null)
       or (TG_OP = 'UPDATE' and NEW.inherited_from_node_id is distinct from OLD.inherited_from_node_id) then
      raise exception 'world_tree_rpc_only';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_tree_rpc_columns() from public, anon, authenticated;

drop trigger if exists works_guard_world_tree_columns on works;
create trigger works_guard_world_tree_columns before insert or update on works
  for each row execute function guard_world_tree_rpc_columns();
drop trigger if exists kb_nodes_guard_world_tree_columns on kb_nodes;
create trigger kb_nodes_guard_world_tree_columns before insert or update on kb_nodes
  for each row execute function guard_world_tree_rpc_columns();

-- ---------------------------------------------------------------------------
-- 2. world_branches (root is a trunk row; one row per work)
-- ---------------------------------------------------------------------------
create table if not exists world_branches (
  id uuid primary key default gen_random_uuid(),
  root_work_id uuid not null references works(id),
  work_id uuid not null unique references works(id),
  owner_id uuid not null references profiles(id),
  parent_branch_id uuid references world_branches(id),
  kind text not null check (kind in ('trunk', 'if', 'expand')),
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  fork_era_id uuid, -- FK added after world_eras exists (circular reference)
  request_id uuid unique,
  depth integer not null default 0 check (depth between 0 and 32),
  confirmed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_branches_trunk_shape check (
    (kind = 'trunk' and parent_branch_id is null and work_id = root_work_id
      and status = 'confirmed' and fork_era_id is null and depth = 0)
    or (kind <> 'trunk' and parent_branch_id is not null and work_id <> root_work_id and depth >= 1)
  ),
  constraint world_branches_confirmed_at check ((status = 'confirmed') = (confirmed_at is not null)),
  constraint world_branches_no_self_parent check (parent_branch_id is distinct from id)
);

create unique index if not exists world_branches_one_trunk on world_branches (root_work_id) where kind = 'trunk';
create index if not exists world_branches_parent_idx on world_branches (parent_branch_id) where deleted_at is null;
create index if not exists world_branches_root_idx on world_branches (root_work_id) where deleted_at is null;
create index if not exists world_branches_owner_idx on world_branches (owner_id) where deleted_at is null;

-- Parent must be a live confirmed branch of the same root and owner; owner must be an active
-- writer; works must belong to the owner; depth <= 32 and no cycle. Structural columns are
-- immutable after insert (only status draft->confirmed, fork_era before confirm, deleted_at).
create or replace function guard_world_branch_integrity() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v_parent world_branches%rowtype;
  v_cursor uuid;
  v_steps integer := 0;
begin
  if TG_OP = 'UPDATE' then
    if (NEW.id, NEW.root_work_id, NEW.work_id, NEW.owner_id, NEW.parent_branch_id, NEW.kind,
        NEW.depth, NEW.request_id, NEW.created_at)
       is distinct from
       (OLD.id, OLD.root_work_id, OLD.work_id, OLD.owner_id, OLD.parent_branch_id, OLD.kind,
        OLD.depth, OLD.request_id, OLD.created_at) then
      raise exception 'world_branch_structure_immutable';
    end if;
    if OLD.status = 'confirmed' and NEW.status <> 'confirmed' then
      raise exception 'world_branch_status_invalid';
    end if;
    if OLD.status = 'confirmed' and NEW.fork_era_id is distinct from OLD.fork_era_id then
      raise exception 'world_branch_structure_immutable';
    end if;
  else
    if not exists (select 1 from profiles p
                    where p.id = NEW.owner_id and p.role = 'writer' and p.deleted_at is null) then
      raise exception 'world_branch_owner_not_writer';
    end if;
    if not exists (select 1 from works w where w.id = NEW.work_id and w.owner_id = NEW.owner_id)
       or not exists (select 1 from works w where w.id = NEW.root_work_id and w.owner_id = NEW.owner_id) then
      raise exception 'world_branch_owner_mismatch';
    end if;
  end if;

  if NEW.parent_branch_id is not null then
    select * into v_parent from world_branches where id = NEW.parent_branch_id;
    if not found or v_parent.deleted_at is not null or v_parent.status <> 'confirmed'
       or v_parent.root_work_id <> NEW.root_work_id or v_parent.owner_id <> NEW.owner_id then
      raise exception 'world_branch_parent_invalid';
    end if;
    if TG_OP = 'INSERT' then
      NEW.depth := v_parent.depth + 1;
      if NEW.depth > 32 then
        raise exception 'world_branch_depth_exceeded';
      end if;
    end if;
    -- Defensive cycle walk (structure is immutable, so this only guards future regressions).
    v_cursor := v_parent.id;
    while v_cursor is not null loop
      if v_cursor = NEW.id then
        raise exception 'world_branch_cycle';
      end if;
      v_steps := v_steps + 1;
      if v_steps > 33 then
        raise exception 'world_branch_depth_exceeded';
      end if;
      select parent_branch_id into v_cursor from world_branches where id = v_cursor;
    end loop;
    -- The fork point must be an era on the parent line.
    if NEW.fork_era_id is not null and not exists (
      select 1 from world_eras e
       where e.id = NEW.fork_era_id and e.branch_id = NEW.parent_branch_id and e.deleted_at is null
    ) then
      raise exception 'world_branch_fork_era_invalid';
    end if;
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function guard_world_branch_integrity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. world_branch_docs (source/copied mapping, frozen baseline, confirm snapshot)
-- ---------------------------------------------------------------------------
create table if not exists world_branch_docs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references world_branches(id),
  source_node_id uuid references kb_nodes(id),
  copied_node_id uuid references kb_nodes(id),
  baseline_name text,
  baseline_category text check (baseline_category is null
    or baseline_category in ('template', '인물', '장소', '사건', '세력', '아이템')),
  baseline_content text,
  snapshot_name text,
  snapshot_category text check (snapshot_category is null
    or snapshot_category in ('template', '인물', '장소', '사건', '세력', '아이템')),
  snapshot_content text,
  change_kind text check (change_kind is null or change_kind in ('unchanged', 'added', 'modified', 'deleted')),
  created_at timestamptz not null default now(),
  snapshotted_at timestamptz,
  constraint world_branch_docs_has_node check (source_node_id is not null or copied_node_id is not null),
  constraint world_branch_docs_snapshot_pair check ((change_kind is null) = (snapshotted_at is null))
);

create unique index if not exists world_branch_docs_source_unique
  on world_branch_docs (branch_id, source_node_id) where source_node_id is not null;
create unique index if not exists world_branch_docs_copied_unique
  on world_branch_docs (branch_id, copied_node_id) where copied_node_id is not null;
create index if not exists world_branch_docs_source_idx on world_branch_docs (source_node_id)
  where source_node_id is not null;

-- ---------------------------------------------------------------------------
-- 4. world_eras / world_era_placements
-- ---------------------------------------------------------------------------
create table if not exists world_eras (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references world_branches(id),
  source_era_id uuid references world_eras(id),
  position integer not null check (position >= 0),
  name text not null check (char_length(trim(name)) > 0),
  year_label text,
  memo text,
  inherited boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_eras_inherited_source check (not inherited or source_era_id is not null),
  constraint world_eras_id_branch unique (id, branch_id)
);

create unique index if not exists world_eras_live_position on world_eras (branch_id, position)
  where deleted_at is null;
create index if not exists world_eras_source_idx on world_eras (source_era_id) where source_era_id is not null;

alter table world_branches drop constraint if exists world_branches_fork_era_fk;
alter table world_branches add constraint world_branches_fork_era_fk
  foreign key (fork_era_id) references world_eras(id);

create table if not exists world_era_placements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references world_branches(id),
  era_id uuid not null,
  work_id uuid not null references works(id),
  order_index integer not null check (order_index >= 0),
  concurrent_with_prev boolean not null default false,
  relation_label text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The era must be on the same branch line.
  constraint world_era_placements_era_same_branch
    foreign key (era_id, branch_id) references world_eras(id, branch_id),
  constraint world_era_placements_first_not_concurrent check (order_index > 0 or not concurrent_with_prev)
);

create unique index if not exists world_era_placements_live_order
  on world_era_placements (branch_id, era_id, order_index) where deleted_at is null;
create unique index if not exists world_era_placements_live_work
  on world_era_placements (branch_id, work_id) where deleted_at is null;
create index if not exists world_era_placements_work_idx on world_era_placements (work_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 5. world_branch_notices (minimal source-changed notice, dedupe per event)
-- ---------------------------------------------------------------------------
create table if not exists world_branch_notices (
  id uuid primary key default gen_random_uuid(),
  source_work_id uuid not null references works(id),
  branch_id uuid not null references world_branches(id),
  event_key text not null check (char_length(trim(event_key)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint world_branch_notices_dedupe unique (branch_id, event_key)
);

create index if not exists world_branch_notices_unread_idx on world_branch_notices (branch_id)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- 6. Same-world integrity for docs / placements / notices
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
    if not exists (select 1 from world_branches b
                    where b.work_id = NEW.work_id and b.root_work_id = v_branch.root_work_id
                      and b.deleted_at is null) then
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

drop trigger if exists world_branches_guard_integrity on world_branches;
create trigger world_branches_guard_integrity before insert or update on world_branches
  for each row execute function guard_world_branch_integrity();
drop trigger if exists world_branch_docs_guard_same_world on world_branch_docs;
create trigger world_branch_docs_guard_same_world before insert or update on world_branch_docs
  for each row execute function guard_world_tree_same_world();
drop trigger if exists world_eras_guard_same_world on world_eras;
create trigger world_eras_guard_same_world before insert or update on world_eras
  for each row execute function guard_world_tree_same_world();
drop trigger if exists world_era_placements_guard_same_world on world_era_placements;
create trigger world_era_placements_guard_same_world before insert or update on world_era_placements
  for each row execute function guard_world_tree_same_world();
drop trigger if exists world_branch_notices_guard_same_world on world_branch_notices;
create trigger world_branch_notices_guard_same_world before insert or update on world_branch_notices
  for each row execute function guard_world_tree_same_world();

-- ---------------------------------------------------------------------------
-- 7. RLS: owner SELECT only, restrictive write guards, no write privileges (RPC-only writes)
-- ---------------------------------------------------------------------------
alter table world_branches enable row level security;
alter table world_branch_docs enable row level security;
alter table world_eras enable row level security;
alter table world_era_placements enable row level security;
alter table world_branch_notices enable row level security;

drop policy if exists world_branches_owner_select on world_branches;
create policy world_branches_owner_select on world_branches for select
  to authenticated using (owner_id = auth.uid());

-- Baseline/snapshot rows: author SELECT only.
drop policy if exists world_branch_docs_owner_select on world_branch_docs;
create policy world_branch_docs_owner_select on world_branch_docs for select
  to authenticated using (branch_id in (select b.id from world_branches b where b.owner_id = auth.uid()));

drop policy if exists world_eras_owner_select on world_eras;
create policy world_eras_owner_select on world_eras for select
  to authenticated using (branch_id in (select b.id from world_branches b where b.owner_id = auth.uid()));

drop policy if exists world_era_placements_owner_select on world_era_placements;
create policy world_era_placements_owner_select on world_era_placements for select
  to authenticated using (branch_id in (select b.id from world_branches b where b.owner_id = auth.uid()));

drop policy if exists world_branch_notices_owner_select on world_branch_notices;
create policy world_branch_notices_owner_select on world_branch_notices for select
  to authenticated using (branch_id in (select b.id from world_branches b where b.owner_id = auth.uid()));

-- 0008 pattern, new tables only.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'world_branches', 'world_branch_docs', 'world_eras', 'world_era_placements', 'world_branch_notices'
  ] loop
    execute format('drop policy if exists %I on %I', v_table || '_write_access_insert', v_table);
    execute format('create policy %I on %I as restrictive for insert with check (current_user_can_write())',
      v_table || '_write_access_insert', v_table);
    execute format('drop policy if exists %I on %I', v_table || '_write_access_update', v_table);
    execute format('create policy %I on %I as restrictive for update using (current_user_can_write()) with check (current_user_can_write())',
      v_table || '_write_access_update', v_table);
    execute format('drop policy if exists %I on %I', v_table || '_write_access_delete', v_table);
    execute format('create policy %I on %I as restrictive for delete using (current_user_can_write())',
      v_table || '_write_access_delete', v_table);
  end loop;
end;
$$;

revoke all on table world_branches, world_branch_docs, world_eras, world_era_placements,
  world_branch_notices from public, anon, authenticated;
grant select on table world_branches, world_branch_docs, world_eras, world_era_placements,
  world_branch_notices to authenticated;
grant select on table world_branches, world_branch_docs, world_eras, world_era_placements,
  world_branch_notices to service_role;

-- ---------------------------------------------------------------------------
-- 8. Minimal draft isolation on existing public-read policies
--    (owner_all and restrictive *_write_access_* policies are untouched; 0036 completes the
--    public RPC guards).
-- ---------------------------------------------------------------------------
drop policy if exists "works_public_read" on works;
create policy "works_public_read" on works for select
  using (deleted_at is null and not is_branch_draft);

-- The works subquery runs under the caller's RLS: for non-owners only works_public_read rows
-- (live, non-draft) match, so chapters of branch drafts are never publicly readable.
drop policy if exists "chapters_public_read" on chapters;
create policy "chapters_public_read" on chapters for select
  using (
    is_published = true and deleted_at is null
    and exists (select 1 from works w where w.id = chapters.work_id and not w.is_branch_draft)
  );

commit;
