begin;

-- Phase 15 (AIDOC-03, 15-REVIEWS 15-03): 작품별·카테고리별 활성 구조 루트 폴더는 정확히 하나여야 한다.
-- 기존 데이터에 중복이 있으면 조용히 고치지 않고 마이그레이션을 실패시켜 사람이 정리하게 한다.
do $$
begin
  if exists (
    select 1 from kb_nodes
    where scope = 'work' and node_type = 'folder' and parent_id is null and deleted_at is null
      and category in ('template','인물','장소','사건','세력','아이템','회차')
    group by work_id, category having count(*) > 1
  ) then
    raise exception 'duplicate_structural_root_folders: resolve manually before applying 0010';
  end if;
end $$;

create unique index if not exists kb_nodes_work_category_root_unique
  on kb_nodes (work_id, category)
  where scope = 'work' and node_type = 'folder' and parent_id is null and deleted_at is null
    and category in ('template','인물','장소','사건','세력','아이템','회차');

commit;
