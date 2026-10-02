-- BUG-01 (Phase 2): atomic chapter creation.
-- createChapter used to read MAX(order_index) and INSERT in two requests, so concurrent creates
-- computed the same order and one failed on chapters_work_order_uniq. This RPC locks the work row,
-- reads the max (deleted chapters keep consuming their order, as before) and inserts in one
-- transaction, so concurrent creates get N, N+1, ...
-- SECURITY DEFINER bypasses RLS, so ownership, write access and the folder are checked here.
-- Browser sessions may only act as themselves (auth.uid()); the service role (no auth.uid())
-- acts for the owner the server action derived from the session.

create or replace function create_chapter_atomic(
  p_owner_id uuid, p_work_id uuid, p_title text, p_folder_id uuid
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_next integer;
  v_id uuid;
begin
  if p_owner_id is null or (v_uid is not null and v_uid is distinct from p_owner_id) then
    raise exception 'write_access_denied';
  end if;
  if not user_can_write(p_owner_id) then
    raise exception 'write_access_denied';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'invalid_title';
  end if;

  perform 1 from works where id = p_work_id and owner_id = p_owner_id and deleted_at is null for update;
  if not found then
    raise exception 'work_not_found';
  end if;

  if p_folder_id is not null and not exists (
    select 1 from kb_nodes
    where id = p_folder_id and work_id = p_work_id and category = '회차'
      and node_type = 'folder' and deleted_at is null
  ) then
    raise exception 'invalid_folder';
  end if;

  select coalesce(max(order_index), -1) + 1 into v_next from chapters where work_id = p_work_id;
  insert into chapters (work_id, title, order_index, folder_id)
  values (p_work_id, p_title, v_next, p_folder_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function create_chapter_atomic(uuid, uuid, text, uuid) from public, anon;
grant execute on function create_chapter_atomic(uuid, uuid, text, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
