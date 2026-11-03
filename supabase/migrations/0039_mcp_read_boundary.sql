begin;

-- D-17 Phase 13 boundary (approved correction, 2026-11-02).
-- 0038 restricted OAuth bearers (JWT has client_id) on 10 sensitive tables.
-- This migration closes EVERY permanent public table to OAuth bearers, then
-- re-opens exactly four tables (works, chapters, kb_nodes, work_ai_instructions)
-- for SELECT of the bearer's own rows while its MCP grant is live.
-- Browser sessions (no client_id) keep their existing policies unchanged.
-- SECURITY DEFINER RPCs are not covered by table RLS; section 4 (13-01b) closes
-- every one that authenticated may EXECUTE and OAuth does not need.
-- Re-runnable: functions use create or replace, policies are dropped first,
-- and the RPC guard injection (section 4) skips functions already guarded.

-- Side-effect free twin of mcp_authorize_call(): same grant conditions, no
-- last_used_at update, Boolean result. Any malformed claim is "not live".
create or replace function public.mcp_grant_is_live() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb := (select auth.jwt());
  v_user_id uuid;
  v_client_id uuid;
  v_session_id uuid;
begin
  if v_claims is null then
    return false;
  end if;
  begin
    v_user_id := nullif(v_claims ->> 'sub', '')::uuid;
    v_client_id := nullif(v_claims ->> 'client_id', '')::uuid;
    v_session_id := nullif(v_claims ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_user_id is null or v_client_id is null or v_session_id is null then
    return false;
  end if;

  return exists (
    select 1 from public.mcp_connections as c
    where c.user_id = v_user_id and c.oauth_client_id = v_client_id
      and c.revoked_at is null
      and exists (select 1 from public.profiles as p
                  where p.id = v_user_id and p.deleted_at is null)
      and exists (select 1 from auth.sessions as s
                  where s.id = v_session_id and s.user_id = v_user_id
                    and s.oauth_client_id = v_client_id)
      and exists (select 1 from auth.oauth_consents as oc
                  where oc.user_id = v_user_id and oc.client_id = v_client_id
                    and oc.revoked_at is null)
  );
end;
$$;

-- RLS policies run as the caller, so authenticated needs EXECUTE. Nobody else.
revoke all on function public.mcp_grant_is_live() from public, anon, service_role;
grant execute on function public.mcp_grant_is_live() to authenticated;

-- 1) Deny-by-default for OAuth on every permanent public table except the four
--    MCP read tables. Covers the 10 tables from 0038 (same policy, recreated)
--    and any table present at apply time. A table without RLS fails the
--    migration: a restrictive policy would be inert there.
do $$
declare
  v_table record;
  v_count int := 0;
begin
  for v_table in
    select c.relname, c.relrowsecurity
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relpersistence = 'p'
      and c.relname not in ('works', 'chapters', 'kb_nodes', 'work_ai_instructions')
    order by c.relname
  loop
    if not v_table.relrowsecurity then
      raise exception '0039 OAuth RLS: public.% has RLS disabled; classify it before applying', v_table.relname;
    end if;
    execute pg_catalog.format('drop policy if exists oauth_browser_only on public.%I', v_table.relname);
    execute pg_catalog.format($policy$
      create policy oauth_browser_only on public.%I
      as restrictive for all to authenticated
      using ((select auth.jwt() ->> 'client_id') is null)
      with check ((select auth.jwt() ->> 'client_id') is null)
    $policy$, v_table.relname);
    v_count := v_count + 1;
  end loop;
  raise notice '0039 OAuth RLS: browser-only policy on % public tables', v_count;
end;
$$;

-- 2) Four MCP read tables: OAuth may SELECT only its own rows while live, and
--    may never INSERT/UPDATE/DELETE. These intersect (RESTRICTIVE) with the
--    existing owner and public-reader policies, so other writers' public rows
--    are also hidden from OAuth bearers.
drop policy if exists mcp_oauth_owner_select on public.works;
drop policy if exists mcp_oauth_owner_select on public.kb_nodes;
drop policy if exists mcp_oauth_owner_select on public.chapters;
drop policy if exists mcp_oauth_owner_select on public.work_ai_instructions;

