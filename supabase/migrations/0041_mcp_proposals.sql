begin;

-- Phase 14 (MCP-05/06/07): proposal-only write boundary for MCP clients.
-- An OAuth bearer (JWT carries client_id) can never touch public.mcp_proposals
-- directly: the table is closed to OAuth by the same RESTRICTIVE
-- oauth_browser_only policy 0039 put on every other blocked table (0039's loop
-- only covered tables that existed at apply time, so it is created here).
-- Browsers may SELECT their own rows; nobody gets INSERT/UPDATE/DELETE grants.
-- The only way in is the three bearer-only SECURITY DEFINER RPCs below, which
-- re-check the live grant, the connection's propose_draft scope, write access
-- (sanctions) and ownership, and fill source/base snapshots server-side.
-- None of them writes chapters or kb_nodes: originals stay unchanged until the
-- writer accepts in the studio (0042, browser session only).
-- Migration 0040 is intentionally unused (reserved for the shared-DB catch-up).

create table public.mcp_proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  kind text not null check (kind in ('chapter_draft', 'kb_edit', 'kb_create')),
  chapter_id uuid references public.chapters(id) on delete cascade,
  node_id uuid references public.kb_nodes(id) on delete cascade,
  proposed_category text,
  proposed_name text,
  -- Proposed full text, CRLF/CR normalized to LF by the RPC.
  content text not null check (length(content) between 1 and 100000),
  -- sha256 hex of content (dedupe key).
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- Original at proposal time, stored verbatim (3-way merge anchor) and its sha256 hex.
  base_content text,
  base_hash text check (base_hash is null or base_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded', 'expired', 'reverted')),
  -- Source snapshot read from mcp_connections by the RPC (never from arguments),
  -- so the origin stays visible after the connection is revoked.
  source_client_id uuid not null,
  source_client_name text not null,
  source_host text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  decided_at timestamptz,
  decision jsonb,
  undo_content text,
  undo_until timestamptz,
  applied_hash text,
  created_node_id uuid references public.kb_nodes(id) on delete set null,
  constraint mcp_proposals_kind_shape check (
    (kind = 'chapter_draft' and chapter_id is not null and node_id is null
      and proposed_category is null and proposed_name is null
      and base_content is not null and base_hash is not null)
    or (kind = 'kb_edit' and node_id is not null and chapter_id is null
      and proposed_category is null and proposed_name is null
      and base_content is not null and base_hash is not null and length(content) <= 50000)
    or (kind = 'kb_create' and chapter_id is null and node_id is null
      and proposed_category is not null and proposed_name is not null
      and proposed_category in ('인물', '장소', '사건', '세력', '아이템')
      and length(proposed_name) between 1 and 100
      and base_content is null and base_hash is null and length(content) <= 50000)
  )
);

-- D-P14-06: at most one pending draft per chapter, enforced by the DB.
create unique index mcp_proposals_one_pending_draft
  on public.mcp_proposals (chapter_id) where kind = 'chapter_draft' and status = 'pending';
create index mcp_proposals_queue_idx
  on public.mcp_proposals (owner_id, work_id, status, created_at desc);
create index mcp_proposals_owner_pending_idx
  on public.mcp_proposals (owner_id, expires_at) where status = 'pending';
create index mcp_proposals_node_idx on public.mcp_proposals (node_id) where node_id is not null;
create index mcp_proposals_created_node_idx
  on public.mcp_proposals (created_node_id) where created_node_id is not null;

alter table public.mcp_proposals enable row level security;
create policy mcp_proposals_select_own on public.mcp_proposals
  for select to authenticated using (owner_id = (select auth.uid()));
-- Same name and shape as 0039 (tests/mcp/read-boundary.database.test.ts checks it).
create policy oauth_browser_only on public.mcp_proposals
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
revoke all on public.mcp_proposals from public, anon, authenticated;
grant select on public.mcp_proposals to authenticated;

-- Shared front half of the three propose RPCs: bearer identity, live grant,
-- connection scope, write access, per-writer serialization, expiry cleanup.
-- Not exposed: only the definer RPCs below (owner postgres) call it.
create function public.mcp_proposal_caller()
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

-- CRLF/CR -> LF, then length / blank checks. NUL never reaches here (Postgres
-- text rejects it at input), the MCP tool schema rejects it first anyway.
create function public.mcp_proposal_normalize(p_content text, p_max int)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_content text;
begin
  if p_content is null then
    raise exception 'mcp_invalid_content' using errcode = '22023';
  end if;
  v_content := pg_catalog.replace(pg_catalog.replace(p_content, E'\r\n', E'\n'), E'\r', E'\n');
  if pg_catalog.length(v_content) < 1 or pg_catalog.length(v_content) > p_max
     or v_content ~ '^[[:space:]]*$' then
    raise exception 'mcp_invalid_content' using errcode = '22023';
  end if;
  return v_content;
end;
$$;

revoke all on function public.mcp_proposal_normalize(text, int) from public, anon, authenticated, service_role;

create function public.mcp_proposal_sha256(p_text text)
returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_text, 'UTF8')), 'hex');
$$;

revoke all on function public.mcp_proposal_sha256(text) from public, anon, authenticated, service_role;

-- Pending cap per writer (D-P14-05): 50 live pending proposals.
create function public.mcp_proposal_check_cap(p_user_id uuid)
returns void
language plpgsql stable set search_path = '' as $$
begin
  if (select pg_catalog.count(*) from public.mcp_proposals as p
      where p.owner_id = p_user_id and p.status = 'pending'
        and p.expires_at > pg_catalog.now()) >= 50 then
    raise exception 'mcp_cap_reached' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.mcp_proposal_check_cap(uuid) from public, anon, authenticated, service_role;

