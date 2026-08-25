create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'reader' check (role in ('reader','writer')),
  pen_name text,
  pen_name_bio text,
  pen_name_set_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_pen_name_unique
  on profiles (lower(pen_name))
  where deleted_at is null and pen_name is not null;

create table if not exists wallets (
  id uuid primary key references profiles(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id bigint generated always as identity primary key,
  wallet_id uuid not null references wallets(id),
  delta bigint not null,
  balance_after bigint not null,
  reference_type text not null,
  reference_id text,
  reason text,
  created_at timestamptz not null default now(),
  unique (wallet_id, reference_type, reference_id)
);

create or replace function apply_wallet_delta(
  p_wallet_id uuid, p_delta bigint, p_reference_type text, p_reference_id text, p_reason text
) returns bigint
language plpgsql as $$
declare
  v_balance bigint;
begin
  select balance into v_balance from wallets where id = p_wallet_id for update;
  if v_balance is null then
    raise exception 'wallet % not found', p_wallet_id;
  end if;

  v_balance := v_balance + p_delta;
  if v_balance < 0 then
    raise exception 'insufficient balance';
  end if;

  insert into ledger_entries (wallet_id, delta, balance_after, reference_type, reference_id, reason)
  values (p_wallet_id, p_delta, v_balance, p_reference_type, p_reference_id, p_reason)
  on conflict (wallet_id, reference_type, reference_id) do nothing;

  if not found then
    return (select balance from wallets where id = p_wallet_id);
  end if;

  update wallets set balance = v_balance, updated_at = now() where id = p_wallet_id;
  return v_balance;
end;
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id) values (new.id) on conflict (id) do nothing;
  insert into wallets (id, balance) values (new.id, 0) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

alter table profiles enable row level security;
alter table wallets enable row level security;
alter table ledger_entries enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "wallets_select_own" on wallets;
create policy "wallets_select_own" on wallets for select using (auth.uid() = id);
drop policy if exists "ledger_entries_select_own" on ledger_entries;
create policy "ledger_entries_select_own" on ledger_entries for select
  using (auth.uid() = (select w.id from wallets w where w.id = ledger_entries.wallet_id));
