-- PROV-04: account default provider/model. Existing accounts use the app fallback.
-- Phase 10 may add BYOK settings to the same profile table.
alter table profiles
  add column default_provider text,
  add column default_model text;
