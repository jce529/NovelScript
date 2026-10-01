---
phase: 10-byok
plan: 01
status: partial
requirements: [BYOK-01, BYOK-03, BYOK-04]
key-files:
  created:
    - supabase/migrations/0014_byok_keys.sql
---

# 10-01 Summary (partial)

Task 1 완료: `0014_byok_keys.sql` 작성 (byok_keys, byok_validation_log, profiles.default_key_source + 컬럼 grant, service_role 전용 SECURITY DEFINER 함수 5종). 정적 acceptance(grep) 통과. Vault 시그니처/권한은 [ASSUMED] (프로브 UNREACHABLE).

## Pending (다른 디바이스에서 사용자 확인)
- Task 2 [BLOCKING]: `node --env-file=.env.local scripts/apply-migration.mjs 0014_byok_keys.sql` (2회 실행해 멱등성 확인) + `npx vitest run tests/ai/byok-db.test.ts --reporter=verbose` (failed 0, skipped 0)
- Task 3: 위가 통과하면 n/a
- 10-VAULT-PROBE.md를 실측값으로 갱신 후 필요 시 SQL 조정

이 plan은 위 확인 전까지 완료 처리하지 않는다.
