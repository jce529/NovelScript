begin;

-- 26-01 (RDATA-02, D-01, D-02, D-10):
-- 완독 판정 기준값과 공개 요약 표본 하한을 DB 단일 설정 함수(reading_completion_config) 한 곳에 모은다.
-- chapter_minimum_reading_ms와 complete_chapter는 하드코딩 대신 이 설정 함수를 읽으며,
-- complete_chapter는 0052_verified_completion.sql의 본문(0039 OAuth 차단 첫 실행문 + 0052 미인증 계정 분기)을 그대로 보존한다.
-- 클라이언트(lib/reader/completion.ts)는 표시·flush 판단용 사본이며 tests/reader/completion-migration.test.ts가 일치를 고정한다.

-- 1) 단일 설정 원본(DB 내부 전용).
--    - chars_per_minute: 분당 1,200자 (D-01)
--    - minimum_reading_ratio: 최소 읽기 시간 비율 0.5 (D-01)
--    - minimum_reading_floor_ms: 최소 읽기 시간 하한 30,000ms (D-01)
--    - completion_scroll_ratio: 회차 끝 도달 기준 0.98 (D-01)
--    - end_sentinel_visible_ms: 끝 센티넬 연속 가시 시간 1,000ms (D-01)
--    - active_time_slack_ms: DB 세션 경과 시간 대비 허용 여유 5,000ms (0024/0025)
--    - min_sample_readers: 작품 공개 요약 최소 도달 독자 수 5명 (D-10, 26-02에서 참조)
create or replace function reading_completion_config(
  out chars_per_minute integer,
  out minimum_reading_ratio numeric,
  out minimum_reading_floor_ms bigint,
  out completion_scroll_ratio numeric,
  out end_sentinel_visible_ms integer,
  out active_time_slack_ms bigint,
  out min_sample_readers integer
) returns record
language sql stable set search_path = public as $$
  select
    1200::integer,
    0.5::numeric,
    30000::bigint,
    0.98::numeric,
    1000::integer,
    5000::bigint,
    5::integer;
$$;

revoke all on function reading_completion_config()
  from public, anon, authenticated, service_role;

-- 2) 최소 읽기 시간 helper: reading_completion_config()에서 기준값을 읽는다.
--    설정 함수 의존성에 맞춰 STABLE로 선언하며 외부 API 역할에는 EXECUTE를 열지 않는다.
create or replace function chapter_minimum_reading_ms(p_char_count integer) returns bigint
language sql stable set search_path = public as $$
  select greatest(
    cfg.minimum_reading_floor_ms,
    ceil(
      greatest(coalesce(p_char_count, 0), 0)::numeric
      * 60000
      * cfg.minimum_reading_ratio
      / cfg.chars_per_minute
    )
  )::bigint
  from reading_completion_config() cfg;
$$;

revoke all on function chapter_minimum_reading_ms(integer)
  from public, anon, authenticated, service_role;

-- 3) complete_chapter: 0052_verified_completion.sql 기준 본문 + reading_completion_config() 참조.
--    첫 실행문 perform public.mcp_reject_oauth_caller() (0039 D-17)와
--    미인증 계정 분기 public.user_is_verified(v_user) (0052)를 그대로 유지한다.
create or replace function complete_chapter(p_work_id uuid, p_chapter_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
  v_char_count integer;
  v_cfg record;
  v_limit_ms bigint;
begin
  perform public.mcp_reject_oauth_caller(); -- 0039 D-17: OAuth bearer -> 42501
  v_user := assert_chapter_reading_access(p_work_id, p_chapter_id);
  if p_session_id is null then raise exception 'invalid_input'; end if;

  select c.char_count into v_char_count from chapters c
    where c.id = p_chapter_id and c.work_id = p_work_id;

  select * into v_row from chapter_reading_state
    where user_id = v_user and chapter_id = p_chapter_id
    for update;
  if not found then
    return jsonb_build_object('chapterId', p_chapter_id, 'workId', p_work_id,
      'scrollRatio', 0, 'maxScrollRatio', 0, 'activeMs', 0, 'completedAt', null,
      'sessionId', null, 'sessionActiveMs', 0, 'lastSequence', 0);
  end if;
  if v_row.completed_at is not null or v_row.session_id is distinct from p_session_id then
    return chapter_reading_snapshot(v_row);
  end if;
  -- 미인증 계정: 읽기는 되지만 랭킹 지표가 되는 완독은 기록하지 않는다.
  if not public.user_is_verified(v_user) then
    return chapter_reading_snapshot(v_row);
  end if;

  select * into v_cfg from reading_completion_config();
  v_limit_ms := floor(extract(epoch from (now() - v_row.session_started_at)) * 1000)::bigint + v_cfg.active_time_slack_ms;

  if v_row.max_scroll_ratio >= v_cfg.completion_scroll_ratio
    and v_row.end_visible_ms >= v_cfg.end_sentinel_visible_ms
    and v_row.active_ms >= chapter_minimum_reading_ms(v_char_count)
    and v_row.session_active_ms <= v_limit_ms
  then
    update chapter_reading_state set
      completed_at = coalesce(completed_at, now()),
      last_seen_at = now()
    where user_id = v_user and chapter_id = p_chapter_id
    returning * into v_row;
  end if;

  return chapter_reading_snapshot(v_row);
end;
$$;

revoke all on function complete_chapter(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function complete_chapter(uuid, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
