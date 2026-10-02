-- BUG-02 (Phase 3): atomic reader toggles.
-- The select-then-insert/delete in lib/reader/* let two concurrent toggles read the same state and
-- apply the same action. Each RPC serializes toggles for one (work, user) pair with a transaction
-- advisory lock, flips the row, and returns the real resulting state (true = row now exists).
-- The lock is per (table, work, user) so different users of a popular work never wait on each other.
-- SECURITY DEFINER bypasses RLS, so the caller is taken from auth.uid() (never an argument) and the
-- write guard (user_can_write, 0008) is checked explicitly.

do $$
declare
  v_table text;
  v_fn text;
begin
  foreach v_table in array array['work_likes', 'work_bookmarks', 'work_subscriptions'] loop
    v_fn := 'toggle_' || v_table;
    execute format($f$
      create or replace function %I(p_work_id uuid) returns boolean
      language plpgsql security definer set search_path = public as $body$
      declare
        v_uid uuid := auth.uid();
      begin
        if v_uid is null or not user_can_write(v_uid) then
          raise exception 'write_access_denied';
        end if;
        perform pg_advisory_xact_lock(hashtextextended(%L || ':' || p_work_id::text || ':' || v_uid::text, 0));
        delete from %I where work_id = p_work_id and user_id = v_uid;
        if found then
          return false;
        end if;
        insert into %I (work_id, user_id) values (p_work_id, v_uid);
        return true;
      end;
      $body$;
    $f$, v_fn, v_table, v_table, v_table);
    execute format('revoke all on function %I(uuid) from public, anon', v_fn);
    execute format('grant execute on function %I(uuid) to authenticated', v_fn);
  end loop;
end;
$$;
