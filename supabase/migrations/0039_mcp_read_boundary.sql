begin;

-- D-17 Phase 13 boundary (approved correction, 2026-11-02).
-- 0038 restricted OAuth bearers (JWT has client_id) on 10 sensitive tables.
-- This migration closes EVERY permanent public table to OAuth bearers, then
-- re-opens exactly four tables (works, chapters, kb_nodes, work_ai_instructions)
-- for SELECT of the bearer's own rows while its MCP grant is live.
-- Browser sessions (no client_id) keep their existing policies unchanged.
-- SECURITY DEFINER RPCs are not covered by table RLS; 13-01b audits them.

-- Side-effect free twin of mcp_authorize_call(): same grant conditions, no
-- last_used_at update, Boolean result. Any malformed claim is "not live".
create function public.mcp_grant_is_live() returns boolean
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
create function public.mcp_read_owned_chapter_content(p_chapter_id uuid)
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

notify pgrst, 'reload schema';
commit;
