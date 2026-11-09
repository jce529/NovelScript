begin;

-- Phase 14 (14-03): MCP write tools store PROPOSALS only (D-P14-16).
-- An OAuth bearer reaches exactly three write paths, all SECURITY DEFINER RPCs
-- below, and each of them can only INSERT a pending row into mcp_drafts or
-- mcp_kb_proposals. Nothing here updates chapters or kb_nodes (D-P14-01/06).
-- The two tables are browser-owner SELECT only: no INSERT/UPDATE/DELETE grant
-- or policy for any API role, plus the oauth_browser_only RESTRICTIVE policy
-- that 0039 put on every table that existed then (its loop does not cover
-- tables created later, so it is created here explicitly).
-- Decisions (14-RESEARCH RESOLVED): pending cap 30 per work (drafts + KB
-- proposals together), draft body 30,000 chars, KB body 50,000 chars, no
-- folder argument for new documents (A6), edit target = work-scope,
-- non-template, unlocked file (A7), dedupe on pending rows only (A8).

-- ---------------------------------------------------------------------------
-- 1. Shared helpers (not SECURITY DEFINER, no API role may EXECUTE them)
-- ---------------------------------------------------------------------------

-- Single source of the per-work pending cap (D-P14-13). 14-04 exposes it to
-- the studio through studio_pending_counts().
create or replace function public.mcp_review_pending_cap() returns integer
language sql immutable parallel safe set search_path = '' as $$
  select 30
$$;

-- Plain-text proposal normalization, the SQL twin of lib/review/text.ts
-- normalizeProposalText (14-06; 14-12 compares both on shared vectors).
-- Order matters:
--   1) CRLF and lone CR -> LF
--   2) remove C0 controls except TAB and LF (U+0001-0008, U+000B-001F),
--      DEL and C1 controls (U+007F-009F), BOM (U+FEFF) and bidi controls
--      (U+202A-202E, U+2066-2069). NUL cannot exist in a Postgres text value;
--      lone surrogates cannot either (TS replaces them with U+FFFD first).
--   3) runs of more than 3 LF (4 or more) -> exactly 2 LF
--   4) trailing SPACE / TAB / LF at the very end of the text are removed
-- HTML is NOT stripped: every surface renders it as React text (D-P14-04).
create or replace function public.mcp_normalize_proposal_text(p_text text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.replace(pg_catalog.replace(p_text, E'\r\n', E'\n'), E'\r', E'\n'),
        '[\u0001-\u0008\u000B-\u001F\u007F-\u009F﻿‪-‮⁦-⁩]', '', 'g'),
      E'\n{4,}', E'\n\n', 'g'),
    E'[ \t\n]+$', '')
$$;

-- Single-line label (DCR client name, redirect host, document name): the
-- normalized text with every TAB/LF folded to one space, trimmed.
create or replace function public.mcp_normalize_label(p_text text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    public.mcp_normalize_proposal_text(p_text), E'[\t\n]+', ' ', 'g'))
$$;

revoke all on function public.mcp_review_pending_cap() from public, anon, authenticated, service_role;
revoke all on function public.mcp_normalize_proposal_text(text) from public, anon, authenticated, service_role;
revoke all on function public.mcp_normalize_label(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- Proposed chapter drafts. Several pending drafts per chapter are allowed
-- (D-P14-02). Accepting = importing into the writer's editor (14-04/14-11);
-- the server never writes chapters.content. Rows are kept forever (D-P14-14).
create table public.mcp_drafts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  work_id uuid not null references public.works(id),
  chapter_id uuid not null references public.chapters(id),
  -- Origin snapshot from mcp_connections (never from tool arguments). No FK:
  -- the history stays when the client or connection is gone.
  oauth_client_id uuid not null,
  client_name text not null check (pg_catalog.char_length(pg_catalog.btrim(client_name)) between 1 and 200),
  redirect_host text not null check (pg_catalog.char_length(pg_catalog.btrim(redirect_host)) between 1 and 253),
  body text not null check (pg_catalog.char_length(body) between 1 and 30000),
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  last_imported_at timestamptz,
  import_count integer not null default 0 check (import_count >= 0),
  constraint mcp_drafts_decided_shape check ((status = 'pending') = (decided_at is null))
);

create index mcp_drafts_owner_pending_idx on public.mcp_drafts (owner_id, created_at desc, id) where status = 'pending';
create index mcp_drafts_owner_done_idx on public.mcp_drafts (owner_id, decided_at desc, id) where status <> 'pending';
create index mcp_drafts_chapter_pending_idx on public.mcp_drafts (chapter_id) where status = 'pending';
create index mcp_drafts_work_pending_idx on public.mcp_drafts (work_id) where status = 'pending';
create unique index mcp_drafts_pending_dedupe on public.mcp_drafts (chapter_id, body_hash) where status = 'pending';

