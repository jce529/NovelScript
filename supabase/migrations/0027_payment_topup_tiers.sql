-- Phase 05 (D-01 revised): top-up bundles move from a code whitelist to an
-- operator-managed table. 0016 is applied history and stays untouched; this
-- migration seeds the current four bundles verbatim, then swaps the fixed
-- payment_orders.tier_id CHECK for a foreign key. Existing orders keep their
-- amount_krw/token_amount snapshot and timestamps (no UPDATE on payment_orders).
-- Operators manage rows with service_role SQL; there is no browser access.
begin;

create table public.payment_topup_tiers (
  id text primary key
    check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  tokens bigint not null
    check (tokens > 0 and tokens <= 9007199254740991),
  price_krw integer not null check (price_krw > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  label text check (label is null or char_length(label) <= 80),
  label_starts_at timestamptz,
  label_ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payment_topup_tiers_sale_window_check
    check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint payment_topup_tiers_label_window_check
    check (label_starts_at is null or label_ends_at is null or label_starts_at < label_ends_at)
);

-- Seed: exactly the former TOPUP_TIERS rows, same order.
insert into public.payment_topup_tiers (id, tokens, price_krw, sort_order) values
  ('t100', 100, 1000, 10),
  ('t300', 300, 2850, 20),
  ('t550', 550, 5000, 30),
  ('t1000', 1000, 9000, 40);

-- Replace the fixed four-ID CHECK from 0016 (looked up by definition, not by
-- an assumed auto-generated name) with a FK to the operator list.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname from pg_constraint
    where conrelid = 'public.payment_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%tier_id%'
  loop
    execute format('alter table public.payment_orders drop constraint %I', v_constraint.conname);
  end loop;
end
$$;

alter table public.payment_orders
  add constraint payment_orders_tier_id_fkey
  foreign key (tier_id) references public.payment_topup_tiers(id)
  on delete restrict on update restrict;

alter table public.payment_topup_tiers enable row level security;

revoke all on public.payment_topup_tiers from public, anon, authenticated;
grant select, insert, update, delete on public.payment_topup_tiers to service_role;

notify pgrst, 'reload schema';
commit;
