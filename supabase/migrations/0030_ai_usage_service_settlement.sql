begin;

-- COST-02 reopen (Phase 11, plan 11-09).
-- The service-path idempotency marker moves from a zero-amount wallet ledger row to
-- ai_usage unique(owner_id, idempotency_key) + service_settled_at.
--
-- Policy: nothing is deleted. Existing ai_usage rows, ledger rows (including historical
-- zero-delta ai_generation rows), balances and author settlements are preserved as audit
-- history. Past ledgers are only READ for migration compatibility (see the RPC and the
-- backfill below); new zero-amount markers live in ai_usage, never in ledger_entries.

-- service_settled_at is an execution-complete marker that prevents re-sending/re-charging.
-- It is NOT an accounting source: amounts and author settlement stay in ledger_entries.
-- ai_usage itself remains "not authoritative for settlement or accounting".
alter table public.ai_usage
  add column if not exists service_settled_at timestamptz;

comment on column public.ai_usage.service_settled_at is
  'Service-key execution completion marker (idempotency only). NULL is not proof of completion; BYOK rows stay NULL. Amounts and settlement remain authoritative in ledger_entries.';

-- Backfill: only service rows with evidence (an ai_generation ledger row with the same
-- owner/key; a delta=0 row was the old completion marker). Rows without a ledger may have
-- been recorded before the debit, so they stay NULL. No usage is invented for old ledgers.
-- BACKFILL-BEGIN
update public.ai_usage u
   set service_settled_at = l.created_at
  from public.ledger_entries l
 where u.key_source = 'service'
   and u.service_settled_at is null
   and l.wallet_id = u.owner_id
   and l.reference_type = 'ai_generation'
   and l.reference_id = u.idempotency_key;
-- BACKFILL-END

