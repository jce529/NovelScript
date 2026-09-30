# Supabase Vault Probe

RESULT=REACHABLE

`node --env-file=.env.local scripts/probe-vault.mjs`로 원격 DB를 실측했다 (2026-09-30). 프로브는 한 트랜잭션에서 실행 후 항상 롤백하며, 잔여 프로브 시크릿은 0건이다.

## Observed contract

- 확장: `supabase_vault` 0.3.1
- `vault.create_secret(new_secret text, new_name text DEFAULT NULL, new_description text DEFAULT '', new_key_id uuid DEFAULT NULL) returns uuid` — 가정과 일치.
- `vault.secrets`, `vault.decrypted_secrets` 모두 존재.
- 현재 역할(SECURITY DEFINER 소유자 후보): `postgres` — create/delete 모두 허용.
- ACL:

| role | vault schema usage | decrypted_secrets SELECT | secrets DELETE |
|------|--------------------|--------------------------|----------------|
| anon | false | false | false |
| authenticated | false | false | false |
| service_role | true | true | true |

## 결론

기존 [ASSUMED] 항목(create_secret 시그니처, id 기준 삭제, ACL, 정의자 소유자)은 모두 관측값과 일치했다. `0014_byok_keys.sql` 조정은 필요 없다.

## 마이그레이션 검증

- 0014 원격 적용 2회(멱등 확인) 성공.
- `tests/ai/byok-db.test.ts`: 13 passed, failed 0, skipped 0.