-- Proposed setting documents: 'create' (new document, location chosen by the
-- writer on accept) or 'edit' (full replacement text for one existing
-- document; accepted hunk by hunk against the LATEST original, D-P14-07/08).
create table public.mcp_kb_proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  work_id uuid not null references public.works(id),
  kind text not null check (kind in ('create', 'edit')),
  target_node_id uuid references public.kb_nodes(id),
  category text check (category in ('인물', '장소', '사건', '세력', '아이템')),
  -- create: proposed title (1..80, enforced by the RPC) / edit: document name snapshot.
  name text not null check (pg_catalog.char_length(pg_catalog.btrim(name)) between 1 and 200),
  body text not null check (pg_catalog.char_length(body) between 1 and 50000),
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  -- edit only: original at proposal time (history diff) and its sha256 (D-P14-08 base version).
  base_content text,
  base_hash text check (base_hash ~ '^[0-9a-f]{64}$'),
  oauth_client_id uuid not null,
  client_name text not null check (pg_catalog.char_length(pg_catalog.btrim(client_name)) between 1 and 200),
  redirect_host text not null check (pg_catalog.char_length(pg_catalog.btrim(redirect_host)) between 1 and 253),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  applied_hunks integer check (applied_hunks is null or applied_hunks >= 0),
  total_hunks integer check (total_hunks is null or total_hunks >= 0),
  result_node_id uuid references public.kb_nodes(id),
  constraint mcp_kb_proposals_decided_shape check ((status = 'pending') = (decided_at is null)),
  constraint mcp_kb_proposals_kind_shape check (
    (kind = 'create' and target_node_id is null and category is not null
      and base_hash is null and base_content is null)
    or (kind = 'edit' and target_node_id is not null and category is null
      and base_hash is not null and base_content is not null)
  )
);

create index mcp_kb_proposals_owner_pending_idx on public.mcp_kb_proposals (owner_id, created_at desc, id) where status = 'pending';
create index mcp_kb_proposals_owner_done_idx on public.mcp_kb_proposals (owner_id, decided_at desc, id) where status <> 'pending';
create index mcp_kb_proposals_work_pending_idx on public.mcp_kb_proposals (work_id) where status = 'pending';
create index mcp_kb_proposals_target_pending_idx on public.mcp_kb_proposals (target_node_id) where status = 'pending' and kind = 'edit';
create unique index mcp_kb_edit_dedupe on public.mcp_kb_proposals (target_node_id, body_hash)
  where status = 'pending' and kind = 'edit';
create unique index mcp_kb_create_dedupe on public.mcp_kb_proposals (work_id, category, name, body_hash)
  where status = 'pending' and kind = 'create';

-- ---------------------------------------------------------------------------
-- 3. RLS and privileges (0037/0038/0039 boundary, D-P14-16)
-- ---------------------------------------------------------------------------
alter table public.mcp_drafts enable row level security;
alter table public.mcp_kb_proposals enable row level security;

-- Owner SELECT only. No write-access condition: suspended writers can still
-- read what was queued (D-P14-15). No INSERT/UPDATE/DELETE policy at all.
create policy mcp_drafts_select_own on public.mcp_drafts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy mcp_kb_proposals_select_own on public.mcp_kb_proposals
  for select to authenticated using (owner_id = (select auth.uid()));

-- OAuth bearers (JWT carries client_id) may not use REST on these tables.
create policy oauth_browser_only on public.mcp_drafts
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
create policy oauth_browser_only on public.mcp_kb_proposals
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);

revoke all on public.mcp_drafts from public, anon, authenticated;
revoke all on public.mcp_kb_proposals from public, anon, authenticated;
grant select on public.mcp_drafts to authenticated;
grant select on public.mcp_kb_proposals to authenticated;

-- ---------------------------------------------------------------------------
-- 4. MCP proposal RPCs (catalog class: guard)
-- Common steps, in this order:
--   a) OAuth only + live grant: mcp_grant_is_live()            -> 42501
--   b) app grant scope propose_draft from mcp_connections       -> 42501
--   c) suspended / withdrawn: user_can_write(auth.uid())        -> mcp_write_denied
--   d) normalize + size check                                   -> mcp_invalid_input
--   e) ownership re-check of every untrusted id (D-P14-17)      -> mcp_not_found
--      (never says whether the row exists)
--   f) per-work advisory lock -> pending dedupe -> cap -> insert -> mcp_pending_limit
-- Retrying an identical pending proposal answers duplicate=true even at cap.
-- ---------------------------------------------------------------------------

