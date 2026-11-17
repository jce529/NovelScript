begin;

-- 26-02 (RDATA-03, D-04, D-05, D-06, D-07, D-09, D-10):
-- 작품 단위 공개 요약(work_reading_metrics)과 작가 전용 회차별 상세(work_chapter_metrics) 실시간 집계 RPC.
--
-- 핵심 계약:
--   * D-05 실시간 집계: 요약 테이블·뷰·크론 없이 chapter_reading_state를 실시간으로 집계한다.
--   * D-06 유효 독자 필터: 도달·완독·이어 열람 모든 분모/분자에서
--     (a) 작품 소유자 본인(s.user_id <> w.owner_id),
--     (b) 미인증 계정(public.user_is_verified(s.user_id) = true),
--     (c) 탈퇴/삭제 프로필(p.deleted_at is null)을 동일하게 제외한다.
--   * D-07 완독률: 회차 완독률 = completed / reached,
--     작품 완독률 = sum(completed) / sum(reached) (회차 단순 평균이 아닌 도달자 가중 평균).
--   * D-04·D-09 연독률: 작품의 전체 chapters(order_index, id 순)에서 바로 인접한 두 회차가
--     모두 공개·미삭제·비블라인드일 때만 유효 연독쌍(N -> N+1)으로 인정한다.
--     비공개·삭제·블라인드 회차를 건너뛴 쌍은 만들지 않으며, 마지막 회차는 쌍에서 제외한다.
--     분자는 N화 완독자 중 N+1화 chapter_reading_state 행이 있는 유효 독자 수(nextOpened)이며
--     열람 시점 선후는 제한하지 않는다(선열람 허용). 작품 연독률 = 유효쌍의 sum(nextOpened) / sum(completed).
--   * D-10 공개 범위와 표본 기준:
--     - work_reading_metrics(p_work_id): 공개 요약 DTO
--       { workId, reachedReaders, completionRate, retentionRate, sampleSufficient }.
--       reading_completion_config().min_sample_readers(초기 5) 미만이면 두 비율을 모두 null로 숨기고
--       sampleSufficient = false를 반환한다.
--       비공개(공개 회차 0개)·블라인드·삭제 작품을 소유자 아닌 호출자가 요청하면 예외 없이 null을 반환한다.
--     - work_chapter_metrics(p_work_id): 작가 전용 상세 DTO 배열
--       { chapterId, orderIndex, reached, completed, completionRate, nextOpened, retentionRate }[].
--       첫 데이터 접근 전에 auth.uid() = works.owner_id를 확인하며, 상세 비율은 분모가 0이거나
--       유효 인접쌍이 없을 때만 null이다.

-- 1) 완독자 부분 인덱스(집계 서브쿼리 및 연독 교집합 조회 보조, 26-RESEARCH §3.6).
create index if not exists chapter_reading_state_completed_chapter_idx
  on chapter_reading_state (chapter_id, user_id)
  where completed_at is not null;