create policy mcp_oauth_owner_select on public.works
  as restrictive for select to authenticated
  using (
    (select auth.jwt() ->> 'client_id') is null
    or ((select public.mcp_grant_is_live()) and owner_id = (select auth.uid()))
  );

create policy mcp_oauth_owner_select on public.kb_nodes
  as restrictive for select to authenticated
  using (
    (select auth.jwt() ->> 'client_id') is null
    or ((select public.mcp_grant_is_live()) and owner_id = (select auth.uid()))
  );

create policy mcp_oauth_owner_select on public.chapters
  as restrictive for select to authenticated
  using (
    (select auth.jwt() ->> 'client_id') is null
    or (
      (select public.mcp_grant_is_live())
      and exists (select 1 from public.works as w
                  where w.id = chapters.work_id and w.owner_id = (select auth.uid()))
    )
  );

create policy mcp_oauth_owner_select on public.work_ai_instructions
  as restrictive for select to authenticated
  using (
    (select auth.jwt() ->> 'client_id') is null
    or (
      (select public.mcp_grant_is_live())
      and exists (select 1 from public.works as w
                  where w.id = work_ai_instructions.work_id and w.owner_id = (select auth.uid()))
    )
  );

do $$
declare
  v_table text;
begin
  foreach v_table in array array['works', 'chapters', 'kb_nodes', 'work_ai_instructions'] loop
    execute pg_catalog.format('drop policy if exists oauth_browser_only on public.%I', v_table);
    execute pg_catalog.format('drop policy if exists mcp_oauth_no_insert on public.%I', v_table);
    execute pg_catalog.format('drop policy if exists mcp_oauth_no_update on public.%I', v_table);
    execute pg_catalog.format('drop policy if exists mcp_oauth_no_delete on public.%I', v_table);
    execute pg_catalog.format($policy$
      create policy mcp_oauth_no_insert on public.%I
      as restrictive for insert to authenticated
      with check ((select auth.jwt() ->> 'client_id') is null)
    $policy$, v_table);
    execute pg_catalog.format($policy$
      create policy mcp_oauth_no_update on public.%I
      as restrictive for update to authenticated
      using ((select auth.jwt() ->> 'client_id') is null)
      with check ((select auth.jwt() ->> 'client_id') is null)
    $policy$, v_table);
    execute pg_catalog.format($policy$
      create policy mcp_oauth_no_delete on public.%I
      as restrictive for delete to authenticated
      using ((select auth.jwt() ->> 'client_id') is null)
    $policy$, v_table);
  end loop;
end;
$$;

-- 3) Owner-only chapter body for MCP tools (D-P13-03). Unlike
--    read_chapter_content() there is no public can_view branch: only a live
--    OAuth grant whose user owns the (non-deleted) work may read, regardless of
--    publication, price or blind state. Not owned / deleted / absent -> null.
create or replace function public.mcp_read_owned_chapter_content(p_chapter_id uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_content text;
begin
  if v_user_id is null or (select auth.jwt() ->> 'client_id') is null
     or not public.mcp_grant_is_live() then
    raise exception 'live MCP grant required' using errcode = '42501';
  end if;

  select c.content into v_content
  from public.chapters as c
  join public.works as w on w.id = c.work_id
  where c.id = p_chapter_id
    and w.owner_id = v_user_id
    and c.deleted_at is null
    and w.deleted_at is null;
  return v_content;
end;
$$;

revoke all on function public.mcp_read_owned_chapter_content(uuid) from public, anon, service_role;
grant execute on function public.mcp_read_owned_chapter_content(uuid) to authenticated;

-- 4) SECURITY DEFINER RPC bypass (13-01b). Table RLS does not apply inside a
--    SECURITY DEFINER body, so every definer RPC that authenticated may EXECUTE
--    is classified in 13-01b-SUMMARY.md:
--      guard : mcp_authorize_call, mcp_grant_is_live, mcp_read_owned_chapter_content
--              (live grant + owner checks inside the body)
--      keep  : mcp_connect, mcp_disconnect (already reject client_id),
--              world_work_reader_visible, world_work_public_meta_visible (public
--              visibility only, same answer as anon), handle_new_user (trigger only)
--      block : the 29 below. An OAuth bearer (JWT carries client_id) gets 42501;
--              browser sessions, anon and service_role keep the old behavior.
--    tests/mcp/read-boundary.database.test.ts fails on any unclassified RPC.

