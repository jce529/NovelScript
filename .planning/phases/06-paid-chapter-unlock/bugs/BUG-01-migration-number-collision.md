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
- 파일 내용은 바꾸지 않는다. `scripts/apply-migration.mjs`에는 적용 이력 기록이 없다. **2026-10-02 재측정:** 원격 배포 경로의 마이그레이션 이력 및 파일명 변경 시 재적용 여부는 미확인이다.
- 참조 갱신: `tests/commerce/settlement.test.ts`의 파일 목록, `.planning`·`docs/SSOT-PLANNING-IMPLEMENTATION.md`의 파일명 언급(Phase 5·6 문서, STATE, ROADMAP, SSOT), 관련 주석.
- 재발 방지: 마이그레이션 번호 유일성을 검사하는 간단한 테스트(또는 스크립트)를 추가해 중복 시 실패하게 한다.
- Phase 11·후속 phase의 새 마이그레이션은 `0018`부터 사용한다(BUG 수정이 새 마이그레이션을 쓰면 번호 조율).

## 검증
- `ls supabase/migrations`에서 번호 중복이 없음, 유일성 검사 통과.
- `npx vitest run tests/commerce tests/payments`가 재번호링 후에도 통과.
- `grep -rn "0015_payments\|0015_author_settlement"`로 남은 참조가 없음.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 확정된 번호를 따른다: `0015_byok_secret_cleanup.sql` 유지, 결제는 `0016_payments.sql`, 정산은 `0017_author_settlement.sql`로 파일명만 바꾼다. 신규 마이그레이션은 `0018`부터 사용한다.
- 전체 `supabase/migrations/*.sql`의 숫자 접두부가 유일한지 검사하는 정적 테스트를 먼저 실패시켜 재발을 막고, 정산 테스트의 파일 경로와 표시 이름을 갱신한다.
- Phase 5·6의 관련 참조를 갱신하고, 아직 파일이 없는 Phase 11의 `0016_ai_usage.sql` 계획을 `0018_ai_usage.sql`로 조율한다. 이 번호 조율은 앞서 확정된 `0018`부터의 규칙을 적용한 것이다.
- 원격 DB에는 세 SQL이 적용됐다는 기존 기록이 있으나 배포 이력과 CLI 동작은 미확인이다. 실제 DB에 다시 적용하기 전에 이력과 차이를 확인한다.

### 변경 파일 목록

| 파일 | 예정 변경 |
|---|---|
| `tests/migrations/numbering.test.ts` (신규) | SQL 파일명을 열거해 4자리 숫자 접두부의 형식·유일성을 검사한다. 기존 세 `0015`가 있으면 실패하도록 한다. DB 연결이나 파일명 목록 하드코딩은 사용하지 않는다. |
| `supabase/migrations/0015_payments.sql` → `supabase/migrations/0016_payments.sql` | `git mv`로 이름만 바꾸고 SQL 본문은 유지한다. |
| `supabase/migrations/0015_author_settlement.sql` → `supabase/migrations/0017_author_settlement.sql` | `git mv`로 이름만 바꾸고 SQL 본문은 유지한다. |
| `supabase/migrations/0015_byok_secret_cleanup.sql` | 변경하지 않고 번호 `0015`를 보존한다. |
| `tests/commerce/settlement.test.ts` | 상단 `readFileSync`, 정적 테스트 설명, DB 테스트의 명시적 파일 목록을 `0017_author_settlement`로 바꾼다. |
| `.planning/phases/05-real-payment-integration/05-01-PLAN.md`, `05-01-SUMMARY.md`, `05-02-PLAN.md`, `05-02-SUMMARY.md`, `05-04-PLAN.md` | `0015_payments`를 `0016_payments`로 갱신한다. 과거 실행 시점과 검증 결과를 기술한 문장은 당시 사실을 지우지 않도록 현재 파일명 주석을 병기한다. |
| `.planning/phases/06-paid-chapter-unlock/06-SUMMARY.md`, `06-VERIFICATION.md`, `.planning/STATE.md`, `.planning/ROADMAP.md`, `docs/SSOT-PLANNING-IMPLEMENTATION.md` | 결제·정산 파일명 참조를 새 이름으로 맞춘다. 과거 검증 상태는 다시 검증하기 전까지 바꾸지 않는다. |
| `.planning/phases/11-byok-ux/11-RESEARCH.md`, `11-01-PLAN.md`, `11-03-PLAN.md` | 계획 속 `0016_ai_usage.sql`을 `0018_ai_usage.sql`로 조율하고 실행 전 신규 번호 확인 게이트를 명시한다. `11-01-PLAN.md`의 원격 적용 명령·완료 기준에 있는 파일명도 함께 확인한다. |
| `scripts/apply-migration.mjs` | 이번 수정에서 변경하지 않는다. 현재 파일명을 인자로 받아 SQL을 실행하며, 번호를 검사하거나 적용 이력을 기록하지 않는다는 사실을 검증 범위에 반영한다. |

### 작업 순서 (TDD)

1. **번호 유일성 가드와 재번호링 — 커밋 제안: `fix(migrations): assign unique numbers to payment and settlement`**
   - 먼저 실패하는 테스트: `tests/migrations/numbering.test.ts`에 모든 SQL 파일의 4자리 접두부 형식 및 중복 거부 케이스를 작성한다. `npx vitest run tests/migrations/numbering.test.ts`가 현재 `0015` 세 파일 때문에 실패하는 것을 확인한다. 가드 자체의 음성 케이스는 임시 파일 생성 대신 순수 판별 함수에 중복 이름 목록을 넣어 검증한다.
   - 구현: 두 파일을 위 이름으로 `git mv`하고 `tests/commerce/settlement.test.ts`의 세 참조를 고친다. SQL 본문 변경 여부는 rename diff로 확인한다.
   - 확인 명령: `npx vitest run tests/migrations/numbering.test.ts tests/commerce/settlement.test.ts`; `git diff --find-renames -- supabase/migrations tests/commerce/settlement.test.ts`; `npx vitest run tests/commerce tests/payments`.
