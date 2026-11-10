begin;

-- Phase 14 (14-10): merge of the 0041/0042 line with the desktop Phase 14 decisions.
-- 1) Several pending chapter drafts per chapter may coexist (desktop D-P14-02). A new draft no
--    longer supersedes the previous one; the DB dedupes pending drafts per (chapter, text).
--    Accepting one draft changes the chapter, so the writer sees the others against the latest
--    original (accept RPCs already compare the live original's hash, 0042: mcp_stale).
-- 2) Pending caps: 30 live pending proposals per work and 100 per writer (one place each).
-- 3) Proposal text normalization also strips control characters, BOM and bidi controls
--    (external AI input). TAB, LF and trailing whitespace are kept so the diff against the
--    original is not polluted.
-- Re-runnable: create or replace / if exists. CREATE OR REPLACE keeps owner and ACL; the
-- helpers stay unexecutable for every API role, the three RPCs stay bearer-only (authenticated).
-- Pending rows expire to status 'expired' (30 days, 0041/0042) and are never deleted; only the
-- undo snapshot is dropped after its window (0042).

-- 1) Pending-draft uniqueness: from one-per-chapter to one-per-(chapter, text).
drop index if exists public.mcp_proposals_one_pending_draft;
create unique index if not exists mcp_proposals_pending_draft_dedupe
  on public.mcp_proposals (chapter_id, content_hash)
  where kind = 'chapter_draft' and status = 'pending';

-- 2) Cap constants (single source) and the check.
create or replace function public.mcp_proposal_pending_cap_per_work() returns integer
language sql immutable parallel safe set search_path = '' as $$ select 30 $$;
create or replace function public.mcp_proposal_pending_cap_per_writer() returns integer
language sql immutable parallel safe set search_path = '' as $$ select 100 $$;
revoke all on function public.mcp_proposal_pending_cap_per_work() from public, anon, authenticated, service_role;
revoke all on function public.mcp_proposal_pending_cap_per_writer() from public, anon, authenticated, service_role;

create or replace function public.mcp_proposal_check_cap(p_user_id uuid, p_work_id uuid)
returns void
language plpgsql stable set search_path = '' as $$
begin
  if (select pg_catalog.count(*) from public.mcp_proposals as p
      where p.owner_id = p_user_id and p.status = 'pending'
        and p.expires_at > pg_catalog.now()) >= public.mcp_proposal_pending_cap_per_writer()
     or (select pg_catalog.count(*) from public.mcp_proposals as p
      where p.owner_id = p_user_id and p.work_id = p_work_id and p.status = 'pending'
        and p.expires_at > pg_catalog.now()) >= public.mcp_proposal_pending_cap_per_work() then
    raise exception 'mcp_cap_reached' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.mcp_proposal_check_cap(uuid, uuid) from public, anon, authenticated, service_role;

-- 3) Normalization: CRLF/CR -> LF, drop C0 controls except TAB/LF, DEL, C1 controls, BOM and
--    bidi controls (U+202A-202E, U+2066-2069); then the same length / blank checks as 0041.
--    The regex uses \uXXXX escapes (Postgres ARE), so the file holds no invisible characters.
create or replace function public.mcp_proposal_normalize(p_content text, p_max int)
returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_content text;
begin
  if p_content is null then
    raise exception 'mcp_invalid_content' using errcode = '22023';
  end if;
  v_content := pg_catalog.regexp_replace(
    pg_catalog.replace(pg_catalog.replace(p_content, E'\r\n', E'\n'), E'\r', E'\n'),
    '[\u0001-\u0008\u000B-\u001F\u007F-\u009F﻿‪-‮⁦-⁩]', '', 'g');
  if pg_catalog.length(v_content) < 1 or pg_catalog.length(v_content) > p_max
     or v_content ~ '^[[:space:]]*$' then
    raise exception 'mcp_invalid_content' using errcode = '22023';
  end if;
  return v_content;
end;
$$;
revoke all on function public.mcp_proposal_normalize(text, int) from public, anon, authenticated, service_role;

-- 4) save_draft: no supersede; identical pending text (any connection) returns the existing row.
create or replace function public.mcp_propose_chapter_draft(p_work_id uuid, p_chapter_id uuid, p_content text)
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

  select p.id, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.chapter_id = p_chapter_id and p.kind = 'chapter_draft' and p.status = 'pending'
    and p.content_hash = v_hash
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
      'expires_at', v_existing.expires_at, 'superseded_id', null);
  end if;

  perform public.mcp_proposal_check_cap(v_caller.out_user_id, p_work_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, chapter_id, content, content_hash, base_content, base_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'chapter_draft', p_chapter_id, v_content, v_hash,
     v_base, public.mcp_proposal_sha256(v_base),
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', null);
end;
$$;

-- 5) propose_kb_document (edit): unchanged except for the work-aware cap.
create or replace function public.mcp_propose_kb_edit(p_work_id uuid, p_node_id uuid, p_content text)
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

  perform public.mcp_proposal_check_cap(v_caller.out_user_id, p_work_id);

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

-- 6) propose_kb_document (create): unchanged except for the work-aware cap.
create or replace function public.mcp_propose_kb_create(p_work_id uuid, p_category text, p_name text, p_content text)
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

  perform public.mcp_proposal_check_cap(v_caller.out_user_id, p_work_id);

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

-- The old single-argument cap check has no caller left.
drop function if exists public.mcp_proposal_check_cap(uuid);

-- Restate the ACL (idempotent): bearer RPCs only for authenticated.
revoke all on function public.mcp_propose_chapter_draft(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_edit(uuid, uuid, text) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_create(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.mcp_propose_chapter_draft(uuid, uuid, text) to authenticated;
grant execute on function public.mcp_propose_kb_edit(uuid, uuid, text) to authenticated;
grant execute on function public.mcp_propose_kb_create(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
