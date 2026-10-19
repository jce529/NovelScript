begin;

-- Phase 18 (18-04): world-tree reader projection, broken-branch stubs (WORLD-TREE rule 23),
-- author self-view exclusion and the public read guards built on the shared visibility helper.
-- Apply after 0032 (schema), 0033 (world_work_reader_visible), 0034 (branch RPCs,
-- world_tree_require_writer) and 0035 (timeline).
--
-- Contract mirror: lib/world-tree/types.ts (ReaderWorldTreeProjection / BrokenBranchStub /
-- OwnerWorldTreeProjection) and lib/world-tree/queries.ts (strict reader/owner validation).
--
-- Visibility rule (rule 8 revised, WTREE-07): a work is shown to readers by its OWN publish state
-- only, i.e. world_work_reader_visible(work) from 0033. This migration consumes that helper; it
-- never redefines it or its grants. A parent's state is never a visibility condition for a
-- published child, the 50-chapter branching threshold is never a visibility condition, and there
-- is no per-connection publish input, policy or column.
--
-- Rule 23 (broken branch): published works are decided first; on their ancestor paths every
-- non-visible parent becomes a BrokenBranchStub with exactly {nodeType, nodeKey, parentNodeKey,
-- positionHint}. Keys are per-response (n0, n1, ... / e0, e1, ...) and fully replace DB UUIDs of
-- stubs; no parent/root/work/branch id, title, cover, chapter, fruit, original era, fork point,
-- document, diff, metric or hidden-subtree size of a stub is returned. A non-visible leaf (or any
-- path without a visible descendant) is dropped. Republishing restores the normal node on the
-- next read: nothing here writes parent_branch_id or the child snapshot. Delete/blind keep their
-- existing policies (a blinded parent is simply not reader-visible -> stub; a parent with live
-- children still cannot be deleted, 0034).
--
-- WTREE-09 note (out of scope): when a parent is private, pre-fork document locks follow the
-- child reader's progress. No progress/lock behaviour is implemented here.
--
-- Static source checks (tests/world-tree/visibility-source.test.ts) are not RLS/RPC runtime
-- proof; the live-DB suites (visibility.database / view-count.database) run in 18-12.

-- ---------------------------------------------------------------------------
-- 1. Author self-view exclusion cutoff (fixed at the first apply of this migration)
-- ---------------------------------------------------------------------------
-- Historical view_count rows mix author and reader opens and cannot be split retroactively.
-- They are kept as they are; signed-in author opens are excluded from this moment on
-- (increment_chapter_view below). The apply time is baked into the function body once.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.proname = 'world_tree_author_view_cutoff' and n.nspname = current_schema()
  ) then
    execute format(
      'create function world_tree_author_view_cutoff() returns timestamptz language sql immutable as %L',
      format('select %L::timestamptz', now()));
  end if;
