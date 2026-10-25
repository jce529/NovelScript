begin;

-- The application grant is the source of truth for every MCP call. OAuth/OIDC
-- scopes issued by Supabase are separate from these two application scopes.
create table public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  oauth_client_id uuid not null,
  client_name text not null check (length(btrim(client_name)) between 1 and 200),
  redirect_host text not null check (length(btrim(redirect_host)) between 1 and 253),
  scopes text[] not null check (
    cardinality(scopes) = 2
    and scopes @> array['read', 'propose_draft']::text[]
    and scopes <@ array['read', 'propose_draft']::text[]
  ),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, oauth_client_id)
);

create index mcp_connections_active_identity_idx
  on public.mcp_connections (user_id, client_name, redirect_host)
  where revoked_at is null;

alter table public.mcp_connections enable row level security;
create policy mcp_connections_select_own on public.mcp_connections
  for select to authenticated using (user_id = (select auth.uid()));
-- Browsers may list their own connections; an OAuth bearer may not use REST.
create policy mcp_connections_browser_only on public.mcp_connections
  as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'client_id') is null)
  with check ((select auth.jwt() ->> 'client_id') is null);
revoke all on public.mcp_connections from public, anon, authenticated;
grant select on public.mcp_connections to authenticated;

-- Called only after the consent Server Action validates the DCR client and
-- redirect host. Its returned IDs must each be passed to auth.oauth.revokeGrant
-- by that action; SQL cannot call the Auth API.
create function public.mcp_connect(
  p_client_id uuid, p_client_name text, p_redirect_host text, p_scopes text[]
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_revoked uuid[];
begin
  if v_user_id is null or (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'browser authentication required' using errcode = '42501';
  end if;
  if v_session_id is null or not exists (
    select 1 from auth.sessions as s where s.id = v_session_id
      and s.user_id = v_user_id and s.oauth_client_id is null
  ) then
    raise exception 'active browser session required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles as p
                 where p.id = v_user_id and p.role = 'writer' and p.deleted_at is null) then
    raise exception 'active writer required' using errcode = '42501';
  end if;
  if p_client_id is null or p_client_name is null or length(pg_catalog.btrim(p_client_name)) not between 1 and 200
    or p_redirect_host is null or length(pg_catalog.btrim(p_redirect_host)) not between 1 and 253
    or p_scopes is null or pg_catalog.cardinality(p_scopes) <> 2
    or not (p_scopes @> array['read', 'propose_draft']::text[]
            and p_scopes <@ array['read', 'propose_draft']::text[]) then
    raise exception 'invalid connection' using errcode = '22023';
  end if;

  -- Serialize two simultaneous approvals for the same writer/name/host.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_name || ':' || p_redirect_host, 0)
  );
  with revoked as (
    update public.mcp_connections as c set revoked_at = pg_catalog.now()
    where c.user_id = v_user_id and c.client_name = p_client_name
      and c.redirect_host = p_redirect_host and c.oauth_client_id <> p_client_id
      and c.revoked_at is null
    returning c.oauth_client_id
  )
  select coalesce(pg_catalog.array_agg(r.oauth_client_id), array[]::uuid[])
    into v_revoked from revoked as r;

  insert into public.mcp_connections as c
    (user_id, oauth_client_id, client_name, redirect_host, scopes)
  values (v_user_id, p_client_id, p_client_name, p_redirect_host, p_scopes)
  on conflict (user_id, oauth_client_id) do update
    set client_name = excluded.client_name,
        redirect_host = excluded.redirect_host,
        scopes = excluded.scopes,
        connected_at = pg_catalog.now(),
        last_used_at = null,
        revoked_at = null;
  return v_revoked;
end;
$$;

create function public.mcp_disconnect(p_client_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_id uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if v_user_id is null or (select auth.jwt() ->> 'client_id') is not null then
    raise exception 'browser authentication required' using errcode = '42501';
  end if;
  if v_session_id is null or not exists (
    select 1 from auth.sessions as s where s.id = v_session_id
      and s.user_id = v_user_id and s.oauth_client_id is null
  ) then
    raise exception 'active browser session required' using errcode = '42501';
  end if;
  update public.mcp_connections as c set revoked_at = pg_catalog.now()
  where c.user_id = v_user_id and c.oauth_client_id = p_client_id
    and c.revoked_at is null;
end;
$$;

-- No user/client/session arguments: all three identities come from the signed
-- JWT. Empty result and errors are both denial to the MCP route (fail closed).
create function public.mcp_authorize_call()
returns table(out_user_id uuid, out_scopes text[])
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := nullif((select auth.jwt()) ->> 'sub', '')::uuid;
  v_client_id uuid := nullif((select auth.jwt()) ->> 'client_id', '')::uuid;
  v_session_id uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  v_connection public.mcp_connections%rowtype;
begin
  if v_user_id is null or v_client_id is null or v_session_id is null then
    return;
  end if;

  select c.* into v_connection from public.mcp_connections as c
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
  for update of c;
  if not found then
    return;
  end if;

  update public.mcp_connections as c set last_used_at = pg_catalog.now()
  where c.id = v_connection.id and c.revoked_at is null
    and (c.last_used_at is null
      or c.last_used_at < pg_catalog.now() - interval '60 seconds');
  return query select v_connection.user_id, v_connection.scopes;
end;
$$;

revoke all on function public.mcp_connect(uuid, text, text, text[]) from public, anon;
revoke all on function public.mcp_disconnect(uuid) from public, anon;
revoke all on function public.mcp_authorize_call() from public, anon;
grant execute on function public.mcp_connect(uuid, text, text, text[]) to authenticated;
grant execute on function public.mcp_disconnect(uuid) to authenticated;
grant execute on function public.mcp_authorize_call() to authenticated;

notify pgrst, 'reload schema';
commit;
