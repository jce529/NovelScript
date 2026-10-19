---
phase: 07
slug: admin-moderation-surface
status: accepted-with-deferred
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-16
---

# Phase 7 - Validation Strategy

## Test Infrastructure

| Property | Value |
| --- | --- |
| Framework | Vitest 4, postgres, existing Supabase helpers |
| Config | vitest.config.ts |
| Quick command | `npx vitest run tests/admin --passWithNoTests=false` |
| Full command | `npm test` |
| Static checks | `npx tsc --noEmit` and `npm run lint` |
| Runtime | Not measured; measure during execution |

## Sampling Rate

Run focused tests after each implementation task, and the full relevant regression suite after each wave. Require non-skipped DB tests before phase verification. Target focused feedback below 60 seconds; this is a target, not a measured result. Never treat missing files, missing DB credentials or skipped tests as success.

## Verification Map

Task-level planned coverage is verified below. [2026-10-19 정리] 아래 07-01~07-07 표와 "Missing" 열은 2026-09-16 계획 시점의 기록이다. 해당 테스트 파일은 이후 실제로 생성돼 2026-09-17에 실행됐고(Sign-Off 참조), 현재 `tests/admin/`에 존재한다. "Missing"은 현재 상태가 아니라 당시 계획 상태이며 Wave 0 항목도 07-01~07-07 범위에서는 충족됐다(`wave_0_complete: true`). 이 파일은 Reopen 보완(07-08~07-15)을 별도 표로 추가하며, 보완 쪽 Wave 0(실DB·브라우저)은 07-15 전까지 미충족이다.

| Task | Wave | Requirement | Automated check (vitest commands require --passWithNoTests=false) |
| --- | --- | --- | --- |
| 07-01-01 | 1 | ADMIN-01/02/03 | vitest run tests/admin/foundation.database.test.ts |
| 07-01-02 | 1 | ADMIN-01/03 | vitest run tests/admin/authorization.test.ts |
| 07-02-01 | 2 | ADMIN-02/03/04 | vitest run tests/admin/operations.database.test.ts |
| 07-02-02 | 2 | ADMIN-01/04 | vitest run tests/admin/moderation.test.ts |
| 07-03-01 | 3 | ADMIN-03 | vitest run tests/admin/sanctions.database.test.ts |
| 07-03-02 | 3 | ADMIN-03 | vitest run tests/admin/sanctions.test.ts tests/commerce/actions.test.ts |
| 07-05-01 | 3 | ADMIN-01 | npx tsc --noEmit; rendered acceptance in 07-07-03 |
| 07-05-02 | 3 | ADMIN-01/02/03/04 | vitest run tests/admin/action-boundary.test.ts |
| 07-04-01 | 4 | ADMIN-02 | vitest run tests/admin/blinding.database.test.ts |
| 07-04-02 | 4 | ADMIN-02 | vitest run tests/admin/blinding.test.ts tests/commerce/actions.test.ts |
| 07-06-01 | 5 | ADMIN-02/03 | vitest run tests/admin/user-flows.test.ts |
| 07-06-02 | 5 | ADMIN-02/03 | vitest run tests/admin/user-flows.test.ts tests/commerce/actions.test.ts |
| 07-07-01 | 6 | ADMIN-01/02/03/04 | four named database suites, applied schema required |
| 07-07-02 | 6 | ADMIN-01/02/03/04 | vitest run tests/admin/concurrency.database.test.ts |
| 07-07-03 | 6 | ADMIN-01/02/03/04 | npm test plus actual desktop/mobile browser evidence |

| Requirement / Decisions | Threat | Required proof | Proposed test | Status |
| --- | --- | --- | --- | --- |
| ADMIN-01; D-01..05, D-17, D-20 | T-07-01, T-07-05 | Non-admin/revoked access denied, correct queue/detail DTOs | tests/admin/authorization.test.ts | Missing |
| ADMIN-04; D-18..19 | T-07-04 | Reviewed report set handled atomically; retries and late reports safe | tests/admin/moderation.test.ts | Missing |
| ADMIN-03; D-06..10 | T-07-02, T-07-06 | All writes denied during suspension, reading retained, expiry and acknowledgement correct | tests/admin/sanctions.test.ts | Missing |
| ADMIN-02; D-11..16 | T-07-02, T-07-03 | Direct body access denied, no charge while blind, restore entitlement access, owner re-review only | tests/admin/database.test.ts | Missing |
| ADMIN-01..04 | T-07-04 | Audit rollback, concurrent resolutions/payments, real migration and grants | tests/admin/database.test.ts | Missing |

