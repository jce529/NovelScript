begin;

-- 18 BUG-02 (2026-11-05): 비로그인 홈 피드가 statement timeout으로 500.
-- 0036이 works/chapters 공개 읽기 정책을 값싼 조건(deleted_at is null / is_published ...)에서
-- world_work_public_meta_visible(...) 호출로 바꿨고, 이 함수가 행마다 호출되면서
-- world_work_reader_visible을 중첩 호출해 works·chapters를 한 호출에 4번 안팎 조회했다.
-- 피드는 works에 chapters를 붙여 읽으므로 호출 수가 (작품 수 + 회차 수)에 비례한다.
-- 이 마이그레이션은 정책의 의미를 바꾸지 않고 호출당 비용만 줄인다.
--
-- 의미 보존 근거:
--   world_work_public_meta_visible = reader_visible OR (admin_blinded AND not deleted AND not draft AND 발행 회차 있음)
--   reader_visible                 = not deleted AND not draft AND not admin_blinded AND 발행 회차 있음
--   => 합집합은 admin_blinded 값과 무관하게 "not deleted AND not draft AND 발행 회차 있음"이다.
--   chapters 행 정책은 그 행이 이미 발행·미삭제 회차이므로 "발행 회차 있음"이 항상 참 =>
--   "작품이 삭제·가지 초안이 아님" 한 가지만 보면 된다.
-- 같은 진리표를 tests/world-tree/public-read-cost.database.test.ts가 모든 조합으로 고정한다.
-- world_work_reader_visible(0033)은 본문 권한·세계수 등 다른 경로가 계속 쓰므로 그대로 둔다.

-- 1. chapters 정책용 한 번 조회 헬퍼 (SECURITY DEFINER라 works RLS를 다시 타지 않는다)
create or replace function world_work_base_visible(p_work_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w
     where w.id = p_work_id and w.deleted_at is null and not w.is_branch_draft
  );
$$;
revoke all on function world_work_base_visible(uuid) from public;
-- 정책 표현식은 호출자 권한으로 실행되므로 모든 API 역할에 EXECUTE가 필요하다.
grant execute on function world_work_base_visible(uuid) to anon, authenticated, service_role;

-- 2. works 정책용 메타 가시성: 중첩 호출 없이 한 번의 질의로 푼다 (결과는 0036과 동일)
create or replace function world_work_public_meta_visible(p_work_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select w.deleted_at is null
       and not w.is_branch_draft
       and exists (
         select 1 from chapters c
          where c.work_id = w.id and c.is_published and c.deleted_at is null
       )
      from works w
     where w.id = p_work_id
  ), false);
$$;
revoke all on function world_work_public_meta_visible(uuid) from public;
grant execute on function world_work_public_meta_visible(uuid) to anon, authenticated, service_role;

-- 3. chapters 공개 읽기 정책: 회차 행마다 works·chapters를 다시 훑지 않는다
drop policy if exists "chapters_public_read" on chapters;
create policy "chapters_public_read" on chapters for select
  using (is_published = true and deleted_at is null and world_work_base_visible(work_id));

-- 4. 발행 회차 존재 확인(exists)과 피드의 회차 조인을 위한 부분 인덱스
create index if not exists chapters_work_published_idx
  on chapters (work_id) where is_published and deleted_at is null;

notify pgrst, 'reload schema';
commit;
