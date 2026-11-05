begin;

-- Phase 14 (MCP-06/07): the writer's decisions on MCP proposals.
-- Accept / reject / revert run only in the writer's own browser session: the
-- first statement of every decision RPC is mcp_reject_oauth_caller(), so an
-- OAuth bearer (JWT carries client_id) gets 42501 before any row is read
-- (tests/mcp/read-boundary.database.test.ts classifies them as 'block').
-- SECURITY DEFINER bypasses RLS, so every RPC checks owner_id = auth.uid()
-- itself, locks the proposal and the target row FOR UPDATE, and writes the
-- original, the proposal status and the undo snapshot in one transaction.
-- Any raised error leaves the original and the proposal unchanged.
-- Error contract (message = code):
--   42501 browser session required (OAuth bearer)
--   42501 active writer required   (profiles.role <> 'writer' or deleted, same as 0037)
--   42501 mcp_suspended            (user_can_write false: accept / revert only)
--   P0001 mcp_not_found / mcp_not_pending / mcp_expired / mcp_stale
--   P0001 mcp_folder_invalid / mcp_folder_changed / mcp_name_collision
--   P0001 mcp_not_revertible / mcp_undo_expired
--   22023 mcp_invalid_content / mcp_invalid_decision
-- Re-runnable: every function is create or replace, grants are idempotent.
-- Migration 0040 is intentionally unused (reserved for the shared-DB catch-up).

-- 1) Cross-review fix for 0041: a connected writer demoted to reader (or a
--    deleted profile) must not keep proposing with an old bearer token. Same
--    body as 0041 plus the 0037 active-writer check. CREATE OR REPLACE keeps
--    the owner and the ACL (no role may EXECUTE); attributes are restated.
create or replace function public.mcp_proposal_caller()
returns table(out_user_id uuid, out_client_id uuid, out_client_name text, out_host text)
language plpgsql volatile set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_client_id uuid;
  v_connection record;
begin
  begin
    v_client_id := nullif((select auth.jwt() ->> 'client_id'), '')::uuid;
  exception when invalid_text_representation then
    v_client_id := null;
  end;
  if v_user_id is null or v_client_id is null or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;

  select c.client_name, c.redirect_host, c.scopes into v_connection
  from public.mcp_connections as c
  where c.user_id = v_user_id and c.oauth_client_id = v_client_id and c.revoked_at is null;
  if not found then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;
  -- 0042: same condition as mcp_connect (0037).
  if not exists (select 1 from public.profiles as pr
                 where pr.id = v_user_id and pr.role = 'writer' and pr.deleted_at is null) then
    raise exception 'active writer required' using errcode = '42501';
  end if;
  if not ('propose_draft' = any (v_connection.scopes)) then
    raise exception 'mcp_scope_denied' using errcode = '42501';
  end if;
  -- D-P14-07: suspended / permanently suspended writers cannot propose.
  if not public.user_can_write(v_user_id) then
    raise exception 'mcp_suspended' using errcode = '42501';
  end if;

  -- One writer's proposals are serialized: expiry, dedupe, supersede and the
  -- pending cap below are evaluated atomically.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mcp_propose:' || v_user_id::text, 0)
  );
  -- No scheduler exists, so expired pending rows are retired here; otherwise an
  -- expired pending draft would keep holding mcp_proposals_one_pending_draft.
  update public.mcp_proposals as p
     set status = 'expired', decided_at = pg_catalog.now()
   where p.owner_id = v_user_id and p.status = 'pending' and p.expires_at <= pg_catalog.now();

  return query select v_user_id, v_client_id, v_connection.client_name::text, v_connection.redirect_host::text;
end;
$$;

revoke all on function public.mcp_proposal_caller() from public, anon, authenticated, service_role;

