begin;

-- Phase 18 (18-02): self-branch drafts, server-side diff, atomic confirm, immutability and
-- delete guards (WORLD-TREE rules 1, 2, 3, 6, 17; WTREE-03/04/05/10).
-- Apply after 0032_world_tree_schema.sql and 0033_world_tree_eligibility.sql.
--
-- Contents:
--   1. Internal helpers (writer check, root lock, setting categories, live-children check).
--   2. begin_world_branch(p_source_work_id, p_kind, p_fork_era_id, p_request_id)
--        -> {"draft_work_id"}: create_work + draft flag + KB clone + frozen baseline.
--   3. get_world_branch_diff(p_draft_work_id) -> {"counts", "entries"} (owner only, no content).
--   4. confirm_world_branch(p_draft_work_id, p_title, p_era_id) -> {"work_id", "branch_id"}.
--   5. soft_delete_world_branch(p_branch_id) -> {"branch_id", "work_id"}.
--   6. KB guards: expand-inherited immutability, confirmed-branch setting freeze,
--      baseline/snapshot immutability, source-changed notices (copies are never updated).
--   7. Delete guards: a branch or work with a live child branch is never deleted
--      (soft or hard); a work soft delete tombstones its own branch row atomically.
--
-- Facts checked before writing (2026-10-19):
--   * create_work (latest body 0012) seeds 회차 / template (+5 locked category folders) /
--     인물 / 장소 / 사건 / 세력 / 아이템 locked roots. The 5 locked default template FILES are
--     seeded afterwards (lib/kb/templates.ts seedTemplateFiles) from the raw canonical seed that
--     0022 stores in kb_template_seed_catalog. begin reuses create_work and seeds the same 5
--     locked defaults from that private catalog, so the 0023 guard (exact canonical
--     name/content inside the owner's locked category folder) accepts them unchanged.
--   * Settings = files in the 5 categories (인물·장소·사건·세력·아이템). Templates (raw seed with
--     <% tp.file.title %> or a title-substituted copy), folders, 회차 and account templates
--     never count as a change. Chapters / manuscripts are never cloned.
--   * Eligibility (rule 22) is owned by 0033. This file only CALLS
--     world_tree_assert_branch_eligible(source) in begin and in the FIRST confirm, after
--     auth / writer / write access / ownership checks and after the root -> source work locks.
--     It passes no eligible/counts/thresholds and keeps the branch_ineligible DETAIL
--     (e.g. parent_not_visible) unchanged; the whole transaction rolls back.
--
-- Lock / concurrency contract (begin, confirm and delete use the same order):
--   root work row FOR UPDATE -> source (parent) work row FOR UPDATE -> draft/target work row
--   FOR UPDATE -> world_branches row FOR UPDATE.
--   * FOR UPDATE on the parent works row conflicts with the FOR KEY SHARE lock that every FK
--     check takes, so a concurrent INSERT of a chapter or kb_nodes row into that work (and a
--     concurrent child world_branches/works row referencing it) waits until this transaction
--     ends. Existing chapter/KB rows are held FOR SHARE by the 0033 evaluator. This is what
--     serialises phantoms for PostgREST RPCs, which run in their own READ COMMITTED
--     transaction (SERIALIZABLE cannot be set from inside a function). A plain SELECT snapshot
--     is NOT claimed to block anything.
--   * A direct works soft delete (UPDATE deleted_at) takes the row lock on the same works row,
--     so it waits for begin/confirm and then its BEFORE trigger sees the committed child row.
--   * request_id is unique: a begin retry with the same request returns the same draft.
--   * A successful confirm retry returns the stored result before eligibility is evaluated
--     again, so a later eligibility drop never creates a second branch.
--
-- Parent going private (unpublish / blind) changes only the parent's own rows. Nothing here
-- touches the child's chapters, snapshot or parent_branch_id on that transition.
-- WTREE-09 note: when a parent is private, pre-fork document locks follow the child reader's
-- progress. Not implemented in Phase 18.
-- Static source checks (tests/world-tree/branching-source.test.ts) are not runtime proof; the
-- live-DB suite (tests/world-tree/branching.database.test.ts) runs in 18-12.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers (no API grants)
-- ---------------------------------------------------------------------------
create or replace function world_tree_setting_categories() returns text[]
language sql immutable parallel safe set search_path = public as $$
  select array['인물', '장소', '사건', '세력', '아이템']::text[];
$$;
revoke all on function world_tree_setting_categories() from public, anon, authenticated, service_role;

-- auth.uid() -> active writer -> effective write access. Returns the caller id.
create or replace function world_tree_require_writer() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if not exists (select 1 from profiles p
                  where p.id = v_uid and p.role = 'writer' and p.deleted_at is null) then
    raise exception 'writer_required';
  end if;
  if not user_can_write(v_uid) then
    raise exception 'write_access_denied';
  end if;
  return v_uid;
end;
$$;
revoke all on function world_tree_require_writer() from public, anon, authenticated, service_role;

-- Root work of the world a work belongs to (the work itself when it has no branch row yet).
create or replace function world_tree_root_of(p_work_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce((select b.root_work_id from world_branches b where b.work_id = p_work_id), p_work_id);
$$;
revoke all on function world_tree_root_of(uuid) from public, anon, authenticated, service_role;

-- Fixed lock order: root work first, then the given work (when different).
create or replace function world_tree_lock_root_then(p_work_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_root uuid := world_tree_root_of(p_work_id);
begin
  perform 1 from works w where w.id = v_root for update of w;
  if p_work_id is distinct from v_root then
    perform 1 from works w where w.id = p_work_id for update of w;
  end if;
  return v_root;
end;
$$;
revoke all on function world_tree_lock_root_then(uuid) from public, anon, authenticated, service_role;

-- A live child branch (draft or confirmed) hangs under the given branch.
create or replace function world_tree_branch_has_live_children(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from world_branches c
                  where c.parent_branch_id = p_branch_id and c.deleted_at is null);
$$;
revoke all on function world_tree_branch_has_live_children(uuid) from public, anon, authenticated, service_role;

-- 0035 completes this contract (inherited eras up to the fork + the new work's placement).
-- Until 0035 is applied, confirm fails closed instead of creating a branch without a timeline.
-- Created only when absent so re-running 0034 never overwrites the 0035 body.
do $$
begin
  if to_regprocedure('clone_world_branch_timeline(uuid, uuid)') is null then
    execute $f$
      create function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void
      language plpgsql security definer set search_path = public as $body$
      begin
        raise exception 'world_tree_timeline_not_ready';
      end;
      $body$;
    $f$;
  end if;
end;
$$;
revoke all on function clone_world_branch_timeline(uuid, uuid) from public, anon, authenticated, service_role;

-- Baseline-vs-draft diff rows for a branch. Server-side only; clients never send counts.
-- Baseline rows (source_node_id + baseline_*) were frozen at begin; the current SOURCE is never
-- consulted here, so a source edit is never mistaken for an author change.
create or replace function world_tree_branch_diff_rows(p_branch_id uuid)
returns table (doc_id uuid, draft_node_id uuid, source_node_id uuid, name text, category text,
               content text, change_kind text)
language sql stable security definer set search_path = public as $$
  with b as (select * from world_branches where id = p_branch_id),
  tracked as (
    select d.id as doc_id, d.copied_node_id, d.source_node_id,
           d.baseline_name, d.baseline_category, d.baseline_content,
           n.id as node_id, n.name as node_name, n.category as node_category, n.content as node_content,
           (n.id is null or n.deleted_at is not null or n.node_type <> 'file'
             or n.work_id is distinct from (select work_id from b)
             or not (n.category = any(world_tree_setting_categories()))) as gone
      from world_branch_docs d
      left join kb_nodes n on n.id = d.copied_node_id
     where d.branch_id = p_branch_id and d.source_node_id is not null and d.baseline_category is not null
  )
  select t.doc_id,
         case when t.gone then null else t.node_id end,
         t.source_node_id,
         case when t.gone then t.baseline_name else t.node_name end,
         case when t.gone then t.baseline_category else t.node_category end,
         case when t.gone then null else t.node_content end,
         case when t.gone then 'deleted'
              when (t.node_name, t.node_category, t.node_content)
                   is distinct from (t.baseline_name, t.baseline_category, t.baseline_content) then 'modified'
              else 'unchanged' end
    from tracked t
  union all
  select null::uuid, n.id, null::uuid, n.name, n.category, n.content, 'added'
    from kb_nodes n
    join b on b.work_id = n.work_id
   where n.scope = 'work' and n.node_type = 'file' and n.deleted_at is null
     and n.category = any(world_tree_setting_categories())
     and not exists (select 1 from world_branch_docs d
                      where d.branch_id = p_branch_id and d.copied_node_id = n.id
                        and d.source_node_id is not null and d.baseline_category is not null);
$$;
revoke all on function world_tree_branch_diff_rows(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. begin_world_branch
-- ---------------------------------------------------------------------------
create or replace function begin_world_branch(
  p_source_work_id uuid, p_kind text, p_fork_era_id uuid, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_source works%rowtype;
  v_source_branch world_branches%rowtype;
  v_existing world_branches%rowtype;
  v_root uuid;
  v_parent_branch_id uuid;
  v_draft uuid;
  v_branch_id uuid;
  v_map jsonb := '{}'::jsonb;
  v_new uuid;
  v_parent_new uuid;
  v_template_root uuid;
  r record;
begin
  -- 1. auth -> writer -> write access
  v_uid := world_tree_require_writer();
  if p_kind is null or p_kind not in ('if', 'expand') then
    raise exception 'world_branch_kind_invalid';
  end if;
  if p_request_id is null then
    raise exception 'world_branch_request_required';
  end if;

  -- 2. ownership (a missing work and someone else's work raise the same code)
  select * into v_source from works w where w.id = p_source_work_id;
  if not found or v_source.owner_id <> v_uid or v_source.deleted_at is not null then
    raise exception 'world_tree_forbidden';
  end if;

  -- 3. root -> source locks (same order as confirm / delete)
  v_root := world_tree_lock_root_then(p_source_work_id);

  -- 4. idempotent retry: the same request keeps returning the same draft
  select * into v_existing from world_branches b where b.request_id = p_request_id;
  if found then
    if v_existing.owner_id <> v_uid or v_existing.deleted_at is not null
       or v_existing.kind <> p_kind
       or v_existing.fork_era_id is distinct from p_fork_era_id
       or not exists (select 1 from world_branches pb
                       where pb.id = v_existing.parent_branch_id and pb.work_id = p_source_work_id) then
      raise exception 'world_branch_request_conflict';
    end if;
    return jsonb_build_object('draft_work_id', v_existing.work_id);
  end if;

  -- 5. rule 22 (0033): reader visibility first, then counts. FOR SHARE on source chapters/KB.
  perform world_tree_assert_branch_eligible(p_source_work_id);

  -- 6. parent branch row (an un-branched source becomes the trunk of its own world)
  select * into v_source_branch from world_branches b where b.work_id = p_source_work_id;
  if not found then
    insert into world_branches (root_work_id, work_id, owner_id, parent_branch_id, kind, status,
                                fork_era_id, depth, confirmed_at)
    values (p_source_work_id, p_source_work_id, v_uid, null, 'trunk', 'confirmed', null, 0, now())
    returning * into v_source_branch;
  elsif v_source_branch.deleted_at is not null or v_source_branch.status <> 'confirmed' then
    raise exception 'world_branch_parent_invalid';
  end if;
  v_parent_branch_id := v_source_branch.id;

  -- 7. draft work through the latest create_work (fixed folders), hidden as a branch draft
  v_draft := create_work(v_uid, v_source.title, null, null, v_source.genre);
  update works set is_branch_draft = true where id = v_draft;

  insert into world_branches (root_work_id, work_id, owner_id, parent_branch_id, kind, status,
                              fork_era_id, request_id, depth)
  values (v_root, v_draft, v_uid, v_parent_branch_id, p_kind, 'draft', p_fork_era_id, p_request_id, 1)
  returning id into v_branch_id;

  -- 8. the 5 locked default templates, raw canonical seed (same rows seedTemplateFiles writes)
  select id into v_template_root from kb_nodes
   where work_id = v_draft and parent_id is null and node_type = 'folder' and category = 'template'
     and deleted_at is null;
  insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
  select v_uid, v_draft, 'work', folder.id, 'file', 'template', true, folder.name, seed.content
    from kb_nodes folder
    join kb_template_seed_catalog seed on seed.name = folder.name
   where folder.parent_id = v_template_root and folder.node_type = 'folder'
     and folder.category = 'template' and folder.is_locked and folder.deleted_at is null
     and not exists (select 1 from kb_nodes f
                      where f.parent_id = folder.id and f.name = folder.name and f.deleted_at is null);

  -- 9. clone the source work KB hierarchy (old -> new id map). Structural roots, locked category
  --    folders and locked default files map onto the draft's own rows (never duplicated). The
  --    회차 area is not cloned. Account templates (scope account_template) are not touched.
  for r in
    with recursive t as (
      select n.id, n.parent_id, n.node_type, n.category, n.is_locked, n.name, n.content,
             n.created_at, 0 as lvl
        from kb_nodes n
       where n.work_id = p_source_work_id and n.scope = 'work' and n.parent_id is null
         and n.deleted_at is null
      union all
      select c.id, c.parent_id, c.node_type, c.category, c.is_locked, c.name, c.content,
             c.created_at, t.lvl + 1
        from kb_nodes c
        join t on c.parent_id = t.id
       where c.deleted_at is null and c.work_id = p_source_work_id and t.lvl < 64
    )
    select * from t order by lvl, created_at, id
  loop
    v_new := null;
    if r.parent_id is null then
      if r.category = '회차' then
        continue;
      end if;
      select n.id into v_new from kb_nodes n
       where n.work_id = v_draft and n.parent_id is null and n.node_type = r.node_type
         and n.name = r.name and n.deleted_at is null;
      v_parent_new := null;
    else
      v_parent_new := (v_map ->> r.parent_id::text)::uuid;
      if v_parent_new is null then
        continue; -- inside a skipped subtree (회차)
      end if;
      if r.is_locked then
        select n.id into v_new from kb_nodes n
         where n.parent_id = v_parent_new and n.node_type = r.node_type and n.name = r.name
           and n.is_locked and n.deleted_at is null;
        if v_new is null and r.node_type = 'file' and r.category = 'template' then
          continue; -- a locked default can only come from the catalog seed above
        end if;
      end if;
    end if;

    if v_new is null then
      insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked,
                            name, content, inherited_from_node_id)
      values (v_uid, v_draft, 'work', v_parent_new, r.node_type, r.category, false, r.name, r.content,
              case when r.category = any(world_tree_setting_categories()) then r.id end)
      returning id into v_new;

      -- frozen baseline for setting documents only
      if r.node_type = 'file' and r.category = any(world_tree_setting_categories()) then
        insert into world_branch_docs (branch_id, source_node_id, copied_node_id,
                                       baseline_name, baseline_category, baseline_content)
        values (v_branch_id, r.id, v_new, r.name, r.category, r.content);
      end if;
    end if;
    v_map := v_map || jsonb_build_object(r.id::text, v_new);
  end loop;

  return jsonb_build_object('draft_work_id', v_draft);
end;
$$;
revoke all on function begin_world_branch(uuid, text, uuid, uuid) from public, anon, service_role;
grant execute on function begin_world_branch(uuid, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_world_branch_diff (owner only; names/categories, never content)
-- ---------------------------------------------------------------------------
create or replace function get_world_branch_diff(p_draft_work_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_branch world_branches%rowtype;
  v_rows jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  select * into v_branch from world_branches b
   where b.work_id = p_draft_work_id and b.kind <> 'trunk' and b.deleted_at is null;
  if not found or v_branch.owner_id <> v_uid then
    raise exception 'world_tree_forbidden';
  end if;

  if v_branch.status = 'confirmed' then
    -- Confirmed: the stored snapshot is the answer (no recomputation, no drift).
    select coalesce(jsonb_agg(jsonb_build_object(
             'draftNodeId', case when d.change_kind = 'deleted' then null else d.copied_node_id end,
             'sourceNodeId', d.source_node_id,
             'name', d.snapshot_name,
             'category', d.snapshot_category,
             'changeKind', d.change_kind) order by d.change_kind, d.snapshot_name, d.id), '[]'::jsonb)
      into v_rows
      from world_branch_docs d
     where d.branch_id = v_branch.id and d.change_kind in ('added', 'modified', 'deleted');
  else
    select coalesce(jsonb_agg(jsonb_build_object(
             'draftNodeId', x.draft_node_id,
             'sourceNodeId', x.source_node_id,
             'name', x.name,
             'category', x.category,
             'changeKind', x.change_kind) order by x.change_kind, x.name, x.draft_node_id), '[]'::jsonb)
      into v_rows
      from world_tree_branch_diff_rows(v_branch.id) x
     where x.change_kind <> 'unchanged';
  end if;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'added', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'changeKind' = 'added'),
      'modified', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'changeKind' = 'modified'),
      'deleted', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'changeKind' = 'deleted')),
    'entries', v_rows);
end;
$$;
revoke all on function get_world_branch_diff(uuid) from public, anon, service_role;
grant execute on function get_world_branch_diff(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. confirm_world_branch (single transaction: re-verify, snapshot, flip, timeline)
-- ---------------------------------------------------------------------------
create or replace function confirm_world_branch(p_draft_work_id uuid, p_title text, p_era_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_branch world_branches%rowtype;
  v_parent world_branches%rowtype;
  v_title text := btrim(coalesce(p_title, ''));
  v_added integer;
  v_modified integer;
  v_deleted integer;
  v_source_changed boolean;
begin
  -- 1. auth -> writer -> write access
  v_uid := world_tree_require_writer();

  -- 2. ownership of the draft
  select * into v_branch from world_branches b where b.work_id = p_draft_work_id and b.kind <> 'trunk';
  if not found or v_branch.owner_id <> v_uid then
    raise exception 'world_tree_forbidden';
  end if;
  select * into v_parent from world_branches b where b.id = v_branch.parent_branch_id;

  -- 3. root -> source (original parent) -> draft locks, then the branch row
  perform world_tree_lock_root_then(v_parent.work_id);
  perform 1 from works w where w.id = p_draft_work_id for update of w;
  select * into v_branch from world_branches b where b.id = v_branch.id for update of b;

  -- 4. idempotent retry: a confirmed branch returns the stored result first
  if v_branch.status = 'confirmed' then
    if v_branch.deleted_at is not null then
      raise exception 'world_branch_not_found';
    end if;
    return jsonb_build_object('work_id', v_branch.work_id, 'branch_id', v_branch.id);
  end if;
  if v_branch.deleted_at is not null
     or not exists (select 1 from works w where w.id = p_draft_work_id and w.is_branch_draft
                     and w.deleted_at is null) then
    raise exception 'world_branch_not_found';
  end if;

  -- 5. input: title and the fork era on the parent line (must match a stored draft fork)
  if char_length(v_title) = 0 then
    raise exception 'world_branch_title_required';
  end if;
  if p_era_id is null then
    raise exception 'world_branch_era_required';
  end if;
  if v_branch.fork_era_id is not null and v_branch.fork_era_id <> p_era_id then
    raise exception 'world_branch_era_mismatch';
  end if;
  if not exists (select 1 from world_eras e
                  where e.id = p_era_id and e.branch_id = v_branch.parent_branch_id and e.deleted_at is null) then
    raise exception 'world_branch_fork_era_invalid';
  end if;

  -- 6. rule 22 on the ORIGINAL parent work (not the draft copy); detail is passed through
  perform world_tree_assert_branch_eligible(v_parent.work_id);

  -- 7. server-recomputed diff (frozen baseline vs draft)
  select count(*) filter (where x.change_kind = 'added'),
         count(*) filter (where x.change_kind = 'modified'),
         count(*) filter (where x.change_kind = 'deleted')
    into v_added, v_modified, v_deleted
    from world_tree_branch_diff_rows(v_branch.id) x;

  if v_branch.kind = 'if' and v_added + v_modified + v_deleted < 1 then
    raise exception 'world_branch_zero_changes';
  end if;
  if v_branch.kind = 'expand' then
    if v_modified + v_deleted > 0 then
      raise exception 'world_branch_inherited_mutation';
    end if;
    if v_added < 1 then
      raise exception 'world_branch_zero_additions';
    end if;
  end if;

  -- 8. source changed between begin and confirm: notice only (never counted, copies untouched)
  v_source_changed := exists (
      select 1 from world_branch_docs d
        left join kb_nodes s on s.id = d.source_node_id
       where d.branch_id = v_branch.id and d.source_node_id is not null and d.baseline_category is not null
         and (s.id is null or s.deleted_at is not null or s.work_id is distinct from v_parent.work_id
              or (s.name, s.category, s.content)
                 is distinct from (d.baseline_name, d.baseline_category, d.baseline_content)))
    or exists (
      select 1 from kb_nodes s
       where s.work_id = v_parent.work_id and s.scope = 'work' and s.node_type = 'file'
         and s.deleted_at is null and s.category = any(world_tree_setting_categories())
         and not exists (select 1 from world_branch_docs d
                          where d.branch_id = v_branch.id and d.source_node_id = s.id));

  -- 9. snapshot (tracked rows updated in place, added rows inserted), all in this transaction
  update world_branch_docs d
     set snapshot_name = x.name,
         snapshot_category = x.category,
         snapshot_content = x.content,
         change_kind = x.change_kind,
         snapshotted_at = now()
    from world_tree_branch_diff_rows(v_branch.id) x
   where x.doc_id = d.id;

  insert into world_branch_docs (branch_id, source_node_id, copied_node_id,
                                 snapshot_name, snapshot_category, snapshot_content,
                                 change_kind, snapshotted_at)
  select v_branch.id, null, x.draft_node_id, x.name, x.category, x.content, 'added', now()
    from world_tree_branch_diff_rows(v_branch.id) x
   where x.change_kind = 'added';

  -- 10. publish-ready work + confirmed branch + timeline (0035), atomically
  update works set title = v_title, is_branch_draft = false, updated_at = now()
   where id = p_draft_work_id;
  update world_branches
     set fork_era_id = p_era_id, status = 'confirmed', confirmed_at = now()
   where id = v_branch.id;
  perform clone_world_branch_timeline(v_branch.id, p_era_id);

  if v_source_changed then
    insert into world_branch_notices (source_work_id, branch_id, event_key)
    values (v_parent.work_id, v_branch.id, 'source_changed_before_confirm')
    on conflict (branch_id, event_key) do nothing;
  end if;

  return jsonb_build_object('work_id', v_branch.work_id, 'branch_id', v_branch.id);
end;
$$;
revoke all on function confirm_world_branch(uuid, text, uuid) from public, anon, service_role;
grant execute on function confirm_world_branch(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. soft_delete_world_branch (branch tombstone + work soft delete, atomically)
-- ---------------------------------------------------------------------------
create or replace function soft_delete_world_branch(p_branch_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_branch world_branches%rowtype;
begin
  v_uid := world_tree_require_writer();
  select * into v_branch from world_branches b where b.id = p_branch_id;
  if not found or v_branch.owner_id <> v_uid then
    raise exception 'world_tree_forbidden';
  end if;

  perform world_tree_lock_root_then(v_branch.work_id);
  select * into v_branch from world_branches b where b.id = p_branch_id for update of b;
  if v_branch.deleted_at is not null then
    return jsonb_build_object('branch_id', v_branch.id, 'work_id', v_branch.work_id);
  end if;
  if world_tree_branch_has_live_children(v_branch.id) then
    raise exception 'world_branch_has_children';
  end if;

  update world_branches set deleted_at = now() where id = v_branch.id;
  update works set deleted_at = now() where id = v_branch.work_id and deleted_at is null;
  return jsonb_build_object('branch_id', v_branch.id, 'work_id', v_branch.work_id);
end;
$$;
revoke all on function soft_delete_world_branch(uuid) from public, anon, service_role;
grant execute on function soft_delete_world_branch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. KB guards
-- ---------------------------------------------------------------------------
-- Applies to every write path: the existing KB Server Actions (createNode/renameNode/deleteNode/
-- saveNodeContent), soft_delete_kb_node (SECURITY DEFINER, so there is deliberately NO
-- current_user bypass here), direct PostgREST UPDATE/DELETE and hard DELETE.
--   * expand draft: an inherited row (inherited_from_node_id set) cannot change name, content,
--     category, parent, scope, work, owner, node type, source ref or deleted_at, and cannot be
--     hard-deleted. Inherited folders are covered too, so deleting/moving an ancestor folder
--     cannot hide an inherited document. New rows (including under inherited folders) are allowed.
--   * confirmed non-trunk branch: its setting KB (5 categories, files and folders) is frozen —
--     every INSERT/UPDATE/DELETE is rejected. Template and 회차 areas keep working.
-- The template guards (0002/0023) are separate triggers and are not replaced.
create or replace function guard_world_branch_kb() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_work uuid;
  v_branch world_branches%rowtype;
begin
  foreach v_work in array array[
    case when TG_OP in ('UPDATE', 'DELETE') then OLD.work_id end,
    case when TG_OP in ('INSERT', 'UPDATE') then NEW.work_id end
  ] loop
    continue when v_work is null;
    select * into v_branch from world_branches b
     where b.work_id = v_work and b.kind <> 'trunk' and b.deleted_at is null;
    continue when not found;

    -- Moving a row into or out of a branch work would bypass the baseline/snapshot mapping.
    if TG_OP = 'UPDATE' and NEW.work_id is distinct from OLD.work_id then
      raise exception 'world_branch_cross_work_move';
    end if;

    if v_branch.status = 'confirmed' then
      if (TG_OP in ('UPDATE', 'DELETE') and OLD.work_id = v_work
            and OLD.category = any(world_tree_setting_categories()))
         or (TG_OP in ('INSERT', 'UPDATE') and NEW.work_id = v_work
            and NEW.category = any(world_tree_setting_categories())) then
        raise exception 'world_branch_confirmed_immutable';
      end if;
    elsif v_branch.kind = 'expand' and TG_OP in ('UPDATE', 'DELETE')
          and OLD.work_id = v_work and OLD.inherited_from_node_id is not null then
      if TG_OP = 'DELETE' then
        raise exception 'world_branch_inherited_immutable';
      end if;
      if (NEW.name, NEW.content, NEW.category, NEW.parent_id, NEW.scope, NEW.work_id, NEW.owner_id,
          NEW.node_type, NEW.inherited_from_node_id, NEW.deleted_at)
         is distinct from
         (OLD.name, OLD.content, OLD.category, OLD.parent_id, OLD.scope, OLD.work_id, OLD.owner_id,
          OLD.node_type, OLD.inherited_from_node_id, OLD.deleted_at) then
        raise exception 'world_branch_inherited_immutable';
      end if;
    end if;
  end loop;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_branch_kb() from public, anon, authenticated, service_role;

drop trigger if exists kb_nodes_guard_world_branch on kb_nodes;
create trigger kb_nodes_guard_world_branch before insert or update or delete on kb_nodes
  for each row execute function guard_world_branch_kb();

-- Source changes notify confirmed children (dedupe per branch + source node; an already-read
-- notice turns unread again). Copies are never updated. Drafts are handled at confirm.
create or replace function world_tree_record_source_notice(p_work_id uuid, p_node_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into world_branch_notices (source_work_id, branch_id, event_key)
  select p_work_id, c.id, 'source_kb:' || p_node_id::text
    from world_branches pb
    join world_branches c on c.parent_branch_id = pb.id
   where pb.work_id = p_work_id and pb.deleted_at is null
     and c.status = 'confirmed' and c.deleted_at is null
  on conflict (branch_id, event_key) do update
    set read_at = null, created_at = now()
    where world_branch_notices.read_at is not null;
end;
$$;
revoke all on function world_tree_record_source_notice(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function notify_world_branch_source_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP in ('UPDATE', 'DELETE') and OLD.work_id is not null and OLD.node_type = 'file'
     and OLD.category = any(world_tree_setting_categories())
     and (TG_OP = 'DELETE'
          or (NEW.name, NEW.content, NEW.category, NEW.parent_id, NEW.work_id, NEW.deleted_at)
             is distinct from (OLD.name, OLD.content, OLD.category, OLD.parent_id, OLD.work_id, OLD.deleted_at)) then
    perform world_tree_record_source_notice(OLD.work_id, OLD.id);
  end if;
  if TG_OP in ('INSERT', 'UPDATE') and NEW.work_id is not null and NEW.node_type = 'file'
     and NEW.category = any(world_tree_setting_categories())
     and (TG_OP = 'INSERT' or NEW.work_id is distinct from OLD.work_id
          or NEW.category is distinct from OLD.category) then
    perform world_tree_record_source_notice(NEW.work_id, NEW.id);
  end if;
  return null;
end;
$$;
revoke all on function notify_world_branch_source_change() from public, anon, authenticated, service_role;

drop trigger if exists kb_nodes_notify_world_branch_source on kb_nodes;
create trigger kb_nodes_notify_world_branch_source after insert or update or delete on kb_nodes
  for each row execute function notify_world_branch_source_change();

-- Baseline and snapshot rows: baseline/ancestry columns never change, a snapshotted row never
-- changes, rows are never deleted. (No API role has write grants; this also binds RPC code.)
create or replace function guard_world_branch_docs_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'world_branch_snapshot_immutable';
  end if;
  if OLD.snapshotted_at is not null
     or (NEW.branch_id, NEW.source_node_id, NEW.copied_node_id, NEW.baseline_name,
         NEW.baseline_category, NEW.baseline_content, NEW.created_at)
        is distinct from
        (OLD.branch_id, OLD.source_node_id, OLD.copied_node_id, OLD.baseline_name,
         OLD.baseline_category, OLD.baseline_content, OLD.created_at) then
    raise exception 'world_branch_snapshot_immutable';
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_branch_docs_immutable() from public, anon, authenticated, service_role;

drop trigger if exists world_branch_docs_guard_immutable on world_branch_docs;
create trigger world_branch_docs_guard_immutable before update or delete on world_branch_docs
  for each row execute function guard_world_branch_docs_immutable();

-- ---------------------------------------------------------------------------
-- 7. Delete guards (WTREE-10): soft delete is an UPDATE, so FKs alone cannot block it
-- ---------------------------------------------------------------------------
create or replace function guard_world_branch_children() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' or (OLD.deleted_at is null and NEW.deleted_at is not null) then
    if world_tree_branch_has_live_children(OLD.id) then
      raise exception 'world_branch_has_children';
    end if;
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_branch_children() from public, anon, authenticated, service_role;

drop trigger if exists world_branches_guard_children on world_branches;
create trigger world_branches_guard_children before update or delete on world_branches
  for each row execute function guard_world_branch_children();

create or replace function guard_world_work_children() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' or (OLD.deleted_at is null and NEW.deleted_at is not null) then
    if exists (select 1 from world_branches b
                where b.work_id = OLD.id and world_tree_branch_has_live_children(b.id)) then
      raise exception 'world_branch_has_children';
    end if;
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
revoke all on function guard_world_work_children() from public, anon, authenticated, service_role;

drop trigger if exists works_guard_world_children on works;
create trigger works_guard_world_children before update or delete on works
  for each row execute function guard_world_work_children();

-- Any work soft-delete path tombstones the work's own branch row in the same transaction.
create or replace function tombstone_world_branch_on_work_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if OLD.deleted_at is null and NEW.deleted_at is not null then
    update world_branches set deleted_at = now() where work_id = NEW.id and deleted_at is null;
  end if;
  return null;
end;
$$;
revoke all on function tombstone_world_branch_on_work_delete() from public, anon, authenticated, service_role;

drop trigger if exists works_tombstone_world_branch on works;
create trigger works_tombstone_world_branch after update of deleted_at on works
  for each row execute function tombstone_world_branch_on_work_delete();

notify pgrst, 'reload schema';
commit;
