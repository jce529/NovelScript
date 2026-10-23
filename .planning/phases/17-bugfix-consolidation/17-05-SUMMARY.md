---
phase: 17-bugfix-consolidation
plan: "05"
subsystem: database-tests
tags: [migrations, fixtures, vitest, disposable-db]
requirements-completed: []
requirements: [BUGFIX-05]
key-files:
  modified:
    - supabase/migrations/0028_account_deletion_purge.sql
    - scripts/lib/report-fixture-cleanup.mjs
    - tests/ai/provider-fixture.test.ts
    - tests/helpers/work-fixture.ts
completed: 2026-10-23
---

# Phase 17 Plan 05: 0022 번호 중복과 정리 fixture Summary

0022 중복은 purge를 0028로 개명해 해소하고, 잠금 트리거를 우회하지 않고 fixture를 삭제 가능한 형태로 바꿔 일회용 DB 전체 suite를 3052 통과 / 1 실패 / 5 skip까지 올렸다.

## 커밋
- `60f385f`, `499ed9e`: purge 0022 -> 0028 개명, provider-fixture hermetic화(BUGFIX-05 테스트 결함), fixed/01-01 파일명
- `407b51a`: 정리 스크립트 사전 거부, `createRemovableWork`, 회귀 테스트
- 문서 커밋: 17-BASELINE, 이 SUMMARY, fixed/01-02, fixed/07-09

## 결과
- 일회용 DB ref 확인(값 비출력): URL, DB URL, 선언 ref 일치, 공유 프로젝트와 다름. 공유 DB 변경 없음, 마이그레이션 적용 없음.
- 전체 vitest(게이트 3개 on): 1 실패 / 3052 통과 / 5 skip. skip은 `work-instructions.database.test.ts` opt-in 게이트.
- bug-complete: BUG-02 -> fixed/01-02, BUG-09 -> fixed/07-09. (원인 phase `bugs/` 폴더에는 해당 문서가 없어 fixed로 직접 작성)

## Deviations
- [Rule 2] provider-fixture env 의존 제거(사용자 추가 범위).
- 정리 7건의 분류: 5건 + afterAll은 0023, 1건(0004 historical)은 0034이며 후자는 아래 미해결.

## Open Issues
1. `template-policy-migration.test.ts` 'historical: 0004' 1건 실패: 일회용 DB에 UAT 확정 가지 작품 3개가 남아 0034 불변식에 걸림. DB 재생성 또는 소유자 정리 필요(결정 필요, 불변식 우회 금지).
2. STATE.md 등에 `0022_account_deletion_purge` 언급이 남음(규칙상 이 plan에서 수정 안 함).
3. 공유 DB에 purge가 적용됐는지 사용자 확인 필요.
4. Phase 12 번호는 0037부터 사용 가능.

## Self-Check: PASSED