-- 2) Shared front half of the decision RPCs (called after the OAuth guard).
--    Browser identity, live profile (and writer role when p_require_writer),
--    then opportunistic cleanup: expired pending rows become 'expired' and
--    undo snapshots past undo_until are dropped. A raised error later in the
--    caller rolls the cleanup back too, which is fine (it is opportunistic).
--    Not exposed: only the definer RPCs below (owner postgres) call it.
create or replace function public.mcp_decision_caller(p_require_writer boolean)
returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null or (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'browser session required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles as pr
                 where pr.id = v_user_id and pr.deleted_at is null
                   and (pr.role = 'writer' or not coalesce(p_require_writer, true))) then
    raise exception 'active writer required' using errcode = '42501';
  end if;

  -- Same per-writer lock as mcp_proposal_caller(): proposing and deciding for
  -- one writer never interleave (no supersede/accept race, no cleanup deadlock).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mcp_propose:' || v_user_id::text, 0)
  );
  update public.mcp_proposals as p
     set status = 'expired', decided_at = pg_catalog.now()
   where p.owner_id = v_user_id and p.status = 'pending' and p.expires_at <= pg_catalog.now();
  update public.mcp_proposals as p
     set undo_content = null
   where p.owner_id = v_user_id and p.undo_content is not null
     and (p.status <> 'accepted' or p.undo_until is null or p.undo_until <= pg_catalog.now());
  return v_user_id;
end;
$$;

revoke all on function public.mcp_decision_caller(boolean) from public, anon, authenticated, service_role;

-- Pending and not expired. The cleanup in mcp_decision_caller() may already
-- have turned an expired pending row into 'expired' in this transaction.
create or replace function public.mcp_decision_check_pending(p_status text, p_expires_at timestamptz)
returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_status = 'expired' or (p_status = 'pending' and p_expires_at <= pg_catalog.now()) then
    raise exception 'mcp_expired' using errcode = 'P0001';
  end if;
  if p_status is distinct from 'pending' then
    raise exception 'mcp_not_pending' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.mcp_decision_check_pending(text, timestamptz) from public, anon, authenticated, service_role;

-- Accepted text from the server action: not trusted beyond what the writer
-- could save directly (they own the target). Stored byte-for-byte (no CRLF
-- rewrite, so unselected paragraphs keep their bytes); NUL cannot reach a text
-- value (Postgres rejects it at input). Empty is allowed (all paragraphs dropped).
create or replace function public.mcp_decision_check_content(p_content text, p_max int)
returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_content is null or pg_catalog.length(p_content) > p_max then
    raise exception 'mcp_invalid_content' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.mcp_decision_check_content(text, int) from public, anon, authenticated, service_role;

-- Decision record built by the server action ({selections, edited, ...}): an
-- object of bounded size, or null.
create or replace function public.mcp_decision_check_decision(p_decision jsonb)
returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  if p_decision is null then
    return '{}'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_decision) <> 'object' or pg_catalog.length(p_decision::text) > 200000 then
    raise exception 'mcp_invalid_decision' using errcode = '22023';
  end if;
  return p_decision;
end;
$$;

revoke all on function public.mcp_decision_check_decision(jsonb) from public, anon, authenticated, service_role;

