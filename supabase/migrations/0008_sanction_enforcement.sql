begin;

-- Phase 7 (07-03): effective suspension enforcement at the database boundary.
--
-- D-07  A suspended user keeps reading (free chapters, entitlements, wallet/ledger SELECT)
--       while every user-initiated write is denied.
-- D-08  Expiry is evaluated against DB now() at access time. sanctioned_until = now() is
--       already expired (allowed). No cleanup job exists or is needed. Permanent suspension
--       is the explicit 'permanent_suspension' kind, never a null timestamp.
-- D-09  acknowledge_warning (0006) stays callable during suspension; it never touches the
--       sanction history or cache.
-- D-10  SELECT policies are not changed, so a suspended author's published works stay public.
--
-- Mechanism: RESTRICTIVE row-level policies for INSERT/UPDATE/DELETE. Restrictive policies are
-- AND-ed with every permissive policy (including the FOR ALL owner policies from 0002/0003), so
-- no alternate permissive policy can OR around the restriction. SECURITY DEFINER write RPCs
-- bypass RLS and therefore check write access explicitly below.
--
-- Account-control exceptions (not guarded): login/logout (auth schema), acknowledge_warning,
-- and account self-deletion (softDeleteAccount runs with the service role and only sets
-- profiles.deleted_at/pen_name_bio; it never mutates sanctions, wallets or ledger rows).

-- ---------------------------------------------------------------------------
-- 1. Effective write permission (single definition)
-- ---------------------------------------------------------------------------
create function user_can_write(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_user_id and p.deleted_at is null
      and (p.sanction_kind = 'none'
        or (p.sanction_kind = 'suspension' and p.sanctioned_until <= now()))
  );
$$;

create function current_user_can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and user_can_write(auth.uid());
$$;

-- Server guard entry point. Browser sessions may only ask about themselves; the service role
-- (no auth.uid()) may ask about the user a server action derived from the session.
create function get_write_access(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
begin
  if p_user_id is null or (v_uid is not null and v_uid is distinct from p_user_id) then
    return jsonb_build_object('can_write', false, 'reason', 'forbidden', 'sanctioned_until', null);
  end if;
  select * into v_profile from profiles where id = p_user_id and deleted_at is null;
  if not found then
    return jsonb_build_object('can_write', false, 'reason', 'not_found', 'sanctioned_until', null);
  end if;
  if v_profile.sanction_kind = 'permanent_suspension' then
    return jsonb_build_object('can_write', false, 'reason', 'permanent_suspension', 'sanctioned_until', null);
  end if;
  if v_profile.sanction_kind = 'suspension' and v_profile.sanctioned_until > now() then
    return jsonb_build_object('can_write', false, 'reason', 'suspended',
      'sanctioned_until', v_profile.sanctioned_until);
  end if;
  return jsonb_build_object('can_write', true, 'reason', 'ok', 'sanctioned_until', null);
end;
$$;

revoke all on function user_can_write(uuid), current_user_can_write(), get_write_access(uuid)
  from public, anon, authenticated, service_role;
-- Policy expressions run with the caller's privileges, so every API role needs EXECUTE here.
grant execute on function current_user_can_write() to anon, authenticated, service_role;
grant execute on function get_write_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Restrictive write policies (INSERT/UPDATE/DELETE separately; SELECT untouched)
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'works', 'chapters', 'kb_nodes', 'profiles',
    'work_likes', 'work_bookmarks', 'work_subscriptions', 'reading_progress',
    'reports', 'moderation_review_requests'
  ] loop
    execute format('create policy %I on %I as restrictive for insert with check (current_user_can_write())',
      v_table || '_write_access_insert', v_table);
    execute format('create policy %I on %I as restrictive for update using (current_user_can_write()) with check (current_user_can_write())',
      v_table || '_write_access_update', v_table);
    execute format('create policy %I on %I as restrictive for delete using (current_user_can_write())',
      v_table || '_write_access_delete', v_table);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER write RPCs (bypass RLS, so they check explicitly)
-- ---------------------------------------------------------------------------

-- View counter: anonymous opens still count; a suspended (or deleted) signed-in reader's open
-- is silently skipped so the chapter read itself never fails.
create or replace function increment_chapter_view(p_chapter_id uuid) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not user_can_write(auth.uid()) then
    return;
  end if;
  update chapters
  set view_count = view_count + 1
  where id = p_chapter_id and is_published = true and deleted_at is null;
end;
$$;