end;
$$;
revoke all on function world_tree_author_view_cutoff() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Raw fruit metrics (WTREE-08 temporary feed proxy input; adapter lives in 18-05)
-- ---------------------------------------------------------------------------
-- Same inputs as the feed: sum of live published chapter views, like rows, and the average
-- adjacent next-chapter view ratio (lib/discovery/actions.ts averageNextChapterCtr).
create or replace function world_tree_work_metrics(p_work_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with ch as (
    select c.view_count::numeric as v,
           lag(c.view_count::numeric) over (order by c.order_index, c.id) as prev
      from chapters c
     where c.work_id = p_work_id and c.is_published and c.deleted_at is null
  )
  select jsonb_build_object(
    'totalViews', coalesce((select sum(greatest(ch.v, 0)) from ch), 0),
    'likeCount', (select count(*) from work_likes l where l.work_id = p_work_id),
    'ctr', coalesce((select avg(case when ch.prev > 0 then least(greatest(ch.v, 0) / ch.prev, 1) else 0 end)
                       from ch where ch.prev is not null)::double precision, 0));
$$;
revoke all on function world_tree_work_metrics(uuid) from public, anon, authenticated, service_role;

-- Setting change count of a confirmed child branch (null for the trunk and for drafts).
create or replace function world_tree_branch_diff_count(p_branch_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when b.kind = 'trunk' or b.status <> 'confirmed' then null
    else (select count(*)::integer from world_branch_docs d
           where d.branch_id = b.id and d.change_kind in ('added', 'modified', 'deleted'))
  end
  from world_branches b where b.id = p_branch_id;
$$;
revoke all on function world_tree_branch_diff_count(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Reader projection (internal; reached only through get_world_tree)
-- ---------------------------------------------------------------------------
create or replace function world_tree_reader_projection(p_work_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_unavailable constant jsonb := jsonb_build_object('status', 'unavailable');
  v_title text;
  v_root uuid;
  v_rows jsonb;
  v_era_rows jsonb;
  v_places jsonb;
  v_nodes jsonb;
  v_eras jsonb;
  v_focus text;
begin
  -- Entry is decided by the requested work's own publish state. Unpublished, draft, deleted,
  -- blinded and missing ids all return the same unavailable answer.
  if p_work_id is null or not world_work_reader_visible(p_work_id) then
    return v_unavailable;
  end if;
  select w.title into v_title from works w where w.id = p_work_id;

  select b.root_work_id into v_root
    from world_branches b
   where b.work_id = p_work_id and b.deleted_at is null and b.status = 'confirmed';
  if v_root is null then
    -- A published work without a world tree yet is a single trunk fruit.
    return jsonb_build_object(
      'status', 'ok', 'audience', 'reader',
      'header', jsonb_build_object('title', v_title),
      'focusNodeKey', 'n0',
      'eras', '[]'::jsonb,
      'nodes', jsonb_build_array(jsonb_build_object(
        'nodeType', 'work', 'nodeKey', 'n0', 'parentNodeKey', 'null'::jsonb,
        'workId', p_work_id, 'title', v_title, 'kind', 'trunk', 'placement', 'null'::jsonb,
        'diffCount', 'null'::jsonb, 'metrics', world_tree_work_metrics(p_work_id))));
  end if;

  -- Published works first, then every ancestor on their paths (the root is NOT required to be
  -- visible: a private root only becomes a stub). Paths without a visible work are dropped.
  with recursive tree as (
    select b.id, b.work_id, b.parent_branch_id, b.kind, b.depth, b.confirmed_at,
           world_work_reader_visible(b.work_id) as visible
      from world_branches b
     where b.root_work_id = v_root and b.deleted_at is null and b.status = 'confirmed'
  ),
  kept as (
    select t.id, t.parent_branch_id from tree t where t.visible
    union
    select t.id, t.parent_branch_id from tree t join kept k on t.id = k.parent_branch_id
  ),
  keyed as (
    select t.*, (row_number() over (order by t.depth, t.confirmed_at, t.id) - 1)::integer as ord
      from tree t
     where t.id in (select k.id from kept k)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'work_id', k.work_id, 'parent_id', k.parent_branch_id, 'kind', k.kind,
           'visible', k.visible, 'depth', k.depth, 'ord', k.ord, 'key', 'n' || k.ord) order by k.ord), '[]'::jsonb)
    into v_rows
    from keyed k;

  -- Fail closed on a broken structure: exactly one top node, every parent link inside the
  -- response, and the requested work present as a visible node.
  if (select count(*) from jsonb_to_recordset(v_rows) r(parent_id uuid) where r.parent_id is null) <> 1
     or exists (
       select 1 from jsonb_to_recordset(v_rows) r(parent_id uuid)
        where r.parent_id is not null
          and not exists (select 1 from jsonb_to_recordset(v_rows) p(id uuid) where p.id = r.parent_id))
     or not exists (
       select 1 from jsonb_to_recordset(v_rows) r(work_id uuid, visible boolean)
        where r.work_id = p_work_id and r.visible) then
    return v_unavailable;
  end if;

  select r.key into v_focus
    from jsonb_to_recordset(v_rows) r(work_id uuid, key text) where r.work_id = p_work_id;

  -- Eras of visible work lines only (a stub never exposes its timeline). Inherited copies are the
  -- child's own snapshot axis: name/year/inherited only, never source_era_id or memo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'rn', x.rn, 'key', 'e' || (x.rn - 1), 'node_key', x.node_key, 'position', x.position,
           'name', x.name, 'year_label', x.year_label, 'inherited', x.inherited) order by x.rn), '[]'::jsonb)
    into v_era_rows
    from (
      select e.id, r.key as node_key, e.position, e.name, e.year_label, e.inherited,
             row_number() over (order by r.ord, e.position, e.id) as rn
        from jsonb_to_recordset(v_rows) r(id uuid, visible boolean, ord integer, key text)
        join world_eras e on e.branch_id = r.id and e.deleted_at is null
       where r.visible
    ) x;

  -- Each visible work's own placement on its own line. Order is re-densified among the visible
  -- placements of that era and concurrency is kept only when the real predecessor is visible
  -- and adjacent, so hidden fruits are neither counted nor implied.
  select coalesce(jsonb_object_agg(y.work_id::text, jsonb_build_object(
           'eraKey', y.era_key, 'orderIndex', y.dense - 1,
           'concurrentWithPrev', y.concurrent and y.prev_order is not distinct from y.order_index - 1)), '{}'::jsonb)
    into v_places
    from (
      select pl.work_id, er.key as era_key, pl.order_index, pl.concurrent_with_prev as concurrent,
             row_number() over (partition by pl.era_id order by pl.order_index, pl.id) as dense,
             lag(pl.order_index) over (partition by pl.era_id order by pl.order_index, pl.id) as prev_order
        from jsonb_to_recordset(v_rows) r(id uuid, work_id uuid, visible boolean)
        join world_era_placements pl on pl.branch_id = r.id and pl.work_id = r.work_id and pl.deleted_at is null
        join jsonb_to_recordset(v_era_rows) er(id uuid, key text) on er.id = pl.era_id
       where r.visible
    ) y;

  select jsonb_agg(
           case when r.visible then jsonb_build_object(
             'nodeType', 'work',
             'nodeKey', r.key,
             'parentNodeKey', coalesce(to_jsonb(p.key), 'null'::jsonb),
             'workId', r.work_id,
             'title', w.title,
             'kind', r.kind,
             'placement', coalesce(v_places -> r.work_id::text, 'null'::jsonb),
             'diffCount', coalesce(to_jsonb(world_tree_branch_diff_count(r.id)), 'null'::jsonb),
             'metrics', world_tree_work_metrics(r.work_id))
           else jsonb_build_object(
             'nodeType', 'broken',
             'nodeKey', r.key,
             'parentNodeKey', coalesce(to_jsonb(p.key), 'null'::jsonb),
             -- Every ancestor of a kept node is kept, so depth == number of ancestors in this response.
             'positionHint', r.depth)
           end order by r.ord)
    into v_nodes
    from jsonb_to_recordset(v_rows) r(id uuid, work_id uuid, parent_id uuid, kind text, visible boolean,
                                      depth integer, ord integer, key text)
    left join jsonb_to_recordset(v_rows) p(id uuid, key text) on p.id = r.parent_id
    left join works w on r.visible and w.id = r.work_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'eraKey', er.key, 'nodeKey', er.node_key, 'position', er.position, 'name', er.name,
           'yearLabel', coalesce(to_jsonb(er.year_label), 'null'::jsonb), 'inherited', er.inherited)
           order by er.rn), '[]'::jsonb)
    into v_eras
    from jsonb_to_recordset(v_era_rows) er(rn bigint, key text, node_key text, position integer, name text,
                                           year_label text, inherited boolean);

  -- Header: the requested published work only (never a private root title).
  return jsonb_build_object(
    'status', 'ok', 'audience', 'reader',
    'header', jsonb_build_object('title', v_title),
    'focusNodeKey', v_focus,
    'eras', v_eras,
    'nodes', v_nodes);
