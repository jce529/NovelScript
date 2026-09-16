begin;

-- Phase 7 (07-04): administrator blinding throughout reader access and purchases.
--
-- D-11  admin_blinded (0006) is independent of is_published. Owners cannot write it (column
--       privileges in 0006); only moderation_set_blind (0007) changes it.
-- D-12  A work blind covers every chapter of that work: body RPC, TOC access state, purchases.
-- D-13  Blinding never touches entitlements, orders or ledger rows. Readable state and entitled
--       state are reported separately, so a blinded owned chapter never looks unpaid.
-- D-14  Blinded chapters keep their metadata row (TOC order is unchanged); only the body is
--       withheld.
-- D-15  The owner keeps correction access to the body through read_chapter_content (studio).
--       Public/viewer state still reports 'blinded' for the owner.
--
-- Public access precedence: existence/deletion/publication -> work/chapter blind -> free or
-- entitled. An entitlement never bypasses a blind.
--
-- Column privileges are unchanged: chapters.content stays revoked for anon/authenticated, and
-- the blind metadata columns were already granted in 0006 (works has table-level SELECT).

-- ---------------------------------------------------------------------------
-- 1. Entitlement (independent of blind state)
-- ---------------------------------------------------------------------------
create function chapter_entitled(p_work_id uuid, p_chapter_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and exists(select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null)
    and exists(select 1 from entitlements e where e.user_id = auth.uid() and e.work_id = p_work_id
      and (e.chapter_id is null or e.chapter_id = p_chapter_id)
      and e.revoked_at is null and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now()));
$$;
revoke all on function chapter_entitled(uuid, uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Reader access (blind precedence)
-- ---------------------------------------------------------------------------
create or replace function can_view(p_work_id uuid, p_chapter_id uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w where w.id = p_work_id and w.deleted_at is null and not w.admin_blinded
    and (p_chapter_id is null or exists (
      select 1 from chapters c where c.id = p_chapter_id and c.work_id = w.id
        and c.is_published and c.deleted_at is null and not c.admin_blinded
    ))
    and (
      (p_chapter_id is not null and exists (
        select 1 from chapters c where c.id = p_chapter_id and c.work_id = w.id and c.price_tier is null
      ))
      or chapter_entitled(w.id, p_chapter_id)
    )
  );
$$;

-- Body RPC: public readers need can_view (blind-aware). The owner branch is the narrow
-- correction path (authenticated, non-deleted owner) and also covers drafts.
create or replace function read_chapter_content(p_chapter_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.content from chapters c join works w on w.id = c.work_id
  where c.id = p_chapter_id and c.deleted_at is null and w.deleted_at is null
    and (can_view(c.work_id, c.id) or (
      auth.uid() is not null and w.owner_id = auth.uid() and exists (
        select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null
      )
    ));
$$;

-- Return shape changes (adds entitled/blinded/public reason), so the function is recreated.
drop function list_chapter_access(uuid);
create function list_chapter_access(p_work_id uuid)
returns table(chapter_id uuid, allowed boolean, entitled boolean, blinded boolean, blind_reason text)
language sql stable security definer set search_path = public as $$
  select c.id,
    can_view(c.work_id, c.id),
    chapter_entitled(c.work_id, c.id),
    w.admin_blinded or c.admin_blinded,
    case when w.admin_blinded then w.admin_blind_reason when c.admin_blinded then c.admin_blind_reason end
  from chapters c join works w on w.id = c.work_id
  where c.work_id = p_work_id and c.is_published and c.deleted_at is null and w.deleted_at is null;
$$;

-- Viewer state for one chapter of one work. A wrong work/chapter pair is 'unavailable'.
-- state: readable | purchase_required | blinded | unavailable
create function get_chapter_access_state(p_work_id uuid, p_chapter_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'state', case
        when w.admin_blinded or c.admin_blinded then 'blinded'
        when can_view(w.id, c.id) then 'readable'
        when auth.uid() is not null and w.owner_id = auth.uid()
          and exists(select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null) then 'readable'
        else 'purchase_required' end,
      'blind_scope', case when w.admin_blinded then 'work' when c.admin_blinded then 'chapter' end,
      'blind_reason', case when w.admin_blinded then w.admin_blind_reason
        when c.admin_blinded then c.admin_blind_reason end,
      'entitled', chapter_entitled(w.id, c.id))
    from chapters c join works w on w.id = c.work_id
    where c.id = p_chapter_id and w.id = p_work_id
      and c.is_published and c.deleted_at is null and w.deleted_at is null
  ), jsonb_build_object('state', 'unavailable', 'blind_scope', null, 'blind_reason', null, 'entitled', false));
$$;

revoke all on function can_view(uuid,uuid), read_chapter_content(uuid), list_chapter_access(uuid),
  get_chapter_access_state(uuid, uuid) from public;
grant execute on function can_view(uuid,uuid), read_chapter_content(uuid), list_chapter_access(uuid),
  get_chapter_access_state(uuid, uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Purchases (0008 bodies + blind check under the existing content share locks)
-- ---------------------------------------------------------------------------
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

  -- Lock the authoritative rows before taking price/terms snapshots. A blind (UPDATE on the
  -- same rows) waits for this transaction, or this lock waits for the blind to commit.
  perform c.id from chapters c join works w on w.id = c.work_id
    where c.id = any(p_chapter_ids) order by c.id for share of c, w;
  select count(*), sum(c.price_tier) into v_count, v_total
    from chapters c join works w on w.id = c.work_id
    where c.id = any(p_chapter_ids) and c.is_published and c.deleted_at is null
      and w.deleted_at is null and c.price_tier is not null;
  if v_count <> cardinality(p_chapter_ids) then raise exception 'content_unavailable'; end if;
  if exists(select 1 from chapters c join works w on w.id = c.work_id
      where c.id = any(p_chapter_ids) and (c.admin_blinded or w.admin_blinded))
    then raise exception 'content_blinded'; end if;
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
  -- Idempotent retry of an already settled order (even if blinded since): no second debit.
  if v_order.status = 'PAID' then return v_order.id; end if;
  if v_order.status <> 'PENDING' then raise exception 'order_not_pending'; end if;
  perform c.id from order_items i join chapters c on c.id = i.chapter_id
    join works w on w.id = c.work_id where i.order_id = p_order_id
    order by c.id for share of c, w;
  -- Orders created before a blind are rejected here, before any debit; the order stays PENDING
  -- and can be settled after an unblind.
  if exists(select 1 from order_items i join chapters c on c.id = i.chapter_id
      join works w on w.id = i.work_id where i.order_id = p_order_id
      and (c.admin_blinded or w.admin_blinded))
    then raise exception 'content_blinded'; end if;
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