-- 3) accept_mcp_chapter_draft: the server action re-computed the paragraph
--    merge and sends the final text plus the hash of the original it merged
--    against. Chapter publication state is irrelevant (D-P14-01).
create or replace function public.accept_mcp_chapter_draft(
  p_proposal_id uuid, p_expected_hash text, p_new_content text, p_decision jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_decision jsonb;
  v_proposal public.mcp_proposals%rowtype;
  v_current text;
  v_applied text;
  v_undo_until timestamptz;
begin
  perform public.mcp_reject_oauth_caller();
  v_user_id := public.mcp_decision_caller(true);
  -- D-P14-07: suspended writers may only reject.
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_suspended' using errcode = '42501';
  end if;
  perform public.mcp_decision_check_content(p_new_content, 100000);
  v_decision := public.mcp_decision_check_decision(p_decision);

  select * into v_proposal from public.mcp_proposals as p
  where p.id = p_proposal_id and p.owner_id = v_user_id and p.kind = 'chapter_draft'
  for update;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  perform public.mcp_decision_check_pending(v_proposal.status, v_proposal.expires_at);

  select c.content into v_current
  from public.chapters as c
  join public.works as w on w.id = c.work_id
  where c.id = v_proposal.chapter_id and c.work_id = v_proposal.work_id
    and w.owner_id = v_user_id and c.deleted_at is null and w.deleted_at is null
  for update of c;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_current := coalesce(v_current, '');
  -- D-P14-04: the original changed after the writer looked -> nothing changes.
  if p_expected_hash is null or public.mcp_proposal_sha256(v_current) <> p_expected_hash then
    raise exception 'mcp_stale' using errcode = 'P0001';
  end if;

  v_applied := public.mcp_proposal_sha256(p_new_content);
  v_undo_until := pg_catalog.now() + interval '7 days';
  update public.chapters as c
     set content = p_new_content, updated_at = pg_catalog.now()
   where c.id = v_proposal.chapter_id;
  update public.mcp_proposals as p
     set status = 'accepted', decided_at = pg_catalog.now(), decision = v_decision,
         undo_content = v_current, undo_until = v_undo_until, applied_hash = v_applied
   where p.id = v_proposal.id;

  return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'accepted',
    'undo_until', v_undo_until, 'created_node_id', null);
end;
$$;

-- 4) accept_mcp_kb_edit: same shape for an existing work-scope document. The
--    target must still be a live, unlocked file of this work in 인물..아이템 or
--    custom (never template / 회차 / account_template / folders), as in 0041.
--    search_path: the kb_nodes guard triggers (0004 guard_chapter_folder_no_kb_files,
--    0002/0023 guard_locked_kb_node) reference kb_nodes unqualified and inherit the
--    caller's search_path, so kb-writing RPCs use "public, pg_temp" (pg_temp last
--    blocks temp-object shadowing). Every reference here is still schema-qualified.
create or replace function public.accept_mcp_kb_edit(
  p_proposal_id uuid, p_expected_hash text, p_new_content text, p_decision jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_decision jsonb;
  v_proposal public.mcp_proposals%rowtype;
  v_current text;
  v_applied text;
  v_undo_until timestamptz;
begin
  perform public.mcp_reject_oauth_caller();
  v_user_id := public.mcp_decision_caller(true);
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_suspended' using errcode = '42501';
  end if;
  perform public.mcp_decision_check_content(p_new_content, 50000);
  v_decision := public.mcp_decision_check_decision(p_decision);

  select * into v_proposal from public.mcp_proposals as p
  where p.id = p_proposal_id and p.owner_id = v_user_id and p.kind = 'kb_edit'
  for update;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  perform public.mcp_decision_check_pending(v_proposal.status, v_proposal.expires_at);

  select n.content into v_current
  from public.kb_nodes as n
  join public.works as w on w.id = n.work_id
  where n.id = v_proposal.node_id and n.work_id = v_proposal.work_id
    and n.owner_id = v_user_id and w.owner_id = v_user_id
    and n.scope = 'work' and n.node_type = 'file'
    and n.category in ('인물', '장소', '사건', '세력', '아이템', 'custom')
    and not n.is_locked
    and n.deleted_at is null and w.deleted_at is null
  for update of n;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_current := coalesce(v_current, '');
  if p_expected_hash is null or public.mcp_proposal_sha256(v_current) <> p_expected_hash then
    raise exception 'mcp_stale' using errcode = 'P0001';
  end if;

  v_applied := public.mcp_proposal_sha256(p_new_content);
  v_undo_until := pg_catalog.now() + interval '7 days';
  update public.kb_nodes as n
     set content = p_new_content, updated_at = pg_catalog.now()
   where n.id = v_proposal.node_id;
  update public.mcp_proposals as p
     set status = 'accepted', decided_at = pg_catalog.now(), decision = v_decision,
         undo_content = v_current, undo_until = v_undo_until, applied_hash = v_applied
   where p.id = v_proposal.id;

  return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'accepted',
    'undo_until', v_undo_until, 'created_node_id', null);
