begin;

-- BYOK secrets stay in Supabase Vault; this table contains only identifiers and metadata.
-- The Vault probe was UNREACHABLE. Function signatures, deletion access, and function
-- ownership below are [ASSUMED] from the documented Supabase Vault contract.
create table if not exists public.byok_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  secret_id uuid not null,
  masked_hint text not null check (char_length(masked_hint) = 4),
  status text not null default 'connected' check (status in ('connected', 'failed')),
  model_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (owner_id, provider)
);

alter table public.byok_keys enable row level security;
drop policy if exists byok_keys_select_own on public.byok_keys;
create policy byok_keys_select_own on public.byok_keys for select
  using (auth.uid() = owner_id);
revoke all on public.byok_keys from public, anon, authenticated;
grant select (id, owner_id, provider, masked_hint, status, model_ids, created_at, verified_at)
  on public.byok_keys to authenticated;

create table if not exists public.byok_validation_log (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists byok_validation_log_owner_created_idx
  on public.byok_validation_log(owner_id, created_at);
alter table public.byok_validation_log enable row level security;
revoke all on public.byok_validation_log from public, anon, authenticated;

alter table public.profiles
  add column if not exists default_key_source text not null default 'service'
  check (default_key_source in ('service', 'byok'));
grant update (default_provider, default_model, default_key_source)
  on public.profiles to authenticated;

-- [ASSUMED] Vault 0.3.1 create_secret signature from the UNREACHABLE probe report.
create or replace function public.register_byok_key(
  p_owner uuid, p_provider text, p_plaintext text, p_hint text, p_models text[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_secret_id uuid;
  v_id uuid;
begin
  v_secret_id := vault.create_secret(
    p_plaintext, 'byok:' || p_owner::text || ':' || p_provider, 'BYOK provider key', null
  );
  insert into public.byok_keys(owner_id, provider, secret_id, masked_hint, model_ids)
    values (p_owner, p_provider, v_secret_id, p_hint, coalesce(p_models, '{}'))
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.set_byok_status(
  p_owner uuid, p_provider text, p_status text, p_models text[]
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.byok_keys
    where owner_id = p_owner and provider = p_provider for update;
  if not found then raise exception 'byok_key_not_found'; end if;
  update public.byok_keys
    set status = p_status, model_ids = coalesce(p_models, '{}'), verified_at = now()
    where owner_id = p_owner and provider = p_provider;
end;
$$;

create or replace function public.get_byok_secret(
  p_owner uuid, p_provider text, p_include_failed boolean default false
) returns text
language sql security definer set search_path = '' as $$
  select ds.decrypted_secret
  from public.byok_keys k
  join vault.decrypted_secrets ds on ds.id = k.secret_id
  where k.owner_id = p_owner and k.provider = p_provider
    and (k.status = 'connected' or coalesce(p_include_failed, false))
  limit 1
$$;

-- [ASSUMED] UNREACHABLE probe: privileged definer owner can delete vault.secrets by id.
create or replace function public.delete_byok_key(p_owner uuid, p_provider text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_secret_id uuid;
  v_replaced boolean := false;
begin
  select secret_id into v_secret_id from public.byok_keys
    where owner_id = p_owner and provider = p_provider for update;
  if not found then raise exception 'byok_key_not_found'; end if;

  update public.profiles
    set default_key_source = 'service'
    where id = p_owner and default_key_source = 'byok' and default_provider = p_provider;
  v_replaced := found;

  delete from vault.secrets where id = v_secret_id;
  delete from public.byok_keys where owner_id = p_owner and provider = p_provider;
  return v_replaced;
end;
$$;

create or replace function public.claim_byok_validation(
  p_owner uuid, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_window interval;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  -- Serialize claims per owner so concurrent calls cannot exceed the configured limit.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 0));
  v_window := make_interval(secs => p_window_seconds);
  delete from public.byok_validation_log
    where owner_id = p_owner and created_at <= v_now - v_window;
  select count(*) into v_count from public.byok_validation_log
    where owner_id = p_owner and created_at > v_now - v_window;
  if v_count >= p_limit then return false; end if;
  insert into public.byok_validation_log(owner_id, created_at) values (p_owner, v_now);
  return true;
end;
$$;

revoke execute on function public.register_byok_key(uuid, text, text, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.register_byok_key(uuid, text, text, text, text[])
  to service_role;
revoke execute on function public.set_byok_status(uuid, text, text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.set_byok_status(uuid, text, text, text[])
  to service_role;
revoke execute on function public.get_byok_secret(uuid, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.get_byok_secret(uuid, text, boolean)
  to service_role;
revoke execute on function public.delete_byok_key(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_byok_key(uuid, text)
  to service_role;
revoke execute on function public.claim_byok_validation(uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_byok_validation(uuid, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
