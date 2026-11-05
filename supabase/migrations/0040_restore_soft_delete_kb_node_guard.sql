begin;

-- 공유 DB 따라잡기(2026-11-04 점검): 공유 DB의 soft_delete_kb_node는 0008의 쓰기 권한·소유자 확인이 없는 이전 정의다.
-- 이후 어떤 마이그레이션도 이 함수를 다시 정의하지 않으므로 여기서 0008의 최종 정의를 복구한다.
-- 순서: 반드시 0039(OAuth 가드 주입)보다 먼저 적용한다. 0039가 이 함수에 mcp_reject_oauth_caller 가드를 주입하는데,
--       그 뒤에 0008 정의로 되돌리면 가드가 지워진다.
-- 안전장치: 이미 write_access_denied 확인이 들어 있는 DB(0008을 제대로 적용한 DB, 0039 이후의 DB)에서는 아무것도 하지 않는다.
do $do$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_catalog.pg_proc as p
  where p.oid = pg_catalog.to_regprocedure('public.soft_delete_kb_node(uuid,uuid)');

  if v_src is null then
    raise exception '0040: public.soft_delete_kb_node(uuid,uuid) does not exist';
  end if;

  if pg_catalog.strpos(v_src, 'write_access_denied') > 0 then
    raise notice '0040: soft_delete_kb_node already has the write-access guard; skipped';
    return;
  end if;

  execute $fn$
    create or replace function public.soft_delete_kb_node(p_node_id uuid, p_owner_id uuid) returns uuid
    language plpgsql security definer set search_path = public as $body$
    declare v_id uuid;
    begin
      if (auth.uid() is not null and auth.uid() is distinct from p_owner_id)
        or not user_can_write(p_owner_id) then
        raise exception 'write_access_denied';
      end if;

      update chapters set folder_id = null where folder_id = p_node_id
        and exists (select 1 from kb_nodes k where k.id = p_node_id and k.owner_id = p_owner_id);

      update kb_nodes set deleted_at = now()
      where id = p_node_id and owner_id = p_owner_id and deleted_at is null
      returning id into v_id;
      return v_id;
    end;
    $body$
  $fn$;

  revoke all on function public.soft_delete_kb_node(uuid, uuid) from public, anon;
  grant execute on function public.soft_delete_kb_node(uuid, uuid) to authenticated, service_role;
  raise notice '0040: restored 0008 definition of soft_delete_kb_node';
end;
$do$;

notify pgrst, 'reload schema';
commit;
