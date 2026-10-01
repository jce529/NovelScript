# Supabase Vault Probe

RESULT=UNREACHABLE

The probe was run with `node scripts/probe-vault.mjs` without loading `.env.local`. It exited successfully and reported `ERROR=CONFIGURATION`; `SUPABASE_DB_URL` was unavailable to the process, so no database connection or Vault inspection occurred.

## Assumed contract

- `vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null) returns uuid` — **[ASSUMED]**, Supabase Vault 0.3.1 documented default; not observed against this project database.
- Deletion by `delete from vault.secrets where id = ...` — **[ASSUMED]**, not probed.
- `vault.decrypted_secrets` SELECT and `vault.secrets` DELETE ACL for `anon`, `authenticated`, and `service_role` — **[ASSUMED]**, not probed.
- SECURITY DEFINER owner — **[ASSUMED]**; the probe will record `current_user` after connectivity is restored.

Plan 01 Task 2에서 사람이 SUPABASE_DB_URL을 복구해야 한다.

After access is restored, rerun the probe and replace assumptions with observed signatures, deletion behavior, object availability, ACL results, and rollback residue count.