-- 2) 공개 작품 요약 RPC: work_reading_metrics(p_work_id uuid) -> jsonb | null
create or replace function work_reading_metrics(p_work_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_deleted_at timestamptz;
  v_admin_blinded boolean;
  v_has_live_chapter boolean;
  v_min_sample_readers integer;
  v_reached_readers integer := 0;
  v_total_reached bigint := 0;
  v_total_completed bigint := 0;
  v_pair_completed bigint := 0;
  v_pair_next_opened bigint := 0;
  v_sample_sufficient boolean := false;
begin
  if p_work_id is null then
    return null;
  end if;

  select w.owner_id, w.deleted_at, coalesce(w.admin_blinded, false)
    into v_owner_id, v_deleted_at, v_admin_blinded
    from works w
   where w.id = p_work_id;

  if not found or v_deleted_at is not null or v_admin_blinded then
    return null;
  end if;

  v_has_live_chapter := exists (
    select 1 from chapters c
     where c.work_id = p_work_id
       and c.is_published = true
       and c.deleted_at is null
       and not coalesce(c.admin_blinded, false)
  );

  -- 비공개 작품(공개·미삭제·비블라인드 회차 0개)을 소유자 아닌 호출자가 요청하면 예외 없이 null 반환.
  if not v_has_live_chapter then
    if v_uid is null
       or not (auth.uid() = v_owner_id)
       or not exists (select 1 from profiles p where p.id = v_uid and p.deleted_at is null)
    then
      return null;
    end if;
  end if;

  select cfg.min_sample_readers
    into v_min_sample_readers
    from reading_completion_config() cfg;

  with ordered_chapters as (
    select
      c.id as chapter_id,
      c.order_index,
      (c.is_published = true and c.deleted_at is null and not coalesce(c.admin_blinded, false)) as is_live,
      lead(c.id) over (order by c.order_index, c.id) as next_chapter_id,
      lead(c.is_published = true and c.deleted_at is null and not coalesce(c.admin_blinded, false))
        over (order by c.order_index, c.id) as next_is_live
    from chapters c
    where c.work_id = p_work_id
  ),
  live_chapters as (
    select
      oc.chapter_id,
      oc.order_index,
      case when coalesce(oc.next_is_live, false) then oc.next_chapter_id else null end as valid_next_chapter_id
    from ordered_chapters oc
    where oc.is_live
  ),
  valid_state as (
    select
      s.user_id,
      s.chapter_id,
      s.completed_at
    from chapter_reading_state s
    join live_chapters lc on lc.chapter_id = s.chapter_id
    join profiles p on p.id = s.user_id
    where s.work_id = p_work_id
      and p.deleted_at is null
      and s.user_id <> v_owner_id
      and public.user_is_verified(s.user_id)
  ),
  chapter_counts as (
    select
      lc.chapter_id,
      lc.valid_next_chapter_id,
      count(vs.user_id)::bigint as reached,
      count(vs.user_id) filter (where vs.completed_at is not null)::bigint as completed,
      case
        when lc.valid_next_chapter_id is null then 0::bigint
        else (
          select count(*)::bigint
          from valid_state cur
          join valid_state nxt
            on nxt.user_id = cur.user_id
           and nxt.chapter_id = lc.valid_next_chapter_id
          where cur.chapter_id = lc.chapter_id
            and cur.completed_at is not null
        )
      end as next_opened
    from live_chapters lc
    left join valid_state vs on vs.chapter_id = lc.chapter_id
    group by lc.chapter_id, lc.valid_next_chapter_id
  )
  select
    coalesce((select count(distinct vs.user_id)::integer from valid_state vs), 0),
    coalesce(sum(cc.reached), 0)::bigint,
    coalesce(sum(cc.completed), 0)::bigint,
    coalesce(sum(cc.completed) filter (where cc.valid_next_chapter_id is not null), 0)::bigint,
    coalesce(sum(cc.next_opened) filter (where cc.valid_next_chapter_id is not null), 0)::bigint
  into
    v_reached_readers,
    v_total_reached,
    v_total_completed,
    v_pair_completed,
    v_pair_next_opened
  from chapter_counts cc;

  v_sample_sufficient := v_reached_readers >= v_min_sample_readers;

  return jsonb_build_object(
    'workId', p_work_id,
    'reachedReaders', v_reached_readers,
    'completionRate', case
      when v_sample_sufficient and v_total_reached > 0
        then to_jsonb((v_total_completed::numeric / v_total_reached::numeric)::double precision)
      else 'null'::jsonb
    end,
    'retentionRate', case
      when v_sample_sufficient and v_pair_completed > 0
        then to_jsonb((v_pair_next_opened::numeric / v_pair_completed::numeric)::double precision)
      else 'null'::jsonb
    end,
    'sampleSufficient', v_sample_sufficient
  );
end;
$$;

revoke all on function work_reading_metrics(uuid)
  from public, anon, authenticated, service_role;
grant execute on function work_reading_metrics(uuid)
  to anon, authenticated;

-- 3) 작가 전용 회차별 상세 RPC: work_chapter_metrics(p_work_id uuid) -> jsonb
create or replace function work_chapter_metrics(p_work_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if p_work_id is null then
    raise exception 'invalid_input';
  end if;
  if not exists (select 1 from profiles p where p.id = v_uid and p.deleted_at is null) then
    raise exception 'authentication_required';
  end if;

  -- 첫 데이터 접근 전에 작품 존재 및 소유자 권한(auth.uid() = works.owner_id)을 확인한다.
  select w.owner_id
    into v_owner_id
    from works w
   where w.id = p_work_id
     and w.deleted_at is null;
  if not found then
    raise exception 'work_not_found';
  end if;
  if not (auth.uid() = v_owner_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with ordered_chapters as (
    select
      c.id as chapter_id,
      c.order_index,
      (c.is_published = true and c.deleted_at is null and not coalesce(c.admin_blinded, false)) as is_live,
      lead(c.id) over (order by c.order_index, c.id) as next_chapter_id,
      lead(c.is_published = true and c.deleted_at is null and not coalesce(c.admin_blinded, false))
        over (order by c.order_index, c.id) as next_is_live
    from chapters c
    where c.work_id = p_work_id
  ),
  live_chapters as (
    select
      oc.chapter_id,
      oc.order_index,
      case when coalesce(oc.next_is_live, false) then oc.next_chapter_id else null end as valid_next_chapter_id
    from ordered_chapters oc
    where oc.is_live
  ),
  valid_state as (
    select
      s.user_id,
      s.chapter_id,
      s.completed_at
    from chapter_reading_state s
    join live_chapters lc on lc.chapter_id = s.chapter_id
    join profiles p on p.id = s.user_id
    where s.work_id = p_work_id
      and p.deleted_at is null
      and s.user_id <> v_owner_id
      and public.user_is_verified(s.user_id)
  ),
  chapter_counts as (
    select
      lc.chapter_id,
      lc.order_index,
      lc.valid_next_chapter_id,
      count(vs.user_id)::integer as reached,
      count(vs.user_id) filter (where vs.completed_at is not null)::integer as completed,
      case
        when lc.valid_next_chapter_id is null then 0
        else (
          select count(*)::integer
          from valid_state cur
          join valid_state nxt
            on nxt.user_id = cur.user_id
           and nxt.chapter_id = lc.valid_next_chapter_id
          where cur.chapter_id = lc.chapter_id
            and cur.completed_at is not null
        )
      end as next_opened
    from live_chapters lc
    left join valid_state vs on vs.chapter_id = lc.chapter_id
    group by lc.chapter_id, lc.order_index, lc.valid_next_chapter_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'chapterId', cc.chapter_id,
        'orderIndex', cc.order_index,
        'reached', cc.reached,
        'completed', cc.completed,
        'completionRate', case
          when cc.reached > 0
            then to_jsonb((cc.completed::numeric / cc.reached::numeric)::double precision)
          else 'null'::jsonb
        end,
        'nextOpened', cc.next_opened,
        'retentionRate', case
          when cc.valid_next_chapter_id is not null and cc.completed > 0
            then to_jsonb((cc.next_opened::numeric / cc.completed::numeric)::double precision)
          else 'null'::jsonb
        end
      )
      order by cc.order_index, cc.chapter_id
    ),
    '[]'::jsonb
  )
  into v_result
  from chapter_counts cc;

  return v_result;
end;
$$;

revoke all on function work_chapter_metrics(uuid)
  from public, anon, authenticated, service_role;
grant execute on function work_chapter_metrics(uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
