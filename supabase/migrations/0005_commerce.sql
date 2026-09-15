begin;

-- Existing profiles/auth.users and works/chapters remain the source of identity.
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  status text not null default 'PENDING' check (status in ('PENDING','PAID','CANCELLED','REFUNDED')),
  total_amount bigint not null check (total_amount > 0),
  currency text not null default 'TOKEN' check (currency = 'TOKEN'),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status in ('PAID','REFUNDED')) = (paid_at is not null))
);
create index orders_user_created_idx on orders(user_id, created_at desc);
alter table chapters add constraint chapters_id_work_unique unique(id, work_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id),
  work_id uuid not null references works(id),
  chapter_id uuid,
  purchase_type text not null default 'PERMANENT',
  price bigint not null check (price > 0),
  conditions jsonb not null default '{}',
  foreign key (chapter_id, work_id) references chapters(id, work_id),
  unique(order_id, chapter_id)
);
create index order_items_order_idx on order_items(order_id);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  work_id uuid not null references works(id),
  chapter_id uuid,
  entitlement_type text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  source_type text not null,
  source_id text not null,
  order_item_id uuid unique references order_items(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (chapter_id, work_id) references chapters(id, work_id),
  check (expires_at is null or expires_at > starts_at),
  check (source_type <> 'ORDER_ITEM' or (order_item_id is not null and source_id = order_item_id::text))
);
create index entitlements_user_work_idx on entitlements(user_id, work_id, chapter_id)
  where revoked_at is null;

alter table orders enable row level security;
alter table order_items enable row level security;
alter table entitlements enable row level security;
create policy orders_read_own on orders for select using (user_id = auth.uid());
create policy order_items_read_own on order_items for select using (
  exists(select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy entitlements_read_own on entitlements for select using (user_id = auth.uid());
revoke all on orders, order_items, entitlements from anon, authenticated;
grant select on orders, order_items, entitlements to authenticated;
grant all on orders, order_items, entitlements to service_role;

-- No purchase-type branching: all grants obey the same time/scope/revocation rules.
-- Null chapter means a work-wide grant, including future published chapters.
create function can_view(p_work_id uuid, p_chapter_id uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from works w where w.id = p_work_id and w.deleted_at is null
    and (p_chapter_id is null or exists (
      select 1 from chapters c where c.id = p_chapter_id and c.work_id = w.id
        and c.is_published and c.deleted_at is null
    ))
    and (
      (p_chapter_id is not null and exists (
        select 1 from chapters c where c.id = p_chapter_id and c.price_tier is null
      ))
      or (exists(select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null)
        and exists(select 1 from entitlements e where e.user_id = auth.uid() and e.work_id = w.id
          and (e.chapter_id is null or e.chapter_id = p_chapter_id)
          and e.revoked_at is null and e.starts_at <= now()
          and (e.expires_at is null or e.expires_at > now())))
    )
  );
$$;

-- Keep metadata visible to discovery/TOC. PostgreSQL column privileges protect
-- content even through direct PostgREST queries, filters and embedded relations.
revoke select on chapters from anon, authenticated;
revoke select(content) on chapters from anon, authenticated;
grant select(id, work_id, title, order_index, is_published, price_tier,
  published_at, unpublished_at, created_at, updated_at, deleted_at, view_count, folder_id)
  on chapters to anon, authenticated;

create function read_chapter_content(p_chapter_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select c.content from chapters c join works w on w.id = c.work_id
  where c.id = p_chapter_id and c.deleted_at is null and w.deleted_at is null
    and (can_view(c.work_id, c.id) or (
      w.owner_id = auth.uid() and exists (
        select 1 from profiles p where p.id = auth.uid() and p.deleted_at is null
      )
    ));
$$;

create function list_chapter_access(p_work_id uuid) returns table(chapter_id uuid, allowed boolean)
language sql stable security definer set search_path = public as $$
  select c.id, can_view(c.work_id, c.id) from chapters c join works w on w.id = c.work_id
  where c.work_id = p_work_id and c.is_published and c.deleted_at is null and w.deleted_at is null;
$$;

create function create_purchase_order(p_chapter_ids uuid[], p_idempotency_key uuid) returns uuid
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

create function pay_purchase_order(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_order orders%rowtype;
begin
  perform 1 from profiles where id = v_user and deleted_at is null for share;
  if not found then raise exception 'authentication_required'; end if;
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

-- Existing wallet RPC accepts arbitrary IDs/deltas; it must never be callable
-- by browser roles, otherwise users could mint the credits used for purchases.
revoke execute on function apply_wallet_delta(uuid,bigint,text,text,text) from public, anon, authenticated;
grant execute on function apply_wallet_delta(uuid,bigint,text,text,text) to service_role;
revoke all on function can_view(uuid,uuid), read_chapter_content(uuid), list_chapter_access(uuid),
  create_purchase_order(uuid[],uuid), pay_purchase_order(uuid) from public;
grant execute on function can_view(uuid,uuid), read_chapter_content(uuid), list_chapter_access(uuid) to anon, authenticated, service_role;
grant execute on function create_purchase_order(uuid[],uuid), pay_purchase_order(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