-- Raises 42501 for an OAuth bearer, otherwise true. Only definer RPCs (owner
-- postgres) call it, so no role needs EXECUTE.
create or replace function public.mcp_reject_oauth_caller() returns boolean
language plpgsql stable set search_path = '' as $$
begin
  if (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'browser session required' using errcode = '42501';
  end if;
  return true;
end;
$$;

revoke all on function public.mcp_reject_oauth_caller() from public, anon, authenticated, service_role;

-- 4a) SQL-language RPCs, rewritten from their final definitions (0036 / 0009 /
--     0008) with only the guard added. A Var-free stable qual is a one-time
--     filter, so the guard runs before any row is read, even for unknown ids.

-- 0009 + 0036 read_chapter_content: public can_view branch and owner branch kept
-- for browsers and anon; OAuth must use mcp_read_owned_chapter_content.
create or replace function public.read_chapter_content(p_chapter_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.content from chapters c join works w on w.id = c.work_id
  where public.mcp_reject_oauth_caller()
    and c.id = p_chapter_id and c.deleted_at is null and w.deleted_at is null
    and (can_view(c.work_id, c.id) or (
      auth.uid() is not null and w.owner_id = auth.uid() and exists (
        select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null
      )
    ));
$$;

-- 0036 can_view: exposes the caller's entitlements (chapter_entitled). Not used
-- by any RLS policy; called only by other RPCs.
create or replace function public.can_view(p_work_id uuid, p_chapter_id uuid default null) returns boolean
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
  )
  where public.mcp_reject_oauth_caller();
$$;

-- 0036 list_chapter_access: per-chapter entitlement list.
create or replace function public.list_chapter_access(p_work_id uuid)
returns table(chapter_id uuid, allowed boolean, entitled boolean, blinded boolean, blind_reason text)
language sql stable security definer set search_path = public as $$
  select c.id,
    can_view(c.work_id, c.id),
    chapter_entitled(c.work_id, c.id),
    w.admin_blinded or c.admin_blinded,
    case when w.admin_blinded then w.admin_blind_reason when c.admin_blinded then c.admin_blind_reason end
  from chapters c join works w on w.id = c.work_id
  where public.mcp_reject_oauth_caller()
    and c.work_id = p_work_id and c.is_published and c.deleted_at is null and w.deleted_at is null
    and (world_work_public_meta_visible(w.id)
      or (auth.uid() is not null and w.owner_id = auth.uid()
        and exists (select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null)));
$$;

-- 0036 get_chapter_access_state: entitlement and blind state for one chapter.
create or replace function public.get_chapter_access_state(p_work_id uuid, p_chapter_id uuid) returns jsonb
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
  ), jsonb_build_object('state', 'unavailable', 'blind_scope', null, 'blind_reason', null, 'entitled', false))
  where public.mcp_reject_oauth_caller();
$$;

-- 0036 get_world_tree_metric_baseline: aggregate over every reader-visible work.
create or replace function public.get_world_tree_metric_baseline() returns jsonb
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
    'authorViewsExcludedSince', world_tree_author_view_cutoff())
  where public.mcp_reject_oauth_caller();