## Reopen 보완 Verification Map (07-08~07-15, 2026-10-12 결정)

기준: `07-CONTEXT.md` Reopen 논의 결정(2026-10-12), 댓글 제외. 결과 열은 각 SUMMARY에 기록된 명령·숫자만 옮긴 것이다. `vitest list`는 수집 확인일 뿐 실행 통과가 아니며, node 환경 unit/static markup(SSR) 테스트는 실제 브라우저 클릭·포커스·hydration 검증을 대체하지 못한다. 실DB suite는 `SUPABASE_DB_URL`이 없으면 skip되며 skip은 통과가 아니다.

| Task | Wave | Requirement | 검사 파일 / 대표 명령 | 관찰된 결과 (SUMMARY 기준) | 상태 |
| --- | --- | --- | --- | --- | --- |
| 07-08-01 전체 대상 그룹·사용자별 제재 조회 (all/혼합 status, reader+writer) | 1 | ADMIN-01/03 | tests/admin/blueprint-queries.database.test.ts; `vitest list` | 7개 수집(실행 안 함) | DB 실행 pending (07-15-01) |
| 07-08-02 current expiry·history·기간 단축/연장·lift·same-key·conflict | 1 | ADMIN-03 | tests/admin/sanction-adjustment.database.test.ts | 12개 수집(실행 안 함) | DB 실행 pending (07-15-01) |
| 07-08-03 선호작-only 공개 알림, parent blind, 내부 사유 redaction, rollback/retry | 1 | ADMIN-02 | tests/admin/unblind-notifications.database.test.ts | 7개 수집(실행 안 함); 0029는 어떤 DB에도 미적용 | DB 실행 pending (07-15-01) |
| 07-09-01 전체 필터·제재 탭 URL 상태 | 2 | ADMIN-01/03 | `npx vitest run tests/admin/queue-params.test.ts` | RED 4건 확인 후 GREEN; 아래 합계에 포함 | 단위 통과 |
| 07-09-02 전체 큐·사용자 제재·이력 guarded query | 2 | ADMIN-01/03 | tests/admin/sanction-history.test.ts, moderation.test.ts, action-boundary.test.ts | 4개 파일 합계 114 passed | 단위 통과, 실DB 컬럼 가정 pending |
| 07-10-01 현재 제재 해제·기간 변경 서버 경계 | 3 | ADMIN-03 | `npx vitest run tests/admin/action-boundary.test.ts tests/admin/authorization.test.ts tests/admin/moderation.test.ts --passWithNoTests=false` | RED 39 failed 후 GREEN 3 files 153 passed | 단위 통과, 실제 RPC 동작 pending |
| 07-10-02 1·7·30일 프리셋 종료 계산 | 3 | ADMIN-03 | `npx vitest run tests/admin/sanction-presets.test.ts --passWithNoTests=false` | GREEN 25 passed | 단위 통과 |
| 07-11-01/02 세 탭·전체 표시·현재 행 조정 폼·프리셋 | 4 | ADMIN-01/03 | `npx vitest run --project unit` tests/admin/blueprint-ui.test.ts + sanction-presets/action-boundary/moderation-form-message/queue-params | 5 files 125 passed (SSR; 대화상자는 닫힌 상태라 클릭/포커스/Esc 미검증) | 단위 통과, 브라우저 pending (07-15-02) |
| 07-12-01/02 공개 알림 조회·확인 (AccountNotices) | 2 | ADMIN-02 | `npx vitest run tests/admin/publication-notices.test.ts tests/admin/user-flows.test.ts` | 42 passed | 단위 통과, 확인 영속성·RLS 실DB pending |
| 07-13-01/02 프로필 메뉴 관리자 진입 (menu denied) | 1 | ADMIN-01 | `vitest run tests/admin/admin-menu.test.ts tests/admin/authorization.test.ts` | 22 passed | 단위 통과, 팝오버 키보드·권한 회수 후 동작 pending |
| 07-14-01/02 UI-SPEC / VALIDATION 문구 개정 | 5 | ADMIN-01/02/03 | `rg` 문구 검사 (문서 전용) | 코드 변경 없음 | 문서 완료 |
| 07-15-01 실DB 0029 grants·원자성·실제 2세션 경쟁 | 6 | ADMIN-01..04 | 8개 DB suite를 `--no-file-parallelism`으로 실행 (07-15-PLAN 명령 그대로) | 미실행 | **blocking checkpoint, pending** |
| 07-15-02 관리자/선호작 독자 브라우저 흐름·회귀 | 6 | ADMIN-01..04 | unit/tsc/lint 게이트 + 실제 브라우저 | 미실행 | **blocking checkpoint, pending** |

