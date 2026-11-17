-- Phase 21 (21-02, LIST-04 / D-01): works.serial_status 컬럼·값 제약·변경 권한 정본 마이그레이션.
--
-- 정본 및 번호 예약 규칙:
--   - 마이그레이션 번호는 0056으로 확정한다.
--   - 타 Phase 예약 번호(26=0053~0055, 28=0057, 27=0058, 29=0059~0060)와 충돌하지 않는다.
--   - 21-02가 works.serial_status('ongoing' | 'completed') 컬럼의 유일한 정본이며,
--     Phase 28(완독 집계/문구 전환)은 이 컬럼을 재사용만 하고 새로 만들지 않는다.
--
-- 권한·RLS 원칙:
--   - 0002_studio.sql의 "works_owner_all" 정책은 owner_id = auth.uid() AND deleted_at IS NULL 행만
--     UPDATE를 허용하고 WITH CHECK (owner_id = auth.uid())를 강제한다.
--   - 0003_reader.sql / 0032_world_tree_schema.sql의 "works_public_read" 정책은 SELECT 전용이다.
--   - 0008_sanction_enforcement.sql의 works_write_access_update(RESTRICTIVE)가 제재 계정을 차단한다.
--   - 0006_admin_foundation.sql이 works의 테이블 단위 INSERT/UPDATE를 회수하고 컬럼 단위 권한을
--     부여하므로, authenticated에 serial_status INSERT/UPDATE 컬럼 권한만 추가하고 anon은 차단한다.
--   - 새 public UPDATE 정책이나 RLS를 우회하는 SECURITY DEFINER 함수는 만들지 않는다.

begin;

alter table works
  add column if not exists serial_status text not null default 'ongoing';

alter table works
  alter column serial_status set default 'ongoing';

-- 재적용 시 기존 'completed' 값을 절대 덮어쓰지 않고 NULL 행만 기본값으로 보정한다.
update works
   set serial_status = 'ongoing'
 where serial_status is null;

alter table works
  alter column serial_status set not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'works_serial_status_check'
       and conrelid = 'public.works'::regclass
  ) then
    alter table works
      add constraint works_serial_status_check
      check (serial_status in ('ongoing', 'completed'));
  end if;
end
$$;

alter table works enable row level security;

revoke insert (serial_status), update (serial_status) on works from public, anon;
grant insert (serial_status), update (serial_status) on works to authenticated;

notify pgrst, 'reload schema';

commit;