$$;

-- 0008 current_user_can_write: used only by the RESTRICTIVE *_write_access_*
-- policies. It answers false (never raises) for OAuth so those policies keep
-- failing closed instead of erroring.
create or replace function public.current_user_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (select auth.jwt() ->> 'client_id') is null
    and user_can_write(auth.uid());
$$;

-- 4b) plpgsql RPCs: the guard becomes the first statement of the top-level
--     block of the current (final) definition, read from the catalog, so long
--     bodies (save_world_timeline is 300 lines) are not hand-copied. CREATE OR
--     REPLACE keeps signature, owner, ACL and every other attribute. Already
--     guarded functions are skipped, so the migration can be re-applied.
do $$
declare
  v_sig text;
  v_oid oid;
  v_lang text;
  v_secdef boolean;
  v_def text;
  v_new text;
  v_patched int := 0;
begin
  foreach v_sig in array array[
    'acknowledge_publication_notification(uuid)',
    'acknowledge_warning(uuid)',
    'begin_world_branch(uuid,text,uuid,uuid)',
    'complete_chapter(uuid,uuid,uuid)',
    'confirm_world_branch(uuid,text,uuid)',
    'create_chapter_atomic(uuid,uuid,text,uuid)',
    'create_purchase_order(uuid[],uuid)',
    'ensure_world_tree(uuid)',
    'get_world_branch_diff(uuid)',
    'get_world_branch_eligibility(uuid)',
    'get_world_tree(uuid,boolean)',
    'get_write_access(uuid)',
    'increment_chapter_view(uuid)',
    'mark_branch_notice_read(uuid)',
    'open_chapter_reading(uuid,uuid,uuid)',
    'pay_purchase_order(uuid)',
    'save_chapter_reading(uuid,uuid,uuid,bigint,numeric,bigint,integer)',
    'save_world_timeline(uuid,jsonb,jsonb)',
    'soft_delete_kb_node(uuid,uuid)',
    'soft_delete_world_branch(uuid)',
    'toggle_work_bookmarks(uuid)',
    'toggle_work_likes(uuid)',
    'toggle_work_subscriptions(uuid)'
  ] loop
    v_oid := pg_catalog.to_regprocedure('public.' || v_sig);
    if v_oid is null then
      raise exception '0039 RPC guard: public.% does not exist', v_sig;
    end if;
    select l.lanname, p.prosecdef into v_lang, v_secdef
    from pg_catalog.pg_proc as p join pg_catalog.pg_language as l on l.oid = p.prolang
    where p.oid = v_oid;
    if v_lang <> 'plpgsql' or not v_secdef then
      raise exception '0039 RPC guard: public.% is not a plpgsql SECURITY DEFINER function', v_sig;
    end if;
    if pg_catalog.strpos((select p.prosrc from pg_catalog.pg_proc as p where p.oid = v_oid),
                         'mcp_reject_oauth_caller') > 0 then
      continue;
    end if;

    v_def := pg_catalog.pg_get_functiondef(v_oid);
    -- First line that is only "begin" = the top-level block (no declare
    -- section in these bodies has such a line). 'n' = line-anchored ^ and $.
    -- Some bodies were created from CRLF files (0007), so a trailing CR is
    -- allowed and kept at the end of the injected line.
    v_new := pg_catalog.regexp_replace(v_def, E'^([[:blank:]]*)begin([[:blank:]\r]*)$',
      E'\\1begin\n\\1  perform public.mcp_reject_oauth_caller(); -- 0039 D-17: OAuth bearer -> 42501\\2',
      'n');
    if v_new = v_def then
      raise exception '0039 RPC guard: no top-level begin line in public.%', v_sig;
    end if;
    execute v_new;
    v_patched := v_patched + 1;
  end loop;
  raise notice '0039 RPC guard: injected into % plpgsql RPCs', v_patched;
end;
$$;

notify pgrst, 'reload schema';
commit;
