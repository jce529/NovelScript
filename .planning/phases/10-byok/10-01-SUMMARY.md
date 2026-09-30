---
phase: 10-byok
plan: 01
status: complete
requirements: [BYOK-01, BYOK-03, BYOK-04]
key-files:
  created:
    - supabase/migrations/0014_byok_keys.sql
  modified:
    - tests/ai/byok-db.test.ts
---

# 10-01 Summary

`0014_byok_keys.sql` 작성 및 원격 DB 적용 완료 (byok_keys, byok_validation_log, profiles.default_key_source + 컬럼 grant, service_role 전용 SECURITY DEFINER 함수 5종).

- Task 1: 마이그레이션 작성 (정적 acceptance 통과).
- Task 2: `scripts/apply-migration.mjs 0014_byok_keys.sql` 2회 실행 — 둘 다 성공, 2회차는 "already exists, skipping"만 출력(멱등 확인). `tests/ai/byok-db.test.ts` 13 passed / failed 0 / skipped 0.
- Task 3: `scripts/probe-vault.mjs` 실측 결과가 모든 [ASSUMED] 항목과 일치해 SQL 조정 불필요. `10-VAULT-PROBE.md`를 관측값으로 갱신.

## 테스트 수정
- claim 한도 테스트: 동시 호출 응답 순서 의존 제거 (true 2개 / false 1개로 검사).
- authenticated 차단 테스트 3개: raw SAVEPOINT SQL은 postgres.js에서 오류가 catch되지 않아 `tx.savepoint()` 기반 `isDenied` 헬퍼로 교체. DB 권한 동작 자체는 처음부터 정상.

## Self-Check: PASSED