end;
$$;
revoke all on function world_tree_reader_projection(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Owner/admin full projection (internal; reached only through get_world_tree)
-- ---------------------------------------------------------------------------
-- Real DB ancestry and full work meta (drafts and unpublished included), never setting content,
-- document names or source refs.
create or replace function world_tree_full_projection(p_work_id uuid, p_audience text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_unavailable constant jsonb := jsonb_build_object('status', 'unavailable');
  v_work works%rowtype;
  v_root uuid;
begin
  if p_audience not in ('owner', 'admin') then
    return v_unavailable;
  end if;
  select * into v_work from works w where w.id = p_work_id;
  if not found or v_work.deleted_at is not null then
    return v_unavailable;
  end if;
  select b.root_work_id into v_root from world_branches b
   where b.work_id = p_work_id and b.deleted_at is null;

  return jsonb_build_object(
    'status', 'ok',
    'audience', p_audience,
    'header', jsonb_build_object('title', v_work.title),
    'focusWorkId', p_work_id,
    'rootWorkId', coalesce(v_root, p_work_id),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'branchId', b.id,
               'workId', b.work_id,
               'parentBranchId', b.parent_branch_id,
               'title', w.title,
               'kind', b.kind,
               'status', b.status,
               'isPublished', exists (select 1 from chapters c
                                       where c.work_id = b.work_id and c.is_published and c.deleted_at is null),
               'readerVisible', world_work_reader_visible(b.work_id),
               'forkEraId', b.fork_era_id,
               'diffCount', coalesce(to_jsonb(world_tree_branch_diff_count(b.id)), 'null'::jsonb),
               'metrics', world_tree_work_metrics(b.work_id))
             order by b.depth, b.created_at, b.id)
        from world_branches b join works w on w.id = b.work_id
       where v_root is not null and b.root_work_id = v_root and b.deleted_at is null), '[]'::jsonb),
    'eras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'branchId', e.branch_id, 'sourceEraId', e.source_era_id, 'position', e.position,
               'name', e.name, 'yearLabel', e.year_label, 'memo', e.memo, 'inherited', e.inherited,
               'deletedAt', 'null'::jsonb)
             order by e.branch_id, e.position, e.id)
        from world_eras e join world_branches b on b.id = e.branch_id
       where v_root is not null and b.root_work_id = v_root and b.deleted_at is null and e.deleted_at is null), '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'branchId', p.branch_id, 'eraId', p.era_id, 'workId', p.work_id,
               'orderIndex', p.order_index, 'concurrentWithPrev', p.concurrent_with_prev,
               'relationLabel', p.relation_label)
             order by p.branch_id, p.era_id, p.order_index, p.id)
        from world_era_placements p join world_branches b on b.id = p.branch_id
       where v_root is not null and b.root_work_id = v_root and b.deleted_at is null and p.deleted_at is null), '[]'::jsonb));
