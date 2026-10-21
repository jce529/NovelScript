begin;

-- Phase 04 Reopen (04-08): per-work custom AI system instruction (작품별 추가 지시).
--
-- Why a separate table: `works` has a public SELECT policy since 0003 (published works are
-- readable by anyone), so an author's private instruction must not live in a works column.
-- `profiles` is not touched, so the 0006 column grants are unchanged.
--
-- Shape:
--   * one row per work, created lazily on first save. A missing row means "no instruction" ("").
--   * an empty string is a valid stored value and also means "no instruction" (해제).
--   * only the owner of a non-deleted work may read or write it; anon/PUBLIC get nothing.
--   * the 0008 restrictive write-access guards apply so a suspended author cannot write directly.

create table if not exists public.work_ai_instructions (
  work_id uuid primary key references public.works(id) on delete cascade,
  instruction text not null default '' check (char_length(instruction) <= 4000),
  updated_at timestamptz not null default now()
);

alter table public.work_ai_instructions enable row level security;

drop policy if exists work_ai_instructions_owner_select on public.work_ai_instructions;
create policy work_ai_instructions_owner_select on public.work_ai_instructions for select
  to authenticated using (
    exists (select 1 from public.works w
            where w.id = work_id and w.owner_id = auth.uid() and w.deleted_at is null)
  );

drop policy if exists work_ai_instructions_owner_insert on public.work_ai_instructions;
create policy work_ai_instructions_owner_insert on public.work_ai_instructions for insert
  to authenticated with check (
    exists (select 1 from public.works w
            where w.id = work_id and w.owner_id = auth.uid() and w.deleted_at is null)
  );

drop policy if exists work_ai_instructions_owner_update on public.work_ai_instructions;
create policy work_ai_instructions_owner_update on public.work_ai_instructions for update
  to authenticated using (
    exists (select 1 from public.works w
            where w.id = work_id and w.owner_id = auth.uid() and w.deleted_at is null)
  ) with check (
    exists (select 1 from public.works w
            where w.id = work_id and w.owner_id = auth.uid() and w.deleted_at is null)
  );

drop policy if exists work_ai_instructions_owner_delete on public.work_ai_instructions;
create policy work_ai_instructions_owner_delete on public.work_ai_instructions for delete
  to authenticated using (
    exists (select 1 from public.works w
            where w.id = work_id and w.owner_id = auth.uid() and w.deleted_at is null)
  );

-- 0008 pattern, new table only: restrictive guards AND-ed with the owner policies above.
drop policy if exists work_ai_instructions_write_access_insert on public.work_ai_instructions;
create policy work_ai_instructions_write_access_insert on public.work_ai_instructions
  as restrictive for insert with check (current_user_can_write());
drop policy if exists work_ai_instructions_write_access_update on public.work_ai_instructions;
create policy work_ai_instructions_write_access_update on public.work_ai_instructions
  as restrictive for update using (current_user_can_write()) with check (current_user_can_write());
drop policy if exists work_ai_instructions_write_access_delete on public.work_ai_instructions;
create policy work_ai_instructions_write_access_delete on public.work_ai_instructions
  as restrictive for delete using (current_user_can_write());

-- Privileges: nothing for anon/PUBLIC, only the needed DML for authenticated, full for service_role.
revoke all on table public.work_ai_instructions from public, anon, authenticated;
grant select, insert, update, delete on table public.work_ai_instructions to authenticated;
grant all on table public.work_ai_instructions to service_role;

commit;
