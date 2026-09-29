-- BUG-03 step1 마이그레이션(0012_template_category_folders.sql) 검증 SQL
-- 대상: 테스트 DB (운영 DB 금지). Supabase SQL editor 또는 psql에서 블록 단위로 실행한다.
-- 순서: [A] 적용 전 스냅샷 → 0012 적용 → [B] 적용 후 검증 → 0012 재적용 → [C] 재실행 검증.
-- 0012는 되돌릴 수 없으므로 적용 전 DB 백업/스냅샷을 만든다.

------------------------------------------------------------------------------
-- [A] 적용 전 스냅샷 (0012 적용 전에 실행, 결과를 저장해 둔다)
------------------------------------------------------------------------------

-- A1. 템플릿 루트 개수 (작품별 1개 + 계정별 최대 1개)
select scope, count(*) as roots
from kb_nodes
where category = 'template' and node_type = 'folder' and parent_id is null and deleted_at is null
group by scope;

-- A2. 루트 직속 파일: 이름=카테고리(이동 대상) vs 그 외 커스텀 이름(루트에 남아야 함)
select f.scope,
       count(*) filter (where f.name in ('인물','장소','사건','세력','아이템')) as category_named_files,
       count(*) filter (where f.name not in ('인물','장소','사건','세력','아이템')) as custom_named_files
from kb_nodes f
join kb_nodes r on r.id = f.parent_id
where f.node_type = 'file' and f.category = 'template' and f.deleted_at is null
  and r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null
group by f.scope;

-- A3. 루트 직속 폴더(이미 있는 사용자 폴더 — 카테고리명과 같으면 카테고리 폴더로 재사용됨)
select r.scope, f.name, f.is_locked
from kb_nodes f
join kb_nodes r on r.id = f.parent_id
where f.node_type = 'folder' and f.deleted_at is null
  and r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null;

-- A4. 이동 대상 파일의 id/내용 해시 (적용 후 내용이 보존됐는지 비교)
create temp table bug03_before as
select f.id, f.name, md5(coalesce(f.content, '')) as content_md5
from kb_nodes f
join kb_nodes r on r.id = f.parent_id
where f.node_type = 'file' and f.category = 'template' and f.deleted_at is null
  and r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null;
select count(*) as snapshot_rows from bug03_before;

------------------------------------------------------------------------------
-- [B] 적용 후 검증 (0012 적용 후 실행) — 아래 쿼리는 모두 0행이어야 통과
------------------------------------------------------------------------------

-- B1. 모든 템플릿 루트에 카테고리 폴더 5개가 정확히 하나씩 있어야 한다 (결측/중복 = 행 반환)
select r.id as root_id, r.scope, c.name as category, count(k.id) as folder_count
from kb_nodes r
cross join (values ('인물'),('장소'),('사건'),('세력'),('아이템')) as c(name)
left join kb_nodes k on k.parent_id = r.id and k.name = c.name
  and k.node_type = 'folder' and k.category = 'template' and k.deleted_at is null
where r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null
group by r.id, r.scope, c.name
having count(k.id) <> 1;

-- B2. 카테고리 폴더는 모두 잠겨 있어야 한다
select k.id, r.scope, k.name
from kb_nodes k
join kb_nodes r on r.id = k.parent_id
where r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null
  and k.node_type = 'folder' and k.name in ('인물','장소','사건','세력','아이템')
  and k.deleted_at is null and (k.is_locked is not true or k.category <> 'template');

-- B3. 루트 직속에 이름=카테고리 파일이 남아 있으면 안 된다 (모두 이동됐어야 함)
select f.id, f.name
from kb_nodes f
join kb_nodes r on r.id = f.parent_id
where f.node_type = 'file' and f.category = 'template' and f.deleted_at is null
  and f.name in ('인물','장소','사건','세력','아이템')
  and r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null;