end;
$$;
revoke all on function world_tree_full_projection(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. get_world_tree (public entry point)
-- ---------------------------------------------------------------------------
-- Audience is decided here from auth.uid() only (never from a client flag):
--   owner = the work's owner with a live profile; admin = an active admin_users membership
--   (revoked_at is null) with a live profile. Anyone else (anon included) gets the reader
--   projection. p_reader_preview=true is honoured only for owner/admin and returns the SAME
--   reader projection from the database; anyone else asking for a preview is unavailable.
create or replace function get_world_tree(p_work_id uuid, p_reader_preview boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_live_profile boolean := false;
  v_is_owner boolean := false;
  v_is_admin boolean := false;
  v_preview boolean := coalesce(p_reader_preview, false);
begin
  if p_work_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;
  select w.owner_id into v_owner from works w where w.id = p_work_id;

  if v_uid is not null then
    v_live_profile := exists (select 1 from profiles p where p.id = v_uid and p.deleted_at is null);
  end if;
  if v_live_profile then
    v_is_owner := v_owner is not null and v_owner = v_uid;
    v_is_admin := exists (select 1 from admin_users a where a.user_id = v_uid and a.revoked_at is null);
  end if;

  if v_preview and not (v_is_owner or v_is_admin) then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if (v_is_owner or v_is_admin) and not v_preview then
    return world_tree_full_projection(p_work_id, case when v_is_owner then 'owner' else 'admin' end);
  end if;
  return world_tree_reader_projection(p_work_id);
end;
$$;
revoke all on function get_world_tree(uuid, boolean) from public, service_role;
grant execute on function get_world_tree(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Global metric baseline (public works only)
-- ---------------------------------------------------------------------------
-- Global maxima over reader-visible works and their live published chapters, so the same raw
-- metric gives the same fruit size in every world. authorViewsExcludedSince is the cutoff above.
create or replace function get_world_tree_metric_baseline() returns jsonb
language sql stable security definer set search_path = public as $$
  with per as (
    select coalesce((select sum(greatest(c.view_count, 0)) from chapters c
                      where c.work_id = w.id and c.is_published and c.deleted_at is null), 0) as views,
           (select count(*) from work_likes l where l.work_id = w.id) as likes
      from works w
     where world_work_reader_visible(w.id)
  )
  select jsonb_build_object(
    'maxTotalViews', coalesce((select max(per.views) from per), 0),
    'maxLikeCount', coalesce((select max(per.likes) from per), 0),
    'authorViewsExcludedSince', world_tree_author_view_cutoff());
$$;
revoke all on function get_world_tree_metric_baseline() from public, service_role;
grant execute on function get_world_tree_metric_baseline() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. mark_branch_notice_read (owner writer only; changes read_at and nothing else)
-- ---------------------------------------------------------------------------
create or replace function mark_branch_notice_read(p_notice_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_read_at timestamptz;
begin
  -- auth.uid -> writer role -> user_can_write (0034)
  v_uid := world_tree_require_writer();
  -- A missing notice and someone else's notice raise the same code.
  update world_branch_notices n
     set read_at = coalesce(n.read_at, now())
    from world_branches b
   where n.id = p_notice_id and b.id = n.branch_id and b.owner_id = v_uid
  returning n.read_at into v_read_at;
  if not found then
    raise exception 'world_tree_forbidden';
  end if;
  return jsonb_build_object('notice_id', p_notice_id, 'read_at', v_read_at);
end;
$$;
revoke all on function mark_branch_notice_read(uuid) from public, anon, service_role;
grant execute on function mark_branch_notice_read(uuid) to authenticated;

-- ===========================================================================
-- Task 2: general public read rules on the same predicate (work's own publish state)
-- ===========================================================================
-- 0008 / 0009 / 0017 are reference only; their files are not edited. The functions below are
-- redefined here with the same signatures, grants and blind precedence. The purchase / settlement
-- / ledger / idempotency bodies (create_purchase_order, pay_purchase_order, 0017) are NOT
-- redefined and existing entitlements are untouched. No parent-state check and no "hidden
-- connection" rule is added anywhere: a published child of a private parent is readable,
-- listable, purchasable and counted like any other published work.

-- ---------------------------------------------------------------------------
-- 8. Public metadata visibility (normal reader visibility, or the existing blind notice)
-- ---------------------------------------------------------------------------
-- world_work_reader_visible is false for a work-wide blind. The existing blind contract (0009
-- D-11..D-14) still shows a blinded published work's metadata/TOC with a blind notice and
-- 'blinded' access states, so metadata paths accept exactly that extra case. Body rights
-- (can_view) use world_work_reader_visible alone. Reads base columns only (no RLS recursion).
create or replace function world_work_public_meta_visible(p_work_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select world_work_reader_visible(p_work_id)
      or coalesce((
        select w.admin_blinded
           and w.deleted_at is null
           and not w.is_branch_draft
           and exists (select 1 from chapters c
                        where c.work_id = w.id and c.is_published and c.deleted_at is null)
          from works w
         where w.id = p_work_id), false);
$$;
revoke all on function world_work_public_meta_visible(uuid) from public;
-- Policy expressions run with the caller's privileges, so every API role needs EXECUTE.
grant execute on function world_work_public_meta_visible(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. works / chapters public-read RLS (owner_all and restrictive write policies untouched)
-- ---------------------------------------------------------------------------
drop policy if exists "works_public_read" on works;
create policy "works_public_read" on works for select
  using (world_work_public_meta_visible(id));

drop policy if exists "chapters_public_read" on chapters;
create policy "chapters_public_read" on chapters for select
  using (is_published = true and deleted_at is null and world_work_public_meta_visible(work_id));

-- ---------------------------------------------------------------------------
-- 10. Direct read RPCs (0009 bodies + the same work predicate)
-- ---------------------------------------------------------------------------
-- can_view: body/entitlement right. Blind precedence is unchanged (a blind is never readable).
-- read_chapter_content (0009) is not redefined: its public path is can_view(...) and its owner
-- correction path is unchanged, so it inherits this predicate.
create or replace function can_view(p_work_id uuid, p_chapter_id uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w where w.id = p_work_id and w.deleted_at is null and not w.admin_blinded
    and world_work_reader_visible(w.id)
    and (p_chapter_id is null or exists (
      select 1 from chapters c where c.id = p_chapter_id and c.work_id = w.id
        and c.is_published and c.deleted_at is null and not c.admin_blinded
    ))
    and (
      (p_chapter_id is not null and exists (
        select 1 from chapters c where c.id = p_chapter_id and c.work_id = w.id and c.price_tier is null
      ))
      or chapter_entitled(w.id, p_chapter_id)
    )
  );
$$;

-- TOC access: public rows only for publicly visible works; the live owner keeps the rows of their
-- own work (studio/owner preview of a draft), exactly like the 0009 owner correction path.
create or replace function list_chapter_access(p_work_id uuid)
returns table(chapter_id uuid, allowed boolean, entitled boolean, blinded boolean, blind_reason text)
language sql stable security definer set search_path = public as $$
  select c.id,
    can_view(c.work_id, c.id),
    chapter_entitled(c.work_id, c.id),
    w.admin_blinded or c.admin_blinded,
    case when w.admin_blinded then w.admin_blind_reason when c.admin_blinded then c.admin_blind_reason end
  from chapters c join works w on w.id = c.work_id
  where c.work_id = p_work_id and c.is_published and c.deleted_at is null and w.deleted_at is null
    and (world_work_public_meta_visible(w.id)
      or (auth.uid() is not null and w.owner_id = auth.uid()
        and exists (select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null)));
$$;

-- Viewer state: a draft / unpublished work's chapter is 'unavailable' for everyone but its live
-- owner, the same answer as a missing or mismatched id.
create or replace function get_chapter_access_state(p_work_id uuid, p_chapter_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'state', case
        when w.admin_blinded or c.admin_blinded then 'blinded'
        when can_view(w.id, c.id) then 'readable'
        when auth.uid() is not null and w.owner_id = auth.uid()
          and exists(select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null) then 'readable'
        else 'purchase_required' end,
      'blind_scope', case when w.admin_blinded then 'work' when c.admin_blinded then 'chapter' end,
      'blind_reason', case when w.admin_blinded then w.admin_blind_reason
        when c.admin_blinded then c.admin_blind_reason end,
      'entitled', chapter_entitled(w.id, c.id))
    from chapters c join works w on w.id = c.work_id
    where c.id = p_chapter_id and w.id = p_work_id
      and c.is_published and c.deleted_at is null and w.deleted_at is null
      and (world_work_public_meta_visible(w.id)
        or (auth.uid() is not null and w.owner_id = auth.uid()
          and exists (select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null)))
  ), jsonb_build_object('state', 'unavailable', 'blind_scope', null, 'blind_reason', null, 'entitled', false));
$$;

revoke all on function can_view(uuid, uuid), list_chapter_access(uuid), get_chapter_access_state(uuid, uuid) from public;
grant execute on function can_view(uuid, uuid), list_chapter_access(uuid), get_chapter_access_state(uuid, uuid)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. increment_chapter_view (0008 body + reader visibility + author self-view skip)
-- ---------------------------------------------------------------------------
-- anon: counted as before (an anonymous author cannot be identified; not claimed as solved).
-- suspended/deleted signed-in user: skipped silently as in 0008.
-- signed-in owner: skipped, decided by auth.uid() vs works.owner_id (never a client argument),
--   from world_tree_author_view_cutoff() on. Existing view_count values are never reset or
--   estimated down.
-- Only a live, published, unblinded chapter of a reader-visible work counts; a parent's state
-- never blocks a published child's count.
create or replace function increment_chapter_view(p_chapter_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and not user_can_write(v_uid) then
    return;
  end if;
  update chapters c
     set view_count = c.view_count + 1
    from works w
   where c.id = p_chapter_id and c.is_published = true and c.deleted_at is null and not c.admin_blinded
     and w.id = c.work_id and world_work_reader_visible(w.id)
     and (v_uid is null or w.owner_id <> v_uid);
end;
$$;
revoke all on function increment_chapter_view(uuid) from public;
grant execute on function increment_chapter_view(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
