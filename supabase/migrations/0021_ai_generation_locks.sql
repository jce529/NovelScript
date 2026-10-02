-- BUG-06 (Phase 8): one paid AI generation per wallet at a time.
-- preflight reads the balance, the provider call runs, settle debits afterwards; two concurrent
-- generations for one wallet both pass preflight and the second settle can fail with
-- "insufficient balance" after the model cost was already incurred. A per-wallet lease row,
-- acquired before the provider call and released on every exit path, serializes them.
-- PostgREST requests do not share a DB session, so this is a row lease (not an advisory lock):
-- owner_token identifies the holder, expires_at (DB clock) recovers from crashed requests.
-- Service-role only; the app calls these RPCs through the admin client.

create table if not exists ai_generation_locks (
  wallet_id uuid primary key references wallets(id) on delete cascade,
  owner_token uuid not null,
  expires_at timestamptz not null
);
alter table ai_generation_locks enable row level security;
revoke all on table ai_generation_locks from public, anon, authenticated;

-- true = lease acquired (free or expired lease taken over); false = another live lease holds it.
create or replace function acquire_ai_generation_lock(p_wallet_id uuid, p_owner_token uuid, p_ttl_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  if p_wallet_id is null or p_owner_token is null or p_ttl_seconds is null or p_ttl_seconds <= 0 then
    raise exception 'invalid_lock_arguments';
  end if;
  insert into ai_generation_locks (wallet_id, owner_token, expires_at)
  values (p_wallet_id, p_owner_token, now() + make_interval(secs => p_ttl_seconds))
  on conflict (wallet_id) do update
    set owner_token = excluded.owner_token, expires_at = excluded.expires_at
    where ai_generation_locks.expires_at <= now()
  returning owner_token into v_token;
  return v_token is not distinct from p_owner_token;
end;
$$;

-- Releases only the caller's own lease, so an expired owner can never free a newer holder's lease.
create or replace function release_ai_generation_lock(p_wallet_id uuid, p_owner_token uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from ai_generation_locks where wallet_id = p_wallet_id and owner_token = p_owner_token;
  return found;
end;
$$;

revoke all on function acquire_ai_generation_lock(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function release_ai_generation_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function acquire_ai_generation_lock(uuid, uuid, integer) to service_role;
grant execute on function release_ai_generation_lock(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
