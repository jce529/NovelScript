begin;

-- Phase 3 Reopen (03-12, READ-04): server-side chapter completion.
--
-- complete_chapter decides completion only from values the server already stored:
--   * chapter_reading_state (0024): max_scroll_ratio, end_visible_ms, active_ms, session_active_ms,
--     session_started_at, written exclusively by open_chapter_reading / save_chapter_reading.
--   * chapters.char_count (0024): generated from the plain-text body, never granted to API roles.
-- The caller sends no active time, char count, completion timestamp or user id.
--
-- Provisional thresholds (LOW confidence; same values as lib/reader/completion.ts, pinned by
-- tests/reader/completion-migration.test.ts). Every threshold is inclusive ("이상"):
--   minimum active ms = max(30000, ceil(char_count / 1200 * 60000 * 0.5))
--   max_scroll_ratio >= 0.98, latest end_visible_ms >= 1000,
--   session_active_ms <= DB session elapsed + 5000 ms (defence in depth; save already enforces it).
--
-- Idempotence: completed_at = coalesce(completed_at, now()). A retry, a replay or a later visit
-- keeps the first completion time, and this RPC never touches active_ms, so a resend cannot
-- double-count reading time.
--
-- Unmet conditions are a normal not-complete snapshot. Access failures raise the stable 0024 codes
-- (authentication_required | invalid_input | write_access_denied | chapter_unavailable |
-- chapter_not_readable) from the shared gate, which takes the profile and chapter/work share locks
-- (0008/0009 order) before this function locks the state row FOR UPDATE, the same order as save.
--
-- No table, column, policy, profiles or ranking change. No completion/retention metric is derived.

-- ---------------------------------------------------------------------------
-- 1. Minimum reading time (internal helper, exact numeric arithmetic)
-- ---------------------------------------------------------------------------
create or replace function chapter_minimum_reading_ms(p_char_count integer) returns bigint
language sql immutable set search_path = public as $$
  select greatest(30000, ceil(greatest(coalesce(p_char_count, 0), 0)::numeric * 60000 * 0.5 / 1200))::bigint;
$$;
revoke all on function chapter_minimum_reading_ms(integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. complete_chapter: judge the current visit from stored values
-- ---------------------------------------------------------------------------
create or replace function complete_chapter(p_work_id uuid, p_chapter_id uuid, p_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_row chapter_reading_state%rowtype;
  v_char_count integer;
  v_limit_ms bigint;
begin
  -- auth.uid, non-deleted profile (share lock), write guard, real pair (share locks), readable
  -- (blind first, entitlement/revocation via get_chapter_access_state).
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
  -- Already complete (keep the first time) or not the currently open visit (late/spoofed call).
  if v_row.completed_at is not null or v_row.session_id is distinct from p_session_id then
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

notify pgrst, 'reload schema';
commit;