end;
$$;

-- 5) accept_mcp_kb_create: the writer picked the folder (D-P14-03). The folder
--    is re-validated here like lib/kb/actions.ts validateTargetFolder: owned,
--    this work, scope 'work', a live folder of the proposal's category, whose
--    parent chain reaches the single live category root (depth <= 32, no
--    cycle), and whose root->folder 'id:name' chain equals p_folder_version.
--    Any mismatch is an error; the file is never saved to another folder.
create or replace function public.accept_mcp_kb_create(
  p_proposal_id uuid, p_folder_id uuid, p_folder_version text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_proposal public.mcp_proposals%rowtype;
  v_folder record;
  v_chain text := '';
  v_cursor uuid;
  v_seen uuid[] := array[]::uuid[];
  v_depth int := 0;
  v_root uuid;
  v_node_id uuid;
  v_applied text;
  v_undo_until timestamptz;
begin
  perform public.mcp_reject_oauth_caller();
  v_user_id := public.mcp_decision_caller(true);
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_suspended' using errcode = '42501';
  end if;

  select * into v_proposal from public.mcp_proposals as p
  where p.id = p_proposal_id and p.owner_id = v_user_id and p.kind = 'kb_create'
  for update;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  perform public.mcp_decision_check_pending(v_proposal.status, v_proposal.expires_at);
  if not exists (select 1 from public.works as w
                 where w.id = v_proposal.work_id and w.owner_id = v_user_id and w.deleted_at is null) then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;

  -- Walk folder -> root; every hop must satisfy the same predicate. Rows are
  -- locked FOR SHARE so a concurrent rename / move / delete waits for us.
  v_cursor := p_folder_id;
  loop
    select n.id, n.name, n.parent_id into v_folder
    from public.kb_nodes as n
    where n.id = v_cursor and n.owner_id = v_user_id and n.work_id = v_proposal.work_id
      and n.scope = 'work' and n.node_type = 'folder' and n.category = v_proposal.proposed_category
      and n.deleted_at is null
    for share;
    if not found or v_cursor = any (v_seen) or v_depth > 32 then
      raise exception 'mcp_folder_invalid' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_cursor;
    v_chain := case when v_chain = '' then v_folder.id::text || ':' || v_folder.name
                    else v_folder.id::text || ':' || v_folder.name || '/' || v_chain end;
    exit when v_folder.parent_id is null;
    v_cursor := v_folder.parent_id;
    v_depth := v_depth + 1;
  end loop;
  v_root := v_folder.id;
  -- The single structural root (0010 unique index) must be this one.
  if (select pg_catalog.count(*) from public.kb_nodes as n
      where n.work_id = v_proposal.work_id and n.owner_id = v_user_id and n.scope = 'work'
        and n.node_type = 'folder' and n.parent_id is null and n.deleted_at is null
        and n.category = v_proposal.proposed_category) <> 1 then
    raise exception 'mcp_folder_invalid' using errcode = 'P0001';
  end if;
  if p_folder_version is null or v_chain <> p_folder_version then
    raise exception 'mcp_folder_changed' using errcode = 'P0001';
  end if;

  begin
    insert into public.kb_nodes as n
      (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
    values (v_user_id, v_proposal.work_id, 'work', p_folder_id, 'file', v_proposal.proposed_category,
      false, v_proposal.proposed_name, v_proposal.content)
    returning n.id into v_node_id;
  exception when unique_violation then
    -- Sibling name taken: the UI offers another folder or rejecting (no rename).
    raise exception 'mcp_name_collision' using errcode = 'P0001';
  end;

  v_applied := public.mcp_proposal_sha256(v_proposal.content);
  v_undo_until := pg_catalog.now() + interval '7 days';
  update public.mcp_proposals as p
     set status = 'accepted', decided_at = pg_catalog.now(),
         decision = pg_catalog.jsonb_build_object('folder_id', p_folder_id, 'folder_version', v_chain,
           'root_id', v_root),
         undo_content = null, undo_until = v_undo_until, applied_hash = v_applied,
         created_node_id = v_node_id
   where p.id = v_proposal.id;

  return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'accepted',
    'undo_until', v_undo_until, 'created_node_id', v_node_id);
end;
$$;

-- 6) reject_mcp_proposal: pending -> rejected. Nothing else changes, so a
--    suspended writer (and a demoted reader cleaning up) may reject too.
create or replace function public.reject_mcp_proposal(p_proposal_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_proposal public.mcp_proposals%rowtype;
begin
  perform public.mcp_reject_oauth_caller();
  v_user_id := public.mcp_decision_caller(false);

  select * into v_proposal from public.mcp_proposals as p
  where p.id = p_proposal_id and p.owner_id = v_user_id
  for update;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  perform public.mcp_decision_check_pending(v_proposal.status, v_proposal.expires_at);

  update public.mcp_proposals as p
     set status = 'rejected', decided_at = pg_catalog.now()
   where p.id = v_proposal.id;
  return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'rejected');
