---
phase: 07-admin-moderation-surface
plan: "08"
subsystem: admin-moderation-db
tags: [supabase, migration, admin, sanctions, notifications, gap-closure]
requires: ["0001-0009 migrations", "apply_user_sanction / refresh_sanction_cache (0006/0008)", "unblind_moderation_target / resolve_review_request (0007)"]
provides:
  - list_report_groups_all(p_limit, p_offset)
  - list_sanction_users(p_limit, p_offset)
  - get_user_sanction_history(p_user_id, p_limit, p_offset)
  - adjust_user_sanction(p_actor_id, p_idempotency_key, p_user_id, p_expected_seq, p_operation, p_reason, p_public_reason, p_ends_at)
  - publication_notifications table + notify_publication_on_unblind trigger
  - acknowledge_publication_notification(p_notification_id)
affects: ["07-09+ admin UI plans", "07-15 live-DB checkpoint"]
tech-stack:
  added: []
  patterns: ["service_role-only SECURITY DEFINER RPCs", "AFTER INSERT audit trigger fan-out", "text-typed bigint seq for JS safety", "module-level SQL load + opt-in DB suites"]
key-files:
  created:
    - supabase/migrations/0029_admin_blueprint_completion.sql
    - tests/admin/blueprint-queries.database.test.ts
    - tests/admin/sanction-adjustment.database.test.ts
    - tests/admin/unblind-notifications.database.test.ts
  modified: []
decisions:
  - "Reserved migration number 0029 only; 0006-0009 untouched; no needs_migration_number."
  - "Publication notice '해제' = blind lift only (work_unblind, chapter_unblind, review_unblind); account sanction lift and review_maintain excluded."
  - "Recipients = work_bookmarks holders at lift time (not work_subscriptions); deleted accounts and the work owner skipped."
  - "Duration change = lift + new suspension in one transaction via apply_user_sanction; history never updated."
metrics:
  completed: 2026-10-19
  tasks: 3
  files: 4
---

# Phase 7 Plan 08: Admin Blueprint Completion DB Contract Summary

0029 마이그레이션 하나로 전체 상태 신고 그룹 조회, 사용자별 제재 조회, 기존 lift 경로를 재사용하는 제재 해제·기간 변경 RPC, 블라인드 해제 시 선호작 독자 공개 알림(트리거·수신자 전용 RLS·확인 RPC)을 추가했다.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 08-01 | 전체 대상 그룹과 사용자별 제재 조회 | e1dc3cc |
| 08-02 | 현재 제재 해제·기간 변경(adjust_user_sanction) | 3653b60 |
| 08-03 | 블라인드 해제 시 선호작 공개 알림 | 40f98cb |

08-01·08-02는 이전 executor가 커밋했다. 이번 세션에서는 남아 있던 미커밋 08-03 작업(0029 4절과 `unblind-notifications.database.test.ts`)을 스키마(0002/0003/0005/0006/0007)와 대조해 검토했다. 컬럼, `chapters(id, work_id)` unique, action_type 값, bookmark 테이블 모두 맞아서 수정 없이 커밋했다.

## 08-03 범위 근거

- 07-CONTEXT.md Reopen 논의 결정(2026-10-12): "해제 시 선호작 독자 공개 알림".
- UI-DESIGN-BACKLOG.md "숨긴 회차": 숨겼다가 다시 공개하면 공개 알림만 보낸다.
- UI-DESIGN-BACKLOG.md "관리자 탭 구조": 작가 재검토로 블라인드가 해제되면 선호작 독자에게 공개 알림만 보낸다.
- 알림 대상: 직접 unblind(`work_unblind`/`chapter_unblind`)와 재검토 결과 `unblinded`(`review_unblind`)뿐이다. 계정 제재 lift와 `review_maintain`은 대상이 아니다. 트리거는 0007의 두 해제 함수가 blind flag를 먼저 바꾼 뒤 감사 행을 INSERT하는 순서에 기대므로, 트리거가 실패하면 해제도 함께 rollback된다.

## Verification

| Check | Result |
| ----- | ------ |
| `vitest list` blueprint-queries | 0 종료, 7개 수집, SQL 10개 로드 |
| `vitest list` sanction-adjustment | 0 종료, 12개 수집 |
| `vitest list` unblind-notifications | 0 종료, 7개 수집 |
| `npx eslint --max-warnings=0` (unblind-notifications test) | 통과 |
| `npx tsc --noEmit` | 이 plan 파일에서는 에러 0. 실패 2건은 병렬 plan 05-03/05-04 파일(`tests/payments/amount-tamper.test.ts`, `tests/payments/fail-redirect.test.ts`)이다(범위 밖). |

## Not Verified (gate 07-15)

- 0029는 어떤 DB에도 적용하지 않았다(공유 Supabase 프로젝트라 금지).
- 세 `*.database.test.ts` 스위트는 `SUPABASE_DB_URL`이 있을 때만 실행되며 이번에는 실행하지 않았다. 수집은 SQL 문법, PL/pgSQL 동작, RLS/역할, rollback, 2세션 경쟁 검증을 대신하지 못한다. 07-15-01 blocking checkpoint에서 skipped 0으로 실행해야 한다.
- 이 plan이 지시한 graphify update와 graph-link-requirements는 orchestrator 지시에 따라 건너뛰었다.

## Deviations from Plan

None - plan executed as written(이어받은 08-03 산출물을 검토 후 수정 없이 커밋).

## Known Stubs

None.

## Self-Check: PASSED

- 파일 4개 존재, 커밋 e1dc3cc / 3653b60 / 40f98cb 존재.