-- save_draft: one chapter, full draft text. Chapter publication state is irrelevant.
create function public.mcp_propose_chapter_draft(p_work_id uuid, p_chapter_id uuid, p_content text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller record;
  v_content text;
  v_hash text;
  v_base text;
  v_existing record;
  v_superseded uuid;
  v_row record;
begin
  select * into v_caller from public.mcp_proposal_caller();
  v_content := public.mcp_proposal_normalize(p_content, 100000);
  v_hash := public.mcp_proposal_sha256(v_content);

  select c.content into v_base
  from public.chapters as c
  join public.works as w on w.id = c.work_id
  where c.id = p_chapter_id and c.work_id = p_work_id
    and w.owner_id = v_caller.out_user_id
    and c.deleted_at is null and w.deleted_at is null;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_base := coalesce(v_base, '');
  if v_base = v_content then
    raise exception 'mcp_no_change' using errcode = 'P0001';
  end if;

  select p.id, p.source_client_id, p.content_hash, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.chapter_id = p_chapter_id and p.kind = 'chapter_draft' and p.status = 'pending'
  for update;
  if found then
    -- Same connection retrying the same text: idempotent, same id.
    if v_existing.source_client_id = v_caller.out_client_id and v_existing.content_hash = v_hash then
      return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
        'expires_at', v_existing.expires_at, 'superseded_id', null);
    end if;
    update public.mcp_proposals as p
       set status = 'superseded', decided_at = pg_catalog.now()
     where p.id = v_existing.id;
    v_superseded := v_existing.id;
  end if;

  -- Counted after superseding: replacing a pending draft needs no extra capacity.
  perform public.mcp_proposal_check_cap(v_caller.out_user_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, chapter_id, content, content_hash, base_content, base_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'chapter_draft', p_chapter_id, v_content, v_hash,
     v_base, public.mcp_proposal_sha256(v_base),
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', v_superseded);
end;
$$;

-- propose_kb_document (edit): an existing, unlocked, live work-scope file of
-- this work. template / 회차 files and account_template documents are refused.
-- Files inherit their folder's category (createFolder/createNode), so files in
-- user sub-folders are 인물..아이템 or custom (files under top-level user folders).
create function public.mcp_propose_kb_edit(p_work_id uuid, p_node_id uuid, p_content text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller record;
  v_content text;
  v_hash text;
  v_base text;
  v_existing record;
  v_row record;
begin
  select * into v_caller from public.mcp_proposal_caller();
  v_content := public.mcp_proposal_normalize(p_content, 50000);
  v_hash := public.mcp_proposal_sha256(v_content);

  select n.content into v_base
  from public.kb_nodes as n
  join public.works as w on w.id = n.work_id
  where n.id = p_node_id and n.work_id = p_work_id
    and n.owner_id = v_caller.out_user_id and w.owner_id = v_caller.out_user_id
    and n.scope = 'work' and n.node_type = 'file'
    and n.category in ('인물', '장소', '사건', '세력', '아이템', 'custom')
    and not n.is_locked
    and n.deleted_at is null and w.deleted_at is null;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_base := coalesce(v_base, '');
  if v_base = v_content then
    raise exception 'mcp_no_change' using errcode = 'P0001';
  end if;

  select p.id, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.node_id = p_node_id and p.kind = 'kb_edit' and p.status = 'pending'
    and p.source_client_id = v_caller.out_client_id and p.content_hash = v_hash
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
      'expires_at', v_existing.expires_at, 'superseded_id', null);
  end if;

  perform public.mcp_proposal_check_cap(v_caller.out_user_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, node_id, content, content_hash, base_content, base_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'kb_edit', p_node_id, v_content, v_hash,
     v_base, public.mcp_proposal_sha256(v_base),
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', null);
end;
$$;

-- propose_kb_document (create): category only; the writer picks the folder at
-- accept time (D-P14-03). Work scope only, never template / 회차 / custom.
create function public.mcp_propose_kb_create(p_work_id uuid, p_category text, p_name text, p_content text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller record;
  v_content text;
  v_hash text;
  v_name text;
  v_existing record;
  v_row record;
begin
  select * into v_caller from public.mcp_proposal_caller();
  v_content := public.mcp_proposal_normalize(p_content, 50000);
  v_hash := public.mcp_proposal_sha256(v_content);
  v_name := pg_catalog.btrim(coalesce(p_name, ''));
  if pg_catalog.length(v_name) < 1 or pg_catalog.length(v_name) > 100 or v_name ~ '[[:cntrl:]]' then
    raise exception 'mcp_invalid_name' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('인물', '장소', '사건', '세력', '아이템') then
    raise exception 'mcp_invalid_category' using errcode = '22023';
  end if;

  if not exists (select 1 from public.works as w
                 where w.id = p_work_id and w.owner_id = v_caller.out_user_id
                   and w.deleted_at is null) then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;

  select p.id, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.owner_id = v_caller.out_user_id and p.work_id = p_work_id
    and p.kind = 'kb_create' and p.status = 'pending'
    and p.proposed_category = p_category and p.proposed_name = v_name
    and p.source_client_id = v_caller.out_client_id and p.content_hash = v_hash
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
      'expires_at', v_existing.expires_at, 'superseded_id', null);
  end if;

  perform public.mcp_proposal_check_cap(v_caller.out_user_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, proposed_category, proposed_name, content, content_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'kb_create', p_category, v_name, v_content, v_hash,
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', null);
end;
$$;

revoke all on function public.mcp_propose_chapter_draft(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_edit(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_create(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.mcp_propose_chapter_draft(uuid, uuid, text) to authenticated;
grant execute on function public.mcp_propose_kb_edit(uuid, uuid, text) to authenticated;
grant execute on function public.mcp_propose_kb_create(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
