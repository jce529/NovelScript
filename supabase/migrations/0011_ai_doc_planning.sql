begin;
-- Phase 15 (AIDOC-04): persistent activation evidence and content-free behavior logs.
create table ai_doc_activation_approvals (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind = 'policy_review'),
  approved_by text not null, model_version text not null, dataset_hash text not null,
  approved_thresholds jsonb not null, notes text, approved_at timestamptz not null default now(), revoked_at timestamptz
);
create table ai_doc_activation_evidence (
  id uuid primary key default gen_random_uuid(), model_version text not null, dataset_hash text not null,
  evaluator_version text not null, used_real_vendor boolean not null,
  split text not null check (split in ('calibration','holdout')), sample_size integer not null,
  metrics jsonb not null, passed boolean not null, recorded_at timestamptz not null default now()
);
create index ai_doc_activation_evidence_lookup_idx on ai_doc_activation_evidence (model_version, dataset_hash, evaluator_version, recorded_at desc);
create table ai_doc_plan_shadow_log (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id) on delete cascade,
  work_id uuid not null references works(id) on delete cascade, scenario_id text not null, bucket text not null,
  model_version text not null, status text not null check (status in ('ok','error')), error_kind text,
  task_decision text, task_confidence numeric, category_decision text, category_confidence numeric,
  expected_task text, expected_category text, task_correct boolean, folder_fallback boolean, template_fallback boolean,
  call_count integer not null, latency_ms integer not null, estimated_cost_usd numeric,
  applied boolean not null default false check (applied = false), created_at timestamptz not null default now()
);
create index ai_doc_plan_shadow_log_model_created_idx on ai_doc_plan_shadow_log (model_version, created_at desc);
create table ai_doc_plan_decision_log (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles(id) on delete cascade,
  work_id uuid not null references works(id) on delete cascade, node_id uuid references kb_nodes(id) on delete set null,
  recommended_folder_id uuid, actual_folder_id uuid not null, recommended_template_id uuid, actual_template_id uuid,
  folder_changed boolean not null, template_changed boolean not null, accepted boolean not null,
  regenerated boolean not null default false, created_at timestamptz not null default now()
);
alter table ai_doc_activation_approvals enable row level security;
alter table ai_doc_activation_evidence enable row level security;
alter table ai_doc_plan_shadow_log enable row level security;
alter table ai_doc_plan_decision_log enable row level security;
create policy ai_doc_plan_shadow_log_owner_select on ai_doc_plan_shadow_log for select using (owner_id = auth.uid());
create policy ai_doc_plan_decision_log_owner_select on ai_doc_plan_decision_log for select using (owner_id = auth.uid());
create or replace function purge_ai_doc_plan_logs(p_retention_days integer default 90)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from ai_doc_plan_shadow_log where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_count = row_count;
  delete from ai_doc_plan_decision_log where created_at < now() - make_interval(days => p_retention_days);
  return v_count;
end;
$$;
revoke all on function purge_ai_doc_plan_logs(integer) from public, anon, authenticated;
commit;
