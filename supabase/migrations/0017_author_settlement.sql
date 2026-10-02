begin;

-- Phase 6 / Success Criterion 3: author 90% / platform 10% settlement.
-- The 90/10 split is PROVISIONAL (06-CONTEXT.md D-10). This function is the ONE place
-- the rate lives; change the return value (basis points, 10000 = 100%) to adjust it.
-- Already-settled orders keep the rate stored in their own order_items snapshot.
create function settlement_author_rate_bps() returns integer
language sql immutable as $$ select 9000 $$;

-- Per-item distribution snapshot, written at settlement time. Legacy PAID orders
-- (settled before this migration) keep NULLs: they were never split.
alter table order_items
  add column author_id uuid references profiles(id),
  add column author_rate_bps integer,
  add column author_amount bigint,
  add column platform_fee bigint,
  add constraint order_items_settlement_consistent check (
    (author_id is null and author_rate_bps is null and author_amount is null and platform_fee is null)
    or (author_id is not null and author_rate_bps between 0 and 10000
      and author_amount >= 0 and platform_fee >= 0 and author_amount + platform_fee = price)
  );
create index order_items_author_idx on order_items(author_id) where author_id is not null;

-- Same body as 0009 plus: lock buyer+author wallets in id order (no cross-purchase
-- deadlock), snapshot the split per item, and credit each author once per order.
create or replace function pay_purchase_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order orders%rowtype;
  v_rate integer := settlement_author_rate_bps();
  v_author record;
begin
  perform 1 from profiles where id = v_user and deleted_at is null for share;
  if not found then raise exception 'authentication_required'; end if;
  if not user_can_write(v_user) then raise exception 'write_access_denied'; end if;
  perform 1 from orders where id = p_order_id and user_id = v_user;
  if not found then raise exception 'order_not_found'; end if;

  -- Buyer and every author wallet, locked in a single global (id) order.
  insert into wallets(id, balance)
    select distinct w.owner_id, 0 from order_items i join works w on w.id = i.work_id
    where i.order_id = p_order_id on conflict (id) do nothing;
  perform 1 from wallets
    where id = v_user or id in (
      select w.owner_id from order_items i join works w on w.id = i.work_id where i.order_id = p_order_id)
    order by id for update;
  if not exists(select 1 from wallets where id = v_user) then raise exception 'wallet_not_found'; end if;

  select * into v_order from orders where id = p_order_id and user_id = v_user for update;
  -- Idempotent retry of an already settled order (even if blinded since): no second debit or credit.
  if v_order.status = 'PAID' then return v_order.id; end if;
  if v_order.status <> 'PENDING' then raise exception 'order_not_pending'; end if;
  perform c.id from order_items i join chapters c on c.id = i.chapter_id
    join works w on w.id = c.work_id where i.order_id = p_order_id
    order by c.id for share of c, w;
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

  -- Purchase-time distribution snapshot. Author gets the rounded-down share; the
  -- platform keeps the remainder, so author_amount + platform_fee = price always holds.
  update order_items i set
    author_id = w.owner_id,
    author_rate_bps = v_rate,
    author_amount = (i.price * v_rate) / 10000,
    platform_fee = i.price - (i.price * v_rate) / 10000
  from works w where w.id = i.work_id and i.order_id = p_order_id;

  perform apply_wallet_delta(v_user, -v_order.total_amount, 'CONTENT_ORDER', p_order_id::text, '회차 소장');
  for v_author in
    select author_id, sum(author_amount)::bigint as amount from order_items
    where order_id = p_order_id group by author_id order by author_id
  loop
    if v_author.amount > 0 then
      perform apply_wallet_delta(v_author.author_id, v_author.amount, 'CONTENT_SALE', p_order_id::text, '회차 판매 수익');
    end if;
  end loop;

  update orders set status = 'PAID', paid_at = now() where id = p_order_id;
  insert into entitlements(user_id, work_id, chapter_id, entitlement_type, source_type, source_id, order_item_id)
    select v_user, work_id, chapter_id, 'PERMANENT', 'ORDER_ITEM', id::text, id
    from order_items where order_id = p_order_id;
  return p_order_id;
end;
$$;

revoke all on function settlement_author_rate_bps() from public;
grant execute on function settlement_author_rate_bps() to service_role;
revoke all on function pay_purchase_order(uuid) from public;
grant execute on function pay_purchase_order(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
