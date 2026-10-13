-- Phase 02 Reopen D-10 (2026-10-12): 템플릿 이름 유일성 + 기본 템플릿 잠금을 DB 경계에서 강제한다.
-- 0022_template_readonly_backfill.sql 이후에 적용한다(kb_template_seed_catalog 필요). 재실행 안전.
--
-- 템플릿 "영역" = owner_id + coalesce(work_id). 계정 영역과 작품 영역, 서로 다른 작품은 별도 영역이다.
-- 전 계정 공유 이름공간은 만들지 않는다. 부모 폴더·카테고리는 키에 포함하지 않는다
-- (카테고리 폴더가 달라도 같은 영역이면 같은 이름 불가).
--
-- 순서:
--   1. kb_nodes EXCLUSIVE 잠금.
--   2. 같은 영역에 잠긴 기본 파일이 같은 이름으로 둘 이상이면 사람이 정리하도록 실패한다.
--   3. 기존 이름 충돌 정리: 영역별로 (잠긴 기본 우선, created_at, id) 순서의 첫 이름을 유지하고,
--      나머지와 기본 이름(인물·장소·사건·세력·아이템)을 쓰는 사용자 템플릿에는 결정적 접미사 " (N)"를 붙인다.
--      내용·id 는 그대로다.
--   4. 영역 내 이름 유일 인덱스(btrim(name)).
--   5. guard: 잠금 해제·잠긴 기본 템플릿 변경·잠긴 노드 직접 DELETE·기본 파일 위장 INSERT·예약 이름 사용·
--      다른 영역 부모 위장을 거부한다. 검증된 seed(정확한 canonical 이름/내용, 소유 root/카테고리 폴더)와
--      trusted migration(이 파일·0022) 외에는 잠긴 기본 파일을 만들 수 없다.
--      사용자 설정 GUC 우회나 RPC 로 부를 수 있는 공개 SECURITY DEFINER 함수는 만들지 않는다
--      (guard 는 trigger 전용 함수라 RPC 로 호출할 수 없다).
begin;

lock table kb_nodes in exclusive mode;

do $$
begin
  if exists (
    select 1 from kb_nodes
    where node_type = 'file' and category = 'template' and is_locked and deleted_at is null
    group by owner_id, coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid), btrim(name)
    having count(*) > 1
  ) then
    raise exception 'duplicate_default_templates: resolve manually before applying 0023';
  end if;
end $$;

create temporary table kb_template_kept_names (
  owner_id uuid not null,
  area_id uuid not null,
  key text not null,
  primary key (owner_id, area_id, key)
) on commit drop;

do $$
declare
  c_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  c_reserved constant text[] := array['인물','장소','사건','세력','아이템'];
  r record;
  v_key text;
  v_name text;
  v_n integer;
begin
  for r in
    select id, owner_id, coalesce(work_id, c_zero) as area_id, parent_id, name, is_locked
    from kb_nodes
    where node_type = 'file' and category = 'template' and deleted_at is null
    order by owner_id, coalesce(work_id, c_zero), is_locked desc, created_at, id
  loop
    v_key := btrim(r.name);
    if r.is_locked or (
      not (v_key = any(c_reserved))
      and not exists (
        select 1 from kb_template_kept_names k
        where k.owner_id = r.owner_id and k.area_id = r.area_id and k.key = v_key
      )
    ) then
      insert into kb_template_kept_names values (r.owner_id, r.area_id, v_key);
      continue;
    end if;

    v_n := 2;
    loop
      v_name := v_key || ' (' || v_n || ')';
      exit when not exists (
          select 1 from kb_template_kept_names k
          where k.owner_id = r.owner_id and k.area_id = r.area_id and k.key = v_name
        )
        and not exists (
          select 1 from kb_nodes o
          where o.deleted_at is null and o.owner_id = r.owner_id
            and coalesce(o.work_id, c_zero) = r.area_id
            and o.node_type = 'file' and o.category = 'template' and btrim(o.name) = v_name
        )
        and not exists (
          select 1 from kb_nodes s
          where s.deleted_at is null and s.parent_id = r.parent_id and s.name = v_name
        );
      v_n := v_n + 1;
    end loop;

    update kb_nodes set name = v_name, updated_at = now() where id = r.id;
    insert into kb_template_kept_names values (r.owner_id, r.area_id, v_name);
  end loop;
end $$;

create unique index if not exists kb_nodes_template_area_name_unique
  on kb_nodes (owner_id, coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid), btrim(name))
  where node_type = 'file' and category = 'template' and deleted_at is null;

