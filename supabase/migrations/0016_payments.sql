begin;

create table public.payment_orders (
  order_id text primary key
    check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tier_id text not null check (tier_id in ('t100', 't300', 't550', 't1000')),
  amount_krw integer not null check (amount_krw > 0),
  token_amount bigint not null check (token_amount > 0),
  payment_key text,
  confirm_idempotency_key uuid not null default gen_random_uuid(),
  return_path text not null default '/'
    check (return_path like '/%' and return_path not like '//%'),
  authenticated_at timestamptz,
  confirmed_at timestamptz,
  credited_at timestamptz,
  failed_at timestamptz,
  fail_code text,
  fail_message text
);

create index payment_orders_user_id_idx on public.payment_orders(user_id);

alter table public.payment_orders enable row level security;
create policy payment_orders_select_own on public.payment_orders
  for select using (auth.uid() = user_id);

revoke all on public.payment_orders from public, anon, authenticated;
grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;

notify pgrst, 'reload schema';
commit;