-- KB soft delete (latest body from 0004) + write access. Browser callers may only delete their
-- own nodes (previously any caller could pass another owner's ID). Anonymous callers removed.
create or replace function soft_delete_kb_node(p_node_id uuid, p_owner_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if (auth.uid() is not null and auth.uid() is distinct from p_owner_id)
    or not user_can_write(p_owner_id) then
    raise exception 'write_access_denied';
  end if;

  update chapters set folder_id = null where folder_id = p_node_id
    and exists (select 1 from kb_nodes k where k.id = p_node_id and k.owner_id = p_owner_id);

  update kb_nodes set deleted_at = now()
  where id = p_node_id and owner_id = p_owner_id and deleted_at is null
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function soft_delete_kb_node(uuid, uuid) from public, anon;
grant execute on function soft_delete_kb_node(uuid, uuid) to authenticated, service_role;

-- Purchases (0005 bodies, unchanged apart from the write-access check after authentication).
create or replace function create_purchase_order(p_chapter_ids uuid[], p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order uuid;
  v_total bigint;
  v_count integer;
begin
  -- One wallet lock serializes both order creation and settlement per user.
  perform 1 from profiles where id = v_user and deleted_at is null for share;
  if not found then raise exception 'authentication_required'; end if;
  -- Profile row is share-locked above, so a concurrent sanction waits for this purchase.
  if not user_can_write(v_user) then raise exception 'write_access_denied'; end if;
  perform 1 from wallets where id = v_user for update;
  if not found then raise exception 'wallet_not_found'; end if;
  if p_idempotency_key is null or cardinality(p_chapter_ids) is null
    or cardinality(p_chapter_ids) not between 1 and 100
    or exists(select 1 from unnest(p_chapter_ids) x where x is null)
    or cardinality(p_chapter_ids) <> (select count(distinct x) from unnest(p_chapter_ids) x)
  then raise exception 'invalid_items'; end if;

  select id into v_order from orders where user_id = v_user and idempotency_key = p_idempotency_key;
  if found then
    if (select array_agg(chapter_id order by chapter_id) from order_items where order_id = v_order)
      is distinct from (select array_agg(x order by x) from unnest(p_chapter_ids) x)
    then raise exception 'idempotency_conflict'; end if;
    return v_order;
  end if;

  -- Lock the authoritative rows before taking price/terms snapshots.
  perform c.id from chapters c join works w on w.id = c.work_id
    where c.id = any(p_chapter_ids) order by c.id for share of c, w;
  select count(*), sum(c.price_tier) into v_count, v_total
    from chapters c join works w on w.id = c.work_id
    where c.id = any(p_chapter_ids) and c.is_published and c.deleted_at is null
      and w.deleted_at is null and c.price_tier is not null;
  if v_count <> cardinality(p_chapter_ids) then raise exception 'content_unavailable'; end if;
  if exists(select 1 from chapters c where c.id = any(p_chapter_ids) and can_view(c.work_id, c.id))
    then raise exception 'already_entitled'; end if;

  insert into orders(user_id, total_amount, idempotency_key)
    values(v_user, v_total, p_idempotency_key) returning id into v_order;
  insert into order_items(order_id, work_id, chapter_id, price, conditions)
    select v_order, work_id, id, price_tier,
      jsonb_build_object('title', title, 'currency', 'TOKEN', 'scope', 'CHAPTER', 'duration', 'PERMANENT')
    from chapters where id = any(p_chapter_ids);
  return v_order;
end;
$$;

create or replace function pay_purchase_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order orders%rowtype;
begin
  perform 1 from profiles where id = v_user and deleted_at is null for share;
  if not found then raise exception 'authentication_required'; end if;
  if not user_can_write(v_user) then raise exception 'write_access_denied'; end if;
  perform 1 from wallets where id = v_user for update;
  if not found then raise exception 'wallet_not_found'; end if;
  select * into v_order from orders where id = p_order_id and user_id = v_user for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'PAID' then return v_order.id; end if;
  if v_order.status <> 'PENDING' then raise exception 'order_not_pending'; end if;
  perform c.id from order_items i join chapters c on c.id = i.chapter_id
    join works w on w.id = c.work_id where i.order_id = p_order_id
    order by c.id for share of c, w;
  if not exists(select 1 from order_items where order_id = p_order_id)
    or exists(select 1 from order_items i join chapters c on c.id = i.chapter_id
      join works w on w.id = i.work_id where i.order_id = p_order_id
      and (not c.is_published or c.deleted_at is not null or w.deleted_at is not null
        or c.price_tier is null or can_view(i.work_id, i.chapter_id)))
    then raise exception 'content_unavailable_or_owned'; end if;

  perform apply_wallet_delta(v_user, -v_order.total_amount, 'CONTENT_ORDER', p_order_id::text, '회차 소장');
  update orders set status = 'PAID', paid_at = now() where id = p_order_id;
  insert into entitlements(user_id, work_id, chapter_id, entitlement_type, source_type, source_id, order_item_id)
    select v_user, work_id, chapter_id, 'PERMANENT', 'ORDER_ITEM', id::text, id
    from order_items where order_id = p_order_id;
  return p_order_id;
end;
$$;

notify pgrst, 'reload schema';
commit;
