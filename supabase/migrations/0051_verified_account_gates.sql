-- 0051: 본인 확인(소셜 카카오·구글 또는 번호 인증) 없는 계정의 제한.
--  1) 랭킹 입력 지표(조회수·완독 기록)는 미인증 로그인 계정의 행동을 새로 쌓지 않는다. 기존 누적값은 그대로.
--  2) 미인증 계정은 회차를 유료(price_tier not null)로 발행할 수 없다. 무료 발행·초안·AI 작성은 그대로.
-- 이메일 인증은 별개이며 여기서 인증 수단으로 치지 않는다.
begin;

create or replace function user_is_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user is not null and (
    exists (select 1 from auth.identities i where i.user_id = p_user and i.provider in ('google', 'kakao'))
    or exists (select 1 from auth.users u where u.id = p_user and u.phone_confirmed_at is not null)
  );
$$;
revoke all on function user_is_verified(uuid) from public, anon;
grant execute on function user_is_verified(uuid) to authenticated, service_role;

-- 본인용 질의(서버 액션이 세션으로 호출). 다른 사용자의 상태는 묻지 못한다.
create or replace function is_verified_account() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.user_is_verified(auth.uid()); $$;
revoke all on function is_verified_account() from public, anon;
grant execute on function is_verified_account() to authenticated;

-- 1a) 조회수: 미인증 로그인 계정은 세지 않는다 (anon은 식별 불가라 기존대로).
create or replace function increment_chapter_view(p_chapter_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and (not user_can_write(v_uid) or not user_is_verified(v_uid)) then
    return;
  end if;
  update chapters c
     set view_count = c.view_count + 1
    from works w
   where c.id = p_chapter_id and c.is_published = true and c.deleted_at is null and not c.admin_blinded
     and w.id = c.work_id and world_work_reader_visible(w.id)
     and (v_uid is null or w.owner_id <> v_uid);
end;
$$;
revoke all on function increment_chapter_view(uuid) from public;
grant execute on function increment_chapter_view(uuid) to anon, authenticated;

-- 1b) 완독 기록(향후 완독률·연독률의 원천): 미인증 계정은 완독 시각을 남기지 않는다.
create or replace function complete_chapter(p_work_id uuid, p_chapter_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
  v_char_count integer;
  v_limit_ms bigint;
begin
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
  if not user_is_verified(v_user) then
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
revoke all on function complete_chapter(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function complete_chapter(uuid, uuid, uuid)
  to authenticated;

-- 2) 유료 발행 차단: 브라우저 세션(auth.uid 있음)만 대상. service_role·관리 경로는 통과.
create or replace function enforce_verified_for_paid_chapter() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.is_published and new.price_tier is not null
     and (tg_op = 'INSERT' or not old.is_published or old.price_tier is distinct from new.price_tier)
     and not user_is_verified(auth.uid())
  then
    raise exception 'verification_required_for_paid' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function enforce_verified_for_paid_chapter() from public, anon, authenticated;

drop trigger if exists chapters_verified_paid_gate on chapters;
create trigger chapters_verified_paid_gate
  before insert or update on chapters
  for each row execute function enforce_verified_for_paid_chapter();

notify pgrst, 'reload schema';
commit;
