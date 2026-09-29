-- PROV-04: account default provider/model. Existing accounts use the app fallback.
-- Phase 10 may add BYOK settings to the same profile table.
alter table profiles
  add column if not exists default_provider text,
  add column if not exists default_model text;

-- 0006 revoked table-wide UPDATE on profiles and re-granted it per column, so
-- new columns are not writable by the signed-in writer until granted here.
-- (RLS profiles_update_own still restricts the row to the caller's own profile.)
grant update (default_provider, default_model) on profiles to authenticated;