보완 단위 검사의 알려진 한계(각 SUMMARY 기록): tsc는 이 plan 파일에서 오류 0이나 repo 전체에는 다른 plan(`tests/ai/*`, `tests/payments/*`)의 오류가 있었다(범위 밖). 07-09 `listSanctionUsers` 계열은 0029 컬럼 이름을 SQL 파일 기준으로 가정했고, 알 수 없는 kind의 이력 행은 페이지 처리 뒤 제거돼 `hasNext`가 어긋날 수 있다(cosmetic). graphify는 실행하지 않았다.

## Wave 0 Requirements

- Create each task's named test files with meaningful assertions; test creation is part of its producing task, not deferred to the final wave.
- Reuse existing fixtures where applicable; add administrator membership and sanction/blind fixtures.
- Provide a disposable PostgreSQL/Supabase target with actual roles and migrations. Adapt schema-qualified functions in isolation deliberately.
- Provide separate DB sessions for race tests; sequential tests are insufficient.
- Confirm browser automation availability for UI acceptance or record manual evidence explicitly.

## UI Acceptance

After UI-SPEC exists, verify desktop/mobile queue and detail, grouped counts, status filters, review tab, reason validation, action feedback and keyboard focus. Verify warning acknowledgement survives reload, suspended readers retain purchases and wallet visibility, writers can correct/request review, and blinded chapters retain their sequence position without a purchase prompt.

## Blocking Database Check

Apply the new moderation migration to the verified test target using the repository migration runner or a verified Supabase CLI setup. Confirm prerequisites including 0005, then inspect live schema/grants/functions. Do not run raw migrations twice or against an unknown linked target. Do not mark the phase complete on type checking or mocked tests alone.

## Sign-Off

아래 체크박스는 07-01~07-07의 2026-09-17 기준 역사 기록이며 그대로 보존한다. Reopen 보완(07-08~07-15)의 인수는 이 아래 "Reopen 보완 Sign-Off"에서 따로 추적한다.

- [x] UI-SPEC and executable plans exist; each task maps to an automated check or documented UI acceptance.
- [x] All ADMIN requirements and D-01 through D-20 are covered.
- [x] Focused tests pass with no empty-suite success. (tests/admin: 11 files / 275 passed, 2026-09-17)
- [x] DB role, migration, rollback and true concurrency tests pass without skips. (4 DB suites 44/44 + concurrency 8/8 x3 on live test target; see docs/admin-moderation.md)
- [ ] Reader/writer/commerce regressions and browser acceptance pass. (Regressions: full suite 483/483 serial. Browser: 22/22 observed journeys pass; **2 pending**: warning acknowledgement and suspended-user UI need a second login, see 07-UAT.md section 4)
- [x] Actual execution time and remaining limitations recorded. (DB suites ~24s, concurrency ~5s; limitations in docs/admin-moderation.md and 07-UAT.md)
- [x] Planning coverage review complete; nyquist_compliant does not assert test execution.

## Reopen 보완 Sign-Off (2026-10-19 기준, 07-15 전까지 미완)

- [x] UI-SPEC과 VALIDATION 문구가 Reopen 결정(세 탭·전체·프리셋·현재 행 조정·공개 알림·메뉴 진입)과 일치한다. (07-14)
- [x] 보완 task별 단위/수집 검사가 위 표에 파일·명령과 연결됐다. (결과는 SUMMARY 관찰값만)
- [ ] 실DB: 0029 적용, grants, rollback, 2세션 경쟁, 공개 알림 fanout이 skipped 0으로 통과한다. (07-15-01 대기)
- [ ] 브라우저: 프로필 진입, 세 탭, 전체 필터, 프리셋, 해제/기간 변경, 공개 알림 확인 영속성, light/dark·모바일·키보드 (07-15-02 대기)
- [ ] 기존 신고 처리/기각·재검토·블라인드·경고·구매권 보존 회귀 재확인 (07-15 대기)

**Approval:** Planning coverage reviewed 2026-09-16. Runtime verification 2026-09-17 (07-07): automated and DB checks pass; browser acceptance partial with 2 manual items pending, Phase 7 marked complete by user decision on 2026-09-17 with those 2 items deferred to `.planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md`.
