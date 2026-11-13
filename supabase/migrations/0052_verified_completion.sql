begin;

-- 미인증 계정 완독 제외 (랭킹 지표 어뷰징 방지).
-- 일회용 DB(anzafn)에 파일 없이 먼저 적용돼 있던 정의를 저장소로 가져오고, 그 정의가
-- 0039가 넣은 OAuth 차단 가드(D-17)를 덮어쓴 것을 되돌린다.
--
-- 인증 기준: 소셜(google·kakao) 연동 identity가 있거나 휴대폰 인증을 마친 계정.
-- 미인증 계정도 읽기와 진행도 저장은 그대로 되고, completed_at 기록만 하지 않는다.
-- 이미 완독으로 기록된 행은 건드리지 않는다.

-- 1) 판정 함수. auth 스키마를 읽으므로 SECURITY DEFINER + 빈 search_path.
--    complete_chapter(SECURITY DEFINER, 소유자 postgres)만 호출하므로 어떤 역할에도
--    EXECUTE를 주지 않는다. authenticated에 열면 임의 사용자의 소셜·휴대폰 인증 여부를
--    조회할 수 있게 된다(0039 mcp_reject_oauth_caller와 같은 방식).
create or replace function public.user_is_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    exists (select 1 from auth.identities i
            where i.user_id = p_user and i.provider in ('google', 'kakao'))
    or exists (select 1 from auth.users u
               where u.id = p_user and u.phone_confirmed_at is not null)
  );
$$;

revoke all on function public.user_is_verified(uuid)
  from public, anon, authenticated, service_role;

-- 2) complete_chapter: 0025 본문 + 미인증 계정 건너뛰기 + 0039 OAuth 가드 첫 문장.
create or replace function public.complete_chapter(p_work_id uuid, p_chapter_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
  v_char_count integer;
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

  v_limit_ms := floor(extract(epoch from (now() - v_row.session_started_at)) * 1000)::bigint + 5000;

  if v_row.max_scroll_ratio >= 0.98
    and v_row.end_visible_ms >= 1000
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

revoke all on function public.complete_chapter(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_chapter(uuid, uuid, uuid)
  to authenticated;

notify pgrst, 'reload schema';
commit;
