begin;

-- Account deletion cascades public.byok_keys rows away (profiles FK on delete cascade) but the
-- Vault secret lives in a separate schema and was left behind. Tie the secret's lifetime to the
-- metadata row so no deletion path can orphan a stored key (D-09).
create or replace function public.delete_byok_secret_on_key_delete()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id = old.secret_id;
  return old;
end;
$$;

revoke execute on function public.delete_byok_secret_on_key_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists byok_keys_delete_secret on public.byok_keys;
create trigger byok_keys_delete_secret
  after delete on public.byok_keys
  for each row execute function public.delete_byok_secret_on_key_delete();

commit;