create or replace function public.mcp_save_draft(p_work_id uuid, p_chapter_id uuid, p_body text)
returns table(out_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_client uuid;
  v_conn public.mcp_connections%rowtype;
  v_body text;
  v_hash text;
  v_id uuid;
begin
  if v_user is null or (select auth.jwt() ->> 'client_id') is null or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;
  v_client := ((select auth.jwt()) ->> 'client_id')::uuid;
  select c.* into v_conn from public.mcp_connections as c
   where c.user_id = v_user and c.oauth_client_id = v_client and c.revoked_at is null;
  if not found or not ('propose_draft' = any(v_conn.scopes)) then
    raise exception 'mcp_scope' using errcode = '42501';
  end if;
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_write_denied';
  end if;

  v_body := public.mcp_normalize_proposal_text(p_body);
  if v_body is null or pg_catalog.btrim(v_body, E' \t\n') = ''
     or pg_catalog.char_length(v_body) > 30000 then
    raise exception 'mcp_invalid_input';
  end if;

  if p_work_id is null or p_chapter_id is null or not exists (
    select 1 from public.chapters as ch join public.works as w on w.id = ch.work_id
     where ch.id = p_chapter_id and ch.work_id = p_work_id and w.owner_id = v_user
       and ch.deleted_at is null and w.deleted_at is null
  ) then
    raise exception 'mcp_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp_review:' || p_work_id::text, 0));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_body, 'UTF8')), 'hex');
  select d.id into v_id from public.mcp_drafts as d
   where d.chapter_id = p_chapter_id and d.body_hash = v_hash and d.status = 'pending';
  if found then
    return query select v_id, true;
    return;
  end if;
  if (select pg_catalog.count(*) from public.mcp_drafts as d where d.work_id = p_work_id and d.status = 'pending')
   + (select pg_catalog.count(*) from public.mcp_kb_proposals as k where k.work_id = p_work_id and k.status = 'pending')
     >= public.mcp_review_pending_cap() then
    raise exception 'mcp_pending_limit';
  end if;

  insert into public.mcp_drafts
    (owner_id, work_id, chapter_id, oauth_client_id, client_name, redirect_host, body, body_hash)
  values (v_user, p_work_id, p_chapter_id, v_client,
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.client_name), ''), 'unknown'), 200),
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.redirect_host), ''), 'unknown'), 253),
    v_body, v_hash)
  returning id into v_id;
  return query select v_id, false;
end;
$$;

create or replace function public.mcp_propose_kb_create(
  p_work_id uuid, p_category text, p_name text, p_body text
) returns table(out_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_client uuid;
  v_conn public.mcp_connections%rowtype;
  v_name text;
  v_body text;
  v_hash text;
  v_id uuid;
begin
  if v_user is null or (select auth.jwt() ->> 'client_id') is null or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;
  v_client := ((select auth.jwt()) ->> 'client_id')::uuid;
  select c.* into v_conn from public.mcp_connections as c
   where c.user_id = v_user and c.oauth_client_id = v_client and c.revoked_at is null;
  if not found or not ('propose_draft' = any(v_conn.scopes)) then
    raise exception 'mcp_scope' using errcode = '42501';
  end if;
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_write_denied';
  end if;

  -- Only the five user categories: never 'template' (locked templates) and
  -- never chapter folders or custom roots. No folder argument (A6).
  if p_category is null or p_category not in ('인물', '장소', '사건', '세력', '아이템') then
    raise exception 'mcp_invalid_input';
  end if;
  v_name := public.mcp_normalize_label(p_name);
  if v_name is null or pg_catalog.char_length(v_name) not between 1 and 80
     or pg_catalog.strpos(v_name, '/') > 0 then
    raise exception 'mcp_invalid_input';
  end if;
  v_body := public.mcp_normalize_proposal_text(p_body);
  if v_body is null or pg_catalog.btrim(v_body, E' \t\n') = ''
     or pg_catalog.char_length(v_body) > 50000 then
    raise exception 'mcp_invalid_input';
  end if;

  if p_work_id is null or not exists (
    select 1 from public.works as w
     where w.id = p_work_id and w.owner_id = v_user and w.deleted_at is null
  ) then
    raise exception 'mcp_not_found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp_review:' || p_work_id::text, 0));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_body, 'UTF8')), 'hex');
  select k.id into v_id from public.mcp_kb_proposals as k
   where k.work_id = p_work_id and k.kind = 'create' and k.category = p_category
     and k.name = v_name and k.body_hash = v_hash and k.status = 'pending';
  if found then
    return query select v_id, true;
    return;
  end if;
  if (select pg_catalog.count(*) from public.mcp_drafts as d where d.work_id = p_work_id and d.status = 'pending')
   + (select pg_catalog.count(*) from public.mcp_kb_proposals as k where k.work_id = p_work_id and k.status = 'pending')
     >= public.mcp_review_pending_cap() then
    raise exception 'mcp_pending_limit';
  end if;

  insert into public.mcp_kb_proposals
    (owner_id, work_id, kind, target_node_id, category, name, body, body_hash,
     base_content, base_hash, oauth_client_id, client_name, redirect_host)
  values (v_user, p_work_id, 'create', null, p_category, v_name, v_body, v_hash, null, null, v_client,
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.client_name), ''), 'unknown'), 200),
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.redirect_host), ''), 'unknown'), 253))
  returning id into v_id;
  return query select v_id, false;
