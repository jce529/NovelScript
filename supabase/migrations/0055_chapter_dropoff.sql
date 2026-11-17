begin;

-- 26-03 (RDATA-04, D-03, D-05, D-06, D-08, D-10):
-- 작가 전용 회차 내 20구간(5% 단위) 이탈 분포 실시간 집계 RPC: chapter_dropoff(p_chapter_id uuid).
--
-- 핵심 계약:
--   * D-03 / D-08 20구간 이탈 분포:
--     - 미완독(completed_at is null) 유효 독자의 max_scroll_ratio를 5% 단위 20칸(0..19)으로 집계한다.
--     - 구간 k는 [k * 0.05, (k + 1) * 0.05)이며, max_scroll_ratio = 1.0은 floor(least(max_scroll_ratio, 1) * 20) = 20을
--       19로 제한해 마지막 칸(buckets[19], [0.95, 1.0])에 넣는다.
--     - 완독자(completed_at is not null)는 이탈 칸에 포함하지 않으므로 항상 sum(buckets) = reached - completed가 성립한다.
--     - 도달 독자가 0명인 회차는 0이 20개인 배열과 reached = 0, completed = 0을 반환한다.
--   * D-05 실시간 집계: 요약 테이블·뷰·크론 없이 chapter_reading_state를 실시간으로 집계한다.
--   * D-06 유효 독자 필터: reached·completed·buckets 모두 동일한 valid_state 집합에서 계산하며,
--     (a) 작품 소유자 본인(s.user_id <> v_owner_id),
--     (b) 미인증 계정(public.user_is_verified(s.user_id) = true),
--     (c) 탈퇴/삭제 프로필(p.deleted_at is null)을 제외한다.
--   * D-10 소유자 전용 및 공개 회차 한정:
--     - 첫 데이터 접근 전에 auth.uid() = works.owner_id를 확인해 소유자에게만 상세 응답을 허용한다.
--     - 현재 공개·미삭제·비블라인드 상태가 아닌 회차(또는 삭제·블라인드 작품의 회차)는 상세 수치를 돌려주지 않는다.

create or replace function chapter_dropoff(p_chapter_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_work_id uuid;
  v_owner_id uuid;
  v_is_live boolean := false;
  v_reached integer := 0;
  v_completed integer := 0;
  v_buckets jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if p_chapter_id is null then
    raise exception 'invalid_input';
  end if;
  if not exists (select 1 from profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'authentication_required';
  end if;

  -- 첫 독서 상태 데이터 접근 전에 회차·작품 존재 및 소유자 권한(auth.uid() = works.owner_id)을 먼저 확인한다.
  select
    c.work_id,
    w.owner_id,
    (
      not coalesce(w.admin_blinded, false)
      and c.is_published = true
      and c.deleted_at is null
      and not coalesce(c.admin_blinded, false)
    )
    into v_work_id, v_owner_id, v_is_live
    from chapters c
    join works w on w.id = c.work_id
   where c.id = p_chapter_id
     and w.deleted_at is null;

  if not found then
    raise exception 'chapter_not_found';
  end if;
  if not (auth.uid() = v_owner_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_is_live then
    raise exception 'chapter_not_found';
  end if;

  with valid_state as (
    select
      s.user_id,
      s.max_scroll_ratio,
      s.completed_at
    from chapter_reading_state s
    join chapters c on c.id = s.chapter_id
    join profiles p on p.id = s.user_id
    where s.chapter_id = p_chapter_id
      and s.work_id = v_work_id
      and c.is_published = true
      and c.deleted_at is null
      and not coalesce(c.admin_blinded, false)
      and p.deleted_at is null
      and s.user_id <> v_owner_id
      and public.user_is_verified(s.user_id)
  ),
  incomplete_buckets as (
    select
      least(
        19,
        greatest(
          0,
          floor(least(vs.max_scroll_ratio, 1) * 20)::integer
        )
      ) as bucket_idx,
      count(*)::integer as cnt
    from valid_state vs
    where vs.completed_at is null
    group by 1
  ),
  bucket_series as (
    select
      g.bucket_idx,
      coalesce(ib.cnt, 0)::integer as cnt
    from generate_series(0, 19) as g(bucket_idx)
    left join incomplete_buckets ib on ib.bucket_idx = g.bucket_idx
  )
  select
    (select count(*)::integer from valid_state),
    (select count(*) filter (where completed_at is not null)::integer from valid_state),
    (select jsonb_agg(bs.cnt order by bs.bucket_idx) from bucket_series bs)
  into
    v_reached,
    v_completed,
    v_buckets;

  return jsonb_build_object(
    'chapterId', p_chapter_id,
    'bucketCount', 20,
    'buckets', v_buckets,
    'reached', v_reached,
    'completed', v_completed
  );
end;
$$;

revoke all on function chapter_dropoff(uuid)
  from public, anon, authenticated, service_role;
grant execute on function chapter_dropoff(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
