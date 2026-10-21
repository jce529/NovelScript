---
phase: 11-byok-ux
plan: "11"
subsystem: ai
tags: [byok, capped-reason, chat, tdd]
requirements: [BYOK-05, BYOK-09]
dependency_graph:
  requires: ["11-10"]
  provides: ["cappedCompletionFields", "cappedPresentation", "chat() cappedReason"]
  affects: ["04-10 (helper consumer)", "11-13 (UI/modal regression)", "11-12 (live DB/UAT)"]
tech-stack:
  added: []
  patterns: ["client-safe shared result helper reused by server chat()"]
key-files:
  created:
    - tests/ai/capped-reason.test.ts
  modified:
    - lib/ai/chat-result.ts
    - lib/ai/chat.ts
decisions:
  - "cappedCompletionFields는 finishReason=max_tokens일 때만 기존 classifyCappedReason을 호출하고, 그 외에는 {wasCapped:false}만 반환한다(cappedReason 키 없음)."
  - "cappedPresentation은 wasCapped가 아니면 null, 사유 없는 옛 상한 결과만 balance 문구로 fallback한다."
metrics:
  duration: "~10min"
  completed: 2026-10-19
  tasks: 1
  files: 3
---

# Phase 11 Plan 11: 상한 사유 공유 계약 + 일반 chat 연결 Summary

일반 chat()의 완료 결과가 `ctx.maxOutputTokens`와 실제 `finishReason`/`usage`로 `wasCapped`+`cappedReason`(balance/thinking/request_limit)을 돌려주고, client-safe `cappedPresentation`이 기존 `CAPPED_COPY` 문구를 고른다. BYOK 8192 상한은 더 이상 잔액 부족으로 분류되지 않는다.

## Task 1 (TDD)

- **RED** `cdefab7` — `tests/ai/capped-reason.test.ts`: 분류기 경계(2047=balance, 2048/8192에서 thoughts null/undefined/작음/같음/큼), `cappedCompletionFields`(max_tokens만 상한·stop/refusal/other 없음, BYOK 8192는 balance 아님), `cappedPresentation`(미상한 null, 사유별 문구, 옛 사유 없음→balance), mock provider + fake ledger admin으로 실제 `chat()` 회귀(서비스 저잔액 balance, 2048 thinking/request_limit, BYOK 8192 request_limit/thinking, 서비스·BYOK 정상 stop). 16건 실패 확인.
- **GREEN** `5092889` — `lib/ai/chat-result.ts`에 `cappedCompletionFields`/`cappedPresentation` 추가(server-only 의존성 없음, 기존 classifier/CAPPED_COPY 재사용·우선순위 유지). `lib/ai/chat.ts` 완료 반환의 `wasCapped` 단독 계산을 helper 전개로 대체. terminal/refusal 경로와 11-10 `customInstruction`/`workSystemInstruction` 전달은 그대로.

## Verification

- `npx.cmd vitest run tests/ai/capped-reason.test.ts tests/ai/chat-contract.test.ts tests/ai/document-plan-generation.test.ts --project unit --no-file-parallelism`: 3 files, 46 passed.
- `npx.cmd vitest run tests/ai --project unit`: 58 files, 806 passed.
- `npx.cmd tsc --noEmit`: 오류 없음.

## Handoff / 대기

- **Phase 4 인계:** 04-10은 `cappedPresentation`과 chat 결과의 `cappedReason`을 소비해 AiPanel 고정 잔액 toast를 대체하고 말풍선에 사유를 전달한다(AiPanel.tsx/ai-panel-model.test.ts/SaveDocumentPlanModal.tsx는 이 plan에서 건드리지 않음).
- **11-13 대기:** UI 연결·재생성 모달 전이의 실제 callback 회귀.
- **11-12 대기:** 실DB(`tests/ai/chat.test.ts` 등 `--project db`)와 브라우저 UAT는 실행하지 않았다.

## Deviations from Plan

None - plan executed exactly as written. (STATE.md/ROADMAP.md 갱신과 graphify 실행은 오케스트레이터 지시로 생략.)

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: tests/ai/capped-reason.test.ts, lib/ai/chat-result.ts, lib/ai/chat.ts
- FOUND: cdefab7, 5092889
