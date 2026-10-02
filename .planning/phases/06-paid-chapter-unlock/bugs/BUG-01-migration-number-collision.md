---
id: BUG-01
title: supabase/migrations에 0015 번호가 3개 중복되어 있다
status: open
severity: medium
found: 2026-10-01
found_during: 원격 master 병합(2f31799) 직후 비교
origin_phase: 06 (0015_author_settlement.sql, Phase 6 정산 구현) — 병렬 작업으로 Phase 5(0015_payments.sql)·Phase 10(0015_byok_secret_cleanup.sql)과 충돌
files:
  - supabase/migrations/0015_author_settlement.sql
  - supabase/migrations/0015_payments.sql
  - supabase/migrations/0015_byok_secret_cleanup.sql
  - tests/commerce/settlement.test.ts
  - scripts/apply-migration.mjs
---

# BUG-01: 마이그레이션 번호 중복

## 증상
세 브랜치가 서로 모르게 같은 번호 `0015`를 사용해 `0015_author_settlement`, `0015_byok_secret_cleanup`, `0015_payments`가 공존한다. 파일명 정렬 순서에 의존하면 새 환경 적용 순서가 우연히 정해진다.

## 재현
`ls supabase/migrations | grep 0015`.

## 기대 / 실제
- 기대: 번호가 유일하고 의도한 적용 순서를 나타낸다.
- 실제: 번호가 중복된다. 현재 원격 테스트 DB에는 세 개 모두 적용돼 있다(`apply-migration.mjs`는 파일명을 인자로 받아 실행하고 적용 이력 테이블이 없다). 테스트(`settlement.test.ts`)는 명시적 파일 목록으로 `0015_author_settlement`를 로드한다.

## 원인
병렬로 진행된 phase들이 "다음 번호"를 각자 계산했다. 적용 이력을 추적하는 테이블/스크립트가 없어 충돌이 자동으로 드러나지 않는다.

## 수정 방향
**확정(2026-10-02, 사용자 선택 A):** 원격 DB에 먼저 적용된 `0015_byok_secret_cleanup.sql`을 `0015`로 유지하고, `0015_payments.sql` → `0016_payments.sql`, `0015_author_settlement.sql` → `0017_author_settlement.sql`로 재번호링한다(`git mv`).
- 파일 내용은 바꾸지 않는다. 적용 이력 테이블이 없어 원격 DB에는 영향이 없다.
- 참조 갱신: `tests/commerce/settlement.test.ts`의 파일 목록, `.planning`·`docs/SSOT-PLANNING-IMPLEMENTATION.md`의 파일명 언급(Phase 5·6 문서, STATE, ROADMAP, SSOT), 관련 주석.
- 재발 방지: 마이그레이션 번호 유일성을 검사하는 간단한 테스트(또는 스크립트)를 추가해 중복 시 실패하게 한다.
- Phase 11·후속 phase의 새 마이그레이션은 `0018`부터 사용한다(BUG 수정이 새 마이그레이션을 쓰면 번호 조율).

## 검증
- `ls supabase/migrations`에서 번호 중복이 없음, 유일성 검사 통과.
- `npx vitest run tests/commerce tests/payments`가 재번호링 후에도 통과.
- `grep -rn "0015_payments\|0015_author_settlement"`로 남은 참조가 없음.