end;
$$;

create or replace function public.mcp_propose_kb_edit(p_work_id uuid, p_node_id uuid, p_body text)
returns table(out_id uuid, out_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_client uuid;
  v_conn public.mcp_connections%rowtype;
  v_node_name text;
  v_base text;
  v_body text;
  v_hash text;
  v_id uuid;
begin
  if v_user is null or (select auth.jwt() ->> 'client_id') is null or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;
  v_client := ((select auth.jwt()) ->> 'client_id')::uuid;
  select c.* into v_conn from public.mcp_connections as c
   where c.user_id = v_user and c.oauth_client_id = v_client and c.revoked_at is null;
  if not found or not ('propose_draft' = any(v_conn.scopes)) then
    raise exception 'mcp_scope' using errcode = '42501';
  end if;
  if not public.user_can_write(auth.uid()) then
    raise exception 'mcp_write_denied';
  end if;

  v_body := public.mcp_normalize_proposal_text(p_body);
  if v_body is null or pg_catalog.btrim(v_body, E' \t\n') = ''
     or pg_catalog.char_length(v_body) > 50000 then
    raise exception 'mcp_invalid_input';
  end if;

  -- Target (A7): the caller's own, live, unlocked, non-template FILE in this
  -- work's scope. Locked templates, account templates, folders, other works
  -- and other writers' documents are all indistinguishable "not found" (D-P14-09).
  select n.name, coalesce(n.content, '') into v_node_name, v_base
    from public.kb_nodes as n join public.works as w on w.id = n.work_id
   where n.id = p_node_id and n.work_id = p_work_id and n.owner_id = v_user and w.owner_id = v_user
     and n.scope = 'work' and n.node_type = 'file' and n.is_locked = false and n.category <> 'template'
     and n.deleted_at is null and w.deleted_at is null;
  if not found or p_work_id is null then
    raise exception 'mcp_not_found';
  end if;
  if pg_catalog.char_length(v_base) > 50000 then
    raise exception 'mcp_too_large';
  end if;
  if v_body = v_base then
    raise exception 'mcp_no_change';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mcp_review:' || p_work_id::text, 0));
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_body, 'UTF8')), 'hex');
  select k.id into v_id from public.mcp_kb_proposals as k
   where k.target_node_id = p_node_id and k.kind = 'edit' and k.body_hash = v_hash and k.status = 'pending';
  if found then
    return query select v_id, true;
    return;
  end if;
  if (select pg_catalog.count(*) from public.mcp_drafts as d where d.work_id = p_work_id and d.status = 'pending')
   + (select pg_catalog.count(*) from public.mcp_kb_proposals as k where k.work_id = p_work_id and k.status = 'pending')
     >= public.mcp_review_pending_cap() then
    raise exception 'mcp_pending_limit';
  end if;

  insert into public.mcp_kb_proposals
    (owner_id, work_id, kind, target_node_id, category, name, body, body_hash,
     base_content, base_hash, oauth_client_id, client_name, redirect_host)
  values (v_user, p_work_id, 'edit', p_node_id, null,
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_node_name), ''), 'untitled'), 200),
    v_body, v_hash,
    v_base, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_base, 'UTF8')), 'hex'),
    v_client,
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.client_name), ''), 'unknown'), 200),
    pg_catalog.left(coalesce(nullif(public.mcp_normalize_label(v_conn.redirect_host), ''), 'unknown'), 253))
  returning id into v_id;
  return query select v_id, false;
end;
$$;

revoke all on function public.mcp_save_draft(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_create(uuid, text, text, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_edit(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.mcp_save_draft(uuid, uuid, text) to authenticated;
grant execute on function public.mcp_propose_kb_create(uuid, text, text, text) to authenticated;
grant execute on function public.mcp_propose_kb_edit(uuid, uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
