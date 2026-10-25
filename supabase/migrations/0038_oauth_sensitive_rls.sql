begin;

-- D-17 Phase 12 boundary: protect sensitive REST tables now. Before Phase 13
-- starts, expand OAuth client_id restrictions to EVERY public table separately.
-- This policy is restrictive, so it intersects existing owner policies. The
-- service_role continues to bypass RLS for internal accounting operations.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'wallets', 'ledger_entries', 'byok_keys', 'byok_validation_log',
    'orders', 'order_items', 'entitlements', 'payment_orders',
    'mcp_connections', 'ai_usage'
  ] loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      raise notice '0038 OAuth RLS: skipped absent table public.%', v_table;
      continue;
    end if;
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('drop policy if exists oauth_browser_only on public.%I', v_table);
    execute pg_catalog.format($policy$
      create policy oauth_browser_only on public.%I
      as restrictive for all to authenticated
      using ((select auth.jwt() ->> 'client_id') is null)
      with check ((select auth.jwt() ->> 'client_id') is null)
    $policy$, v_table);
  end loop;
end;
$$;

-- byok_validation_log has no authenticated table grant or permissive policy;
-- the additional restrictive policy is defense if grants change later.
notify pgrst, 'reload schema';
commit;
