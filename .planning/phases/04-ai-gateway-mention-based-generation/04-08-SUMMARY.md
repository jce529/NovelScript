---
phase: 04-ai-gateway-mention-based-generation
plan: "08"
subsystem: ai
tags: [supabase, rls, server-actions, ai-instructions, gap-closure]
requires: []
provides:
  - "work_ai_instructions private table + owner RLS (migration 0026, not yet applied)"
  - "getWorkSystemInstruction / saveWorkSystemInstruction DAL (lib/ai/work-instructions.ts)"
  - "loadWorkSystemInstructionAction / saveWorkSystemInstructionAction (app/studio/[workId]/ai-settings-actions.ts)"
affects: [04-09, 04-12, 11-10]
tech-stack:
  added: []
  patterns: ["session-client DAL with explicit ownership check + RLS", "0008 restrictive write-access guards on new table"]
key-files:
  created:
    - supabase/migrations/0026_work_ai_instructions.sql
    - lib/ai/work-instructions.ts
    - app/studio/[workId]/ai-settings-actions.ts
    - tests/ai/work-instructions.test.ts
    - tests/ai/work-instructions-actions.test.ts
    - tests/ai/work-instructions.database.test.ts
  modified: []
key-decisions:
  - "작품별 추가 지시는 공개 SELECT 정책이 있는 works가 아닌 비공개 work_ai_instructions 테이블에 저장하고, 없는 행과 빈 문자열은 모두 '추가 지시 없음'으로 본다"
  - "0026에 0008 패턴의 restrictive current_user_can_write() 가드를 함께 둬 정지 계정의 직접 DML도 막는다"
  - "저장 입력은 trim 후 4000자 제한(DB CHECK와 동일), 저장 성공 시 /studio/{workId} layout 재검증"
requirements-completed: []
duration: 6min
completed: 2026-10-17
---

# Phase 04 Plan 08: 작품별 AI 추가 지시 저장소 Summary

비공개 `work_ai_instructions` 테이블(0026, 소유자 전용 RLS + 정지 가드)과 이를 세션 클라이언트로만 읽고 쓰는 DAL·공용 Server Actions를 추가했다. 소유권 확인, 4000자 제한, 빈 값 저장 시 해제가 들어 있다.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | 0026 비공개 스키마·RLS + opt-in DB 테스트 | 4fcc45c |
| 2 | DAL mock TDD (RED a3e018f → GREEN) | 967b8a5 |
| 3 | 공용 Server Actions TDD (RED aff8220 → GREEN) | a24afff |

## What was built

- **0026**: `work_id` PK(works cascade), `instruction text not null default '' check(char_length<=4000)`, `updated_at`. RLS를 켜고 SELECT/INSERT/UPDATE(USING+WITH CHECK)/DELETE를 `exists(works where owner_id=auth.uid() and deleted_at is null)`로 제한했다. restrictive 쓰기 가드를 두고, public/anon 권한은 회수했다. authenticated에는 DML만, service_role에는 all을 준다. works·profiles는 바꾸지 않았고 backfill도 하지 않는다.
- **DAL** (`server-only`): zod uuid 검증 → (save만) `checkWriteAccess` → works 소유권/삭제 여부 확인 → `maybeSingle` 조회 또는 `upsert(onConflict: work_id).select().single()` 순서로 처리한다. DB 오류는 안전한 메시지의 `ok:false`로만 돌려주고 빈 값 성공으로 바꾸지 않는다. admin 클라이언트로 우회하는 경로는 없다.
- **Actions** (`'use server'`): ownerId는 `auth.getUser()`에서만 얻고, 클라이언트가 추가로 보낸 인자는 무시한다. 예외가 나면 실패로 닫고(fail closed), 저장에 성공했을 때만 `revalidatePath('/studio/${workId}', 'layout')`를 호출한다.

## Verification

- `npx vitest run --project unit tests/ai/work-instructions.test.ts tests/ai/work-instructions-actions.test.ts`: 22/22 통과
- Task 1 정적 검증 node 스크립트: 통과
- `npx tsc --noEmit`: 이 plan 파일에서는 오류 0건. 남은 오류 8줄은 tests/payments/*(이미 있던 문제)와 tests/world-tree/*(동시 실행 중인 다른 plan) 쪽이다.
- `tests/ai/work-instructions.database.test.ts`: **skipped (5)**. `RUN_WORK_AI_INSTRUCTIONS_DB=1`일 때만 도는 opt-in이다. 실DB RLS 검증은 아직 **통과로 표시하지 않는다**.

## Deviations from Plan

- **[Rule 2 - Security]** 0026에 0008 패턴의 restrictive `current_user_can_write()` INSERT/UPDATE/DELETE 가드를 추가했다. 계획은 DAL의 checkWriteAccess만 명시했지만, 그러면 세션 클라이언트로 직접 DML을 날릴 때 정지 계정을 막지 못한다. 0024와 같은 방식이다.
- DB 테스트에 opt-in 플래그(`RUN_WORK_AI_INSTRUCTIONS_DB`)를 붙였다. 0026이 공유 프로젝트에 아직 적용되지 않아 `SUPABASE_DB_URL`만으로는 항상 실패하기 때문이다.

## Gaps / Deferred

- 0026은 공유 Supabase에 적용하지 않았다. 적용과 DB 스위트 실행은 04-12 체크포인트에서 한다.
- UI(⚙ 패널) 연결과 지시 합성 전달은 이 plan 범위 밖이다(04-09 / 11-10).
- 오케스트레이터 지시에 따라 graphify update와 graph-link-requirements는 실행하지 않았고, STATE/ROADMAP도 수정하지 않았다.

## Known Stubs

None.

## Self-Check: PASSED