create or replace function public.settle_service_ai_generation(
  p_owner_id uuid,
  p_idempotency_key text,
  p_debit_amount bigint,
  p_ledger_reason text,
  p_usage jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_balance bigint;
  v_row public.ai_usage%rowtype;
  v_has_row boolean;
  v_new_balance bigint;
  v_provider text;
  v_model text;
  v_status text;
  v_input integer := 0;
  v_output integer := 0;
  v_thoughts integer := 0;
  v_input_reported boolean := false;
  v_output_reported boolean := false;
  v_work uuid;
  v_chapter uuid;
  v_key text;
begin
  if p_owner_id is null
     or p_idempotency_key is null
     or char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid settlement arguments';
  end if;
  if p_debit_amount is null or p_debit_amount < 0 then
    raise exception 'invalid debit amount';
  end if;
  if p_usage is null or jsonb_typeof(p_usage) <> 'object' then
    raise exception 'invalid usage payload';
  end if;

  -- Serialize per owner: concurrent calls for the same owner/key wait here.
  select balance into v_balance from public.wallets where id = p_owner_id for update;
  if v_balance is null then
    raise exception 'wallet % not found', p_owner_id;
  end if;

  -- Duplicate checks come BEFORE any balance check, so a zero-balance resend is a no-op.
  select * into v_row from public.ai_usage
   where owner_id = p_owner_id and idempotency_key = p_idempotency_key
   for update;
  v_has_row := found;

  if v_has_row and (v_row.key_source = 'byok' or v_row.service_settled_at is not null) then
    return jsonb_build_object('kind', 'already_processed', 'remainingBalance', v_balance);
  end if;

  -- Migration compatibility: a legacy ai_generation ledger row means it was already processed.
  if exists (
    select 1 from public.ledger_entries
     where wallet_id = p_owner_id
       and reference_type = 'ai_generation'
       and reference_id = p_idempotency_key
  ) then
    return jsonb_build_object('kind', 'already_processed', 'remainingBalance', v_balance);
  end if;

  -- Whitelist of accepted usage fields (no prompt/response/key material).
  for v_key in select jsonb_object_keys(p_usage) loop
    if v_key not in ('provider', 'model', 'status', 'input_tokens', 'output_tokens',
                     'thoughts_tokens', 'input_reported', 'output_reported',
                     'work_id', 'chapter_id') then
      raise exception 'unsupported usage field';
    end if;
  end loop;

  if jsonb_typeof(p_usage->'provider') is distinct from 'string'
     or (p_usage->>'provider') not in ('openai', 'anthropic', 'gemini') then
    raise exception 'invalid provider';
  end if;
  v_provider := p_usage->>'provider';

  if jsonb_typeof(p_usage->'model') is distinct from 'string'
     or char_length(p_usage->>'model') not between 1 and 120 then
    raise exception 'invalid model';
  end if;
  v_model := p_usage->>'model';

  if jsonb_typeof(p_usage->'status') is distinct from 'string'
     or (p_usage->>'status') not in ('completed', 'refused') then
    raise exception 'invalid status';
  end if;
  v_status := p_usage->>'status';

  if p_usage ? 'input_tokens' then
    if jsonb_typeof(p_usage->'input_tokens') <> 'number'
       or (p_usage->>'input_tokens') !~ '^[0-9]{1,9}$' then
      raise exception 'invalid input_tokens';
    end if;
    v_input := (p_usage->>'input_tokens')::integer;
  end if;
  if p_usage ? 'output_tokens' then
    if jsonb_typeof(p_usage->'output_tokens') <> 'number'
       or (p_usage->>'output_tokens') !~ '^[0-9]{1,9}$' then
      raise exception 'invalid output_tokens';
    end if;
    v_output := (p_usage->>'output_tokens')::integer;
  end if;
  if p_usage ? 'thoughts_tokens' then
    if jsonb_typeof(p_usage->'thoughts_tokens') <> 'number'
       or (p_usage->>'thoughts_tokens') !~ '^[0-9]{1,9}$' then
      raise exception 'invalid thoughts_tokens';
    end if;
    v_thoughts := (p_usage->>'thoughts_tokens')::integer;
  end if;
  if p_usage ? 'input_reported' then
    if jsonb_typeof(p_usage->'input_reported') <> 'boolean' then
      raise exception 'invalid input_reported';
    end if;
    v_input_reported := (p_usage->>'input_reported')::boolean;
  end if;
  if p_usage ? 'output_reported' then
    if jsonb_typeof(p_usage->'output_reported') <> 'boolean' then
      raise exception 'invalid output_reported';
    end if;
    v_output_reported := (p_usage->>'output_reported')::boolean;
  end if;
  if v_status = 'refused' and not (v_input_reported or v_output_reported) then
    raise exception 'refused usage requires reported tokens';
  end if;

  if p_usage ? 'work_id' and jsonb_typeof(p_usage->'work_id') <> 'null' then
    if jsonb_typeof(p_usage->'work_id') <> 'string' then
      raise exception 'invalid work_id';
    end if;
    v_work := (p_usage->>'work_id')::uuid;
  end if;
  if p_usage ? 'chapter_id' and jsonb_typeof(p_usage->'chapter_id') <> 'null' then
    if jsonb_typeof(p_usage->'chapter_id') <> 'string' then
      raise exception 'invalid chapter_id';
    end if;
    v_chapter := (p_usage->>'chapter_id')::uuid;
  end if;

  -- key_source is fixed to 'service'; owner/key come from the outer arguments.
  if v_has_row then
    update public.ai_usage
       set provider = v_provider, model = v_model, status = v_status,
           input_tokens = v_input, output_tokens = v_output, thoughts_tokens = v_thoughts,
           input_reported = v_input_reported, output_reported = v_output_reported,
           work_id = v_work, chapter_id = v_chapter
     where id = v_row.id;
  else
    insert into public.ai_usage (
      owner_id, provider, model, key_source, status,
      input_tokens, output_tokens, thoughts_tokens,
      input_reported, output_reported, work_id, chapter_id, idempotency_key
    ) values (
      p_owner_id, v_provider, v_model, 'service', v_status,
      v_input, v_output, v_thoughts,
      v_input_reported, v_output_reported, v_work, v_chapter, p_idempotency_key
    );
  end if;

  if p_debit_amount > 0 then
    -- apply_wallet_delta (0001) is shared with payment phases and unqualified, so it needs
    -- public on the search_path while it runs. Scoped to this transaction, then cleared.
    perform set_config('search_path', 'public', true);
    v_new_balance := public.apply_wallet_delta(
      p_owner_id, -p_debit_amount, 'ai_generation', p_idempotency_key, p_ledger_reason
    );
    perform set_config('search_path', '', true);
  else
    -- Zero cost: no ledger insert, no wallet update. The ai_usage row is the marker.
    v_new_balance := v_balance;
  end if;

  -- Completion mark and debit commit in the same transaction; any failure above rolls back.
  update public.ai_usage
     set service_settled_at = now()
   where owner_id = p_owner_id and idempotency_key = p_idempotency_key;

  return jsonb_build_object(
    'kind', 'settled',
    'remainingBalance', v_new_balance,
    'debitAmount', p_debit_amount
  );
end;
$$;

revoke execute on function public.settle_service_ai_generation(uuid, text, bigint, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.settle_service_ai_generation(uuid, text, bigint, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
