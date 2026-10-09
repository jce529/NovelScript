begin;

-- BUG-01 (Phase 01): 탈퇴 시 개인정보·BYOK 키·소셜 연결을 한 트랜잭션에서 정리한다.
-- 지갑·원장·작품·주문은 append-only 정책(D-08)에 따라 건드리지 않는다.
-- 여러 번 호출해도 결과가 같다(멱등). deleted_at은 처음 찍힌 시각을 유지한다.
create or replace function public.purge_account_data(p_owner uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets
    where id in (select secret_id from public.byok_keys where owner_id = p_owner);
  delete from public.byok_keys where owner_id = p_owner;
  delete from public.byok_validation_log where owner_id = p_owner;

  update public.profiles
    set pen_name = null,
        pen_name_bio = null,
        pen_name_set_at = null,
        default_key_source = 'service',
        deleted_at = coalesce(deleted_at, now())
    where id = p_owner;
  if not found then raise exception 'profile_not_found'; end if;

  -- 소셜 연결을 끊어야 같은 소셜 계정의 다음 로그인이 새 계정 가입으로 이어진다.
  delete from auth.identities where user_id = p_owner;
end;
$$;

revoke execute on function public.purge_account_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_account_data(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