end;
$$;

-- 7) revert_mcp_proposal: once, within undo_until, not suspended. Chapter /
--    document edits get their pre-accept text back; a created document is
--    soft-deleted (not locked).
--    Change detection (under FOR UPDATE of the target):
--      chapter / kb_edit: sha256(content) <> applied_hash
--      kb_create: content hash <> applied_hash, or the name / parent folder /
--        lock state differs from what accept created (proposed_name,
--        decision.folder_id, unlocked)
--    If changed, nothing is restored unless p_confirm is true AND p_seen_hash
--    equals the target's current state hash (current_hash below), which the
--    writer saw in the previous confirm_required answer. A mismatch (the writer
--    edited again in between) returns a fresh confirm_required and restores
--    nothing, so a later edit is never overwritten silently.
--    current_hash: chapter / kb_edit = sha256(content);
--      kb_create = sha256(jsonb_build_array(name, parent_id, is_locked, content)::text).
--    p_confirm = true without p_seen_hash -> mcp_invalid_decision.
--    0042 drafts had revert_mcp_proposal(uuid, boolean); dropped here (never merged).
drop function if exists public.revert_mcp_proposal(uuid, boolean);

create or replace function public.revert_mcp_proposal(
  p_proposal_id uuid, p_confirm boolean default false, p_seen_hash text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id uuid;
  v_proposal public.mcp_proposals%rowtype;
  v_current text;
  v_name text;
  v_parent uuid;
  v_locked boolean;
  v_changed boolean;
  v_state_hash text;
begin
  perform public.mcp_reject_oauth_caller();
  v_user_id := public.mcp_decision_caller(true);
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_suspended' using errcode = '42501';
  end if;
  if coalesce(p_confirm, false) and p_seen_hash is null then
    raise exception 'mcp_invalid_decision' using errcode = '22023';
  end if;

  select * into v_proposal from public.mcp_proposals as p
  where p.id = p_proposal_id and p.owner_id = v_user_id
  for update;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  if v_proposal.status <> 'accepted' then
    raise exception 'mcp_not_revertible' using errcode = 'P0001';
  end if;
  if v_proposal.undo_until is null or v_proposal.undo_until <= pg_catalog.now()
     or (v_proposal.kind <> 'kb_create' and v_proposal.undo_content is null) then
    raise exception 'mcp_undo_expired' using errcode = 'P0001';
  end if;

  if v_proposal.kind = 'chapter_draft' then
    select c.content into v_current
    from public.chapters as c
    join public.works as w on w.id = c.work_id
    where c.id = v_proposal.chapter_id and c.work_id = v_proposal.work_id
      and w.owner_id = v_user_id and c.deleted_at is null and w.deleted_at is null
    for update of c;
  elsif v_proposal.kind = 'kb_edit' then
    select n.content into v_current
    from public.kb_nodes as n
    join public.works as w on w.id = n.work_id
    where n.id = v_proposal.node_id and n.work_id = v_proposal.work_id
      and n.owner_id = v_user_id and w.owner_id = v_user_id
      and n.scope = 'work' and n.node_type = 'file' and not n.is_locked
      and n.deleted_at is null and w.deleted_at is null
    for update of n;
  else
    select n.content, n.name, n.parent_id, n.is_locked into v_current, v_name, v_parent, v_locked
    from public.kb_nodes as n
    join public.works as w on w.id = n.work_id
    where n.id = v_proposal.created_node_id and n.work_id = v_proposal.work_id
      and n.owner_id = v_user_id and w.owner_id = v_user_id
      and n.node_type = 'file'
      and n.deleted_at is null and w.deleted_at is null
    for update of n;
  end if;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;

  v_changed := public.mcp_proposal_sha256(coalesce(v_current, '')) is distinct from v_proposal.applied_hash;
  if v_proposal.kind = 'kb_create' then
    v_changed := v_changed
      or v_name is distinct from v_proposal.proposed_name
      or v_parent is distinct from (v_proposal.decision ->> 'folder_id')::uuid
      or v_locked;
    v_state_hash := public.mcp_proposal_sha256(
      pg_catalog.jsonb_build_array(v_name, v_parent, v_locked, coalesce(v_current, ''))::text);
  else
    v_state_hash := public.mcp_proposal_sha256(coalesce(v_current, ''));
  end if;

  if v_changed and (not coalesce(p_confirm, false) or p_seen_hash is distinct from v_state_hash) then
    return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'accepted',
      'confirm_required', true, 'changed_since_accept', true, 'current_hash', v_state_hash);
  end if;

  if v_proposal.kind = 'chapter_draft' then
    update public.chapters as c
       set content = v_proposal.undo_content, updated_at = pg_catalog.now()
     where c.id = v_proposal.chapter_id;
  elsif v_proposal.kind = 'kb_edit' then
    update public.kb_nodes as n
       set content = v_proposal.undo_content, updated_at = pg_catalog.now()
     where n.id = v_proposal.node_id;
  else
    if v_locked then
      -- A locked node cannot be soft-deleted (locked_node_immutable).
      raise exception 'mcp_not_revertible' using errcode = 'P0001';
    end if;
    update public.kb_nodes as n
       set deleted_at = pg_catalog.now(), updated_at = pg_catalog.now()
     where n.id = v_proposal.created_node_id;
  end if;

  update public.mcp_proposals as p
     set status = 'reverted', undo_content = null,
         decision = coalesce(p.decision, '{}'::jsonb)
           || pg_catalog.jsonb_build_object('reverted_at', pg_catalog.now(), 'changed_since_accept', v_changed)
   where p.id = v_proposal.id;
  return pg_catalog.jsonb_build_object('id', v_proposal.id, 'status', 'reverted',
    'confirm_required', false, 'changed_since_accept', v_changed, 'current_hash', null);
end;
$$;

-- 8) EXECUTE: authenticated only (browser sessions; OAuth is refused in-body).
revoke all on function public.accept_mcp_chapter_draft(uuid, text, text, jsonb) from public, anon, service_role;
revoke all on function public.accept_mcp_kb_edit(uuid, text, text, jsonb) from public, anon, service_role;
revoke all on function public.accept_mcp_kb_create(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.reject_mcp_proposal(uuid) from public, anon, service_role;
revoke all on function public.revert_mcp_proposal(uuid, boolean, text) from public, anon, service_role;
grant execute on function public.accept_mcp_chapter_draft(uuid, text, text, jsonb) to authenticated;
grant execute on function public.accept_mcp_kb_edit(uuid, text, text, jsonb) to authenticated;
grant execute on function public.accept_mcp_kb_create(uuid, uuid, text) to authenticated;
grant execute on function public.reject_mcp_proposal(uuid) to authenticated;
grant execute on function public.revert_mcp_proposal(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;