-- 기존 잠금 guard 확장: 잠긴 노드(구조 폴더·카테고리 폴더·기본 템플릿)는 이름 변경·삭제에 더해 잠금 해제도 불가.
create or replace function guard_locked_kb_node() returns trigger
language plpgsql as $$
begin
  if OLD.is_locked and (
    NEW.name is distinct from OLD.name or NEW.deleted_at is not null or NEW.is_locked is not true
  ) then
    raise exception 'locked_node_immutable';
  end if;
  return NEW;
end;
$$;

-- 템플릿 정책 guard. SECURITY DEFINER 는 private catalog(kb_template_seed_catalog)를 읽기 위해서이고,
-- RLS 를 우회해 부모를 보므로 소유자·영역 일치를 아래에서 직접 검사한다. trigger 전용이라 RPC 로 부를 수 없다.
create or replace function guard_kb_template_policy() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_reserved constant text[] := array['인물','장소','사건','세력','아이템'];
  v_uid uuid := auth.uid();
  v_parent kb_nodes%rowtype;
  v_root kb_nodes%rowtype;
  v_canonical text;
  v_check_parent boolean;
begin
  if TG_OP = 'DELETE' then
    if OLD.is_locked then
      raise exception 'locked_node_immutable';
    end if;
    return OLD;
  end if;

  -- 잠긴 기본 템플릿 파일은 어떤 열도 바꿀 수 없다(updated_at 등 메타데이터 제외).
  if TG_OP = 'UPDATE' and OLD.is_locked and OLD.node_type = 'file' and OLD.category = 'template' then
    if (NEW.content, NEW.name, NEW.parent_id, NEW.category, NEW.node_type, NEW.scope,
        NEW.work_id, NEW.owner_id, NEW.is_locked, NEW.deleted_at)
       is distinct from
       (OLD.content, OLD.name, OLD.parent_id, OLD.category, OLD.node_type, OLD.scope,
        OLD.work_id, OLD.owner_id, OLD.is_locked, OLD.deleted_at) then
      raise exception 'locked_template_immutable';
    end if;
    return NEW;
  end if;

  if NEW.node_type <> 'file' or NEW.category <> 'template' then
    return NEW;
  end if;

  -- 잠금 없는 사용자 템플릿의 soft delete 는 그대로 허용한다.
  if TG_OP = 'UPDATE' and NEW.deleted_at is not null then
    return NEW;
  end if;

  if v_uid is not null and NEW.owner_id is distinct from v_uid then
    raise exception 'template_owner_invalid';
  end if;

  v_check_parent := TG_OP = 'INSERT'
    or NEW.is_locked
    or NEW.parent_id is distinct from OLD.parent_id
    or NEW.owner_id is distinct from OLD.owner_id
    or NEW.scope is distinct from OLD.scope
    or NEW.work_id is distinct from OLD.work_id
    or NEW.node_type is distinct from OLD.node_type
    or NEW.category is distinct from OLD.category;

  if v_check_parent then
    select * into v_parent from kb_nodes where id = NEW.parent_id and deleted_at is null;
    if not found or v_parent.node_type <> 'folder' or v_parent.category <> 'template'
       or v_parent.owner_id <> NEW.owner_id or v_parent.scope <> NEW.scope
       or v_parent.work_id is distinct from NEW.work_id then
      raise exception 'template_parent_invalid';
    end if;
  end if;

  if NEW.is_locked then
    -- 검증된 기본 seed 만 허용: 소유 root 바로 아래 잠긴 카테고리 폴더에, 폴더 이름과 같은 정확한 canonical 이름·내용.
    select * into v_root from kb_nodes where id = v_parent.parent_id and deleted_at is null;
    select content into v_canonical from kb_template_seed_catalog where name = v_parent.name;
    if v_canonical is null
       or not v_parent.is_locked
       or NEW.name is distinct from v_parent.name
       or NEW.content is distinct from v_canonical
       or v_root.id is null or v_root.parent_id is not null
       or v_root.node_type <> 'folder' or v_root.category <> 'template'
       or v_root.owner_id <> NEW.owner_id or v_root.scope <> NEW.scope
       or v_root.work_id is distinct from NEW.work_id then
      raise exception 'invalid_template_seed';
    end if;
    return NEW;
  end if;

  if btrim(NEW.name) = any(c_reserved)
     and (TG_OP = 'INSERT' or btrim(NEW.name) is distinct from btrim(OLD.name)) then
    raise exception 'template_name_reserved';
  end if;

  return NEW;
end;
$$;

revoke all on function guard_kb_template_policy() from public, anon, authenticated;

drop trigger if exists kb_nodes_guard_template_policy on kb_nodes;
create trigger kb_nodes_guard_template_policy before insert or update or delete on kb_nodes
  for each row execute function guard_kb_template_policy();

commit;
