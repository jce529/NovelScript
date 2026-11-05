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

revoke all on function public.accept_mcp_chapter_draft(uuid, text, text, jsonb) from public, anon, service_role;
revoke all on function public.accept_mcp_kb_edit(uuid, text, text, jsonb) from public, anon, service_role;
grant execute on function public.accept_mcp_chapter_draft(uuid, text, text, jsonb) to authenticated;
grant execute on function public.accept_mcp_kb_edit(uuid, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
