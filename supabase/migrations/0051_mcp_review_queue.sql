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

-- 4. MCP proposal RPCs: added by 14-03 Task 2.

notify pgrst, 'reload schema';
commit;