-- B4. 이동된 파일은 이름과 같은 카테고리 폴더 안에 있고, 이름/내용이 보존돼야 한다
select b.id, b.name as before_name, f.name as after_name, p.name as parent_name,
       b.content_md5 = md5(coalesce(f.content, '')) as content_preserved
from bug03_before b
join kb_nodes f on f.id = b.id
left join kb_nodes p on p.id = f.parent_id
where b.name in ('인물','장소','사건','세력','아이템')
  and (f.name <> b.name or p.name <> b.name or p.node_type <> 'folder'
       or b.content_md5 <> md5(coalesce(f.content, '')));

-- B5. 임시 이름(__bug03_...)이 남아 있으면 안 된다
select id, name from kb_nodes where name like '\_\_bug03\_%' escape '\';

-- B6. 커스텀 이름 파일은 루트에 그대로 남아 있어야 한다 (A2의 custom_named_files와 같은 수)
select f.scope, count(*) as custom_named_files_still_at_root
from kb_nodes f
join kb_nodes r on r.id = f.parent_id
where f.node_type = 'file' and f.category = 'template' and f.deleted_at is null
  and f.name not in ('인물','장소','사건','세력','아이템')
  and r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null
group by f.scope;

-- B7. 시블링 이름 중복이 없어야 한다 (kb_nodes_sibling_name_unique 보호 확인)
select owner_id, coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid) as w, parent_id, name, count(*)
from kb_nodes where deleted_at is null
group by 1, 2, 3, 4 having count(*) > 1;

-- B8. 템플릿 루트 유일성 (.maybeSingle 조회 전제): 작품별/계정별 루트가 2개 이상이면 안 된다
select coalesce(work_id::text, 'account:' || owner_id::text) as owner_key, count(*)
from kb_nodes
where category = 'template' and node_type = 'folder' and parent_id is null and deleted_at is null
group by 1 having count(*) > 1;

------------------------------------------------------------------------------
-- [C] 재실행(idempotent) 검증: 0012를 한 번 더 적용한 뒤 아래를 실행
------------------------------------------------------------------------------
-- C1. 재적용 후에도 B1~B8이 모두 0행이어야 한다 (위 쿼리를 다시 실행).
-- C2. 카테고리 폴더 수 = 템플릿 루트 수 * 5 (soft-deleted 제외)
select
  (select count(*) from kb_nodes
    where category = 'template' and node_type = 'folder' and parent_id is null and deleted_at is null) as roots,
  (select count(*) from kb_nodes k join kb_nodes r on r.id = k.parent_id
    where r.category = 'template' and r.node_type = 'folder' and r.parent_id is null and r.deleted_at is null
      and k.node_type = 'folder' and k.name in ('인물','장소','사건','세력','아이템') and k.deleted_at is null) as category_folders;
-- 기대: category_folders = roots * 5

------------------------------------------------------------------------------
-- [D] 신규 생성 경로 검증 (create_work / ensure_account_template_root)
--     트랜잭션으로 감싸 롤백한다. :owner 는 테스트 계정 profiles.id 로 바꾼다.
------------------------------------------------------------------------------
begin;
  select create_work('00000000-0000-0000-0000-000000000000'::uuid, 'UAT tmp', null, null, null) as work_id;
  -- ↑ 위 owner 를 실제 테스트 계정 id 로 교체. 반환된 work_id 로 아래를 실행:
  -- select k.name, k.category, k.is_locked, p.name as parent
  --   from kb_nodes k left join kb_nodes p on p.id = k.parent_id
  --  where k.work_id = '<work_id>' and k.category = 'template' order by p.name nulls first, k.name;
  -- 기대: 루트 'template'(잠김) 1개 + 그 아래 5개 카테고리 폴더(모두 잠김, category='template').
  select ensure_account_template_root('00000000-0000-0000-0000-000000000000'::uuid);  -- owner 교체
  -- 두 번 호출해도 카테고리 폴더가 중복되지 않아야 한다.
rollback;