2. **문서 참조와 Phase 11 번호 조율 — 커밋 제안: `docs(migrations): sync references and reserve 0018 for phase 11`**
   - 먼저 실패하는 테스트: `rg -n '0015_payments|0015_author_settlement|0016_ai_usage' .planning docs --glob '!**/bugs/BUG-01-migration-number-collision.md'`로 남은 구번호 참조를 확인한다. 계획·요약의 이력 문구는 갱신 대상과 과거 사실을 구별해 검토한다.
   - 구현: 변경 파일 목록의 문서 참조를 새 파일명으로 고친다. Phase 11의 `0016_ai_usage.sql` 예정 파일명을 `0018_ai_usage.sql`로 바꾸고, Phase 11 실행 직전 중복 여부를 다시 확인하도록 적는다.
   - 확인 명령: 위 `rg`가 갱신 대상에 대해 결과를 내지 않는지 확인하고 `npx vitest run tests/migrations/numbering.test.ts`; `git diff --check`를 실행한다. 과거 이름을 의도적으로 남긴 이력 문장은 주석으로 이유를 명시한다.

### 테스트 계획

- 신규 `tests/migrations/numbering.test.ts`: 정상 4자리 접두부와 오름차순 목록을 읽을 수 있는지, 같은 번호의 서로 다른 SQL 두 개를 거부하는지, 잘못된 접두부를 거부하는지, 저장소의 전체 SQL 접두부가 유일한지 검사한다. 테스트는 DB 환경변수가 없어도 실행돼야 한다.
- 기존 회귀: `npx vitest run tests/commerce tests/payments` 및 전체 정적 가드 `npx vitest run tests/migrations/numbering.test.ts`. DB 통합 케이스는 `SUPABASE_DB_URL`이 설정된 격리 테스트 DB에서 skipped 0을 확인한다. 연결이 없으면 DB 케이스 통과로 간주하지 않는다.
- 이 버그는 병렬 브랜치의 **파일명 할당 충돌**이며 DB 트랜잭션 동시성 버그가 아니다. 따라서 독립 DB 연결을 이용한 동시 구매 테스트는 이 버그의 완료 기준이 아니다. 기존 Phase 6의 독립 세션 동시 구매 미검증 항목은 별도로 유지한다.
- 참조 검사: `rg -n '0015_payments|0015_author_settlement|0016_ai_usage' .planning docs tests --glob '!**/bugs/BUG-01-migration-number-collision.md'` 결과를 검토한다. 파일명 검사는 `rg --files supabase/migrations`와 신규 가드로 수행한다.

### 위험과 롤백

- **데이터·배포:** 두 SQL 본문이 같아도 원격 배포 도구가 바뀐 파일명을 새 마이그레이션으로 취급할 가능성은 **미확인**이다. `0017_author_settlement.sql`은 `alter table ... add column`과 `create function`을 포함하므로 재실행을 안전하다고 가정할 수 없다. 대상 환경의 이력·적용 예정 목록을 확인할 때까지 원격 push를 보류한다.
- **배포 게이트:** 연결된 대상 환경에서 `supabase migration list`와 적용 예정 목록을 대조하고 세 기존 SQL의 적용 여부를 확인한다. 불일치나 재적용 예정이 있으면 그 환경에 맞는 이력 조정 절차를 별도로 계획·기록한 뒤 진행한다. 현재 CLI 연결 상태와 원격 이력은 **미확인**이다.
- **Phase 11:** `11-01-PLAN.md`는 아직 존재하지 않는 `0016_ai_usage.sql` 생성·원격 push를 지시한다. 번호를 `0018`로 조율하지 않고 실행하면 충돌이 재발한다. Phase 11 실행 직전에 실제 디렉터리와 계획을 다시 대조한다.
- **롤백:** 배포 전에는 두 파일의 rename과 참조 변경 커밋을 역순으로 되돌릴 수 있다. 원격 DB에 적용한 뒤에는 파일명만 역변경해 이력을 복구하려 하지 않는다. 원격 이력·DDL 상태를 확인하고 별도 복구 절차를 세운다. 자동 롤백 SQL은 작성하지 않는다.

### 완료 조건

- `0015_byok_secret_cleanup.sql`, `0016_payments.sql`, `0017_author_settlement.sql`이 각각 한 개씩 존재하고, 전체 SQL 번호 유일성 테스트가 통과한다. 두 rename의 SQL 본문 차이가 없다.
- 정산 테스트의 파일 참조 및 Phase 5·6·11과 프로젝트 현황 문서의 현재 파일명이 일치한다. Phase 11의 신규 파일은 `0018`부터 예약되어 있다.
- `tests/commerce`, `tests/payments`, 신규 번호 가드가 통과하고 DB 통합 테스트의 실행·skip 수가 기록된다. 배포 대상의 이력 검증 결과와 재적용 방지 조치가 기록되어야 `bug-complete`로 넘긴다.

### 예상 규모

- 구현 시 SQL 본문 변경 0줄, rename 2건, 테스트·문서 참조 수정 약 50~100줄. 신규 번호 가드는 약 30~50줄로 예상한다.
- 작업 2단계, 단계당 커밋 1개. 배포 게이트의 원격 이력 확인·복구 소요는 현재 **미확인**이다.
