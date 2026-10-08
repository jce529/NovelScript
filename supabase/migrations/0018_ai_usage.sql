begin;

-- 계획 이전 초안 스키마(시험 호출 3행)가 원격에 있었다. Phase 11 계약으로 재생성한다 (2026-10-08 사용자 승인).
drop table if exists public.ai_usage cascade;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  model text not null check (char_length(model) between 1 and 120),
  key_source text not null check (key_source in ('service', 'byok')),
  status text not null check (status in ('completed', 'refused')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thoughts_tokens integer not null default 0 check (thoughts_tokens >= 0),
  input_reported boolean not null default false,
  output_reported boolean not null default false,
  work_id uuid references public.works(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

comment on table public.ai_usage is
  'AI usage telemetry only. This table is not authoritative for settlement or accounting.';

create index if not exists ai_usage_owner_source_created_idx
  on public.ai_usage(owner_id, key_source, created_at);
create index if not exists ai_usage_owner_provider_model_created_idx
  on public.ai_usage(owner_id, provider, model, created_at);

alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage for select
  using (auth.uid() = owner_id);
revoke all on public.ai_usage from public, anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert on public.ai_usage to service_role;

create or replace function public.mark_byok_failed(
  p_owner uuid, p_provider text, p_expected_key_id uuid
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_updated integer;
begin
  update public.byok_keys
    set status = 'failed'
    where owner_id = p_owner
      and provider = p_provider
      and id = p_expected_key_id
      and status = 'connected';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.mark_byok_failed(uuid, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_byok_failed(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
