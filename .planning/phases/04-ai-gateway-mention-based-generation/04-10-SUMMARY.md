---
phase: 04-ai-gateway-mention-based-generation
plan: "10"
subsystem: studio-ai-panel
tags: [ai-panel, freeform-instruction, work-system-instruction, model-picker, service-availability, capped-reason]
requires:
  - "04-08: loadWorkSystemInstructionAction / saveWorkSystemInstructionAction"
  - "04-09: chatAction / regenerateDocumentWithTemplateAction accept customInstruction"
  - "10-08: ModelPicker, useServiceAvailability, canUseSelection"
  - "11-11: cappedPresentation, ChatResult.cappedReason"
provides:
  - "AiInstructionControls: preset dropdown + separate gear + inline freeform textarea"
  - "SystemInstructionModal + lib/ai/system-instruction-state.ts controller"
  - "AiPanel: customInstruction snapshot, picker/availability guard on actual attempt selection, capped reason toast/bubble"
affects:
  - "04-11 (gauge, same AiPanel)"
  - "04-12 (browser/DB UAT gate)"
  - "11-13 (UI/modal regression, after 04-10/04-11)"
tech-stack:
  added: []
  patterns:
    - "seq-guarded pure reducer + controller consumed via useSyncExternalStore"
    - "test-only React hook harness (vi.mock('react') pass-through) to drive real AiPanel handlers in node env"
key-files:
  created:
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiInstructionControls.tsx
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/SystemInstructionModal.tsx
    - lib/ai/system-instruction-state.ts
    - tests/ai/ai-instruction-controls.test.ts
    - tests/ai/system-instruction-state.test.ts
  modified:
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
    - tests/ai/chat-request-lifecycle.test.ts
    - tests/ai/ai-panel-model.test.ts
key-decisions:
  - "Free-form text is kept in panel state across preset switches; only customInstructionForPayload (freeform + non-blank) puts it into a send/regenerate payload, else null."
  - "Availability guard runs on attemptSelection(payload) = replacementSelection ?? frozen selection, before the lock; a blocked retry/consent keeps the failed attempt, the notice and the UI selection unchanged and shows a reason + 다시 확인."
  - "Modal async state lives only in createSystemInstructionController (attach/dispose for StrictMode replays; dispose bumps seq silently so re-attach cannot accept stale responses)."
  - "Closing the modal is ignored while a save is in flight; only a confirmed save resolves true and closes."
requirements-completed: [EDIT-03]
metrics:
  duration: "~17min"
  completed: 2026-10-19
---

# Phase 4 Plan 10: AI 패널 지시 편집 UX와 피커·상한 계약 소비 Summary

자유형 인라인 커스텀 지시(전송 시 frozen snapshot)·작품별 추가 시스템 지시 모달(seq-guarded controller)·10-08 ModelPicker/가용성 가드·11-11 상한 사유 toast/말풍선을 공용 AiPanel에 연결했다.

## What was built

- **Task 1 — 프리셋 드롭다운 + 자유형 인라인** (`AiInstructionControls.tsx`): 기존 gear DropdownMenu를 labeled `Select`("AI 지시 프리셋")로 옮기고 별도 ⚙ 버튼(aria-label "작품 시스템 지시 설정")을 둠. 자유형일 때만 바로 아래에 "커스텀 지시사항" textarea(maxLength 4000, 지정 placeholder). AiPanel `SendPayload.customInstruction` → `buildPayload` → `runAttempt` → `chatAction`. retry/`createReplacementAttempt`는 frozen 값을 그대로 쓰고 새 전송/다시 생성은 현재 값을 씀. 채팅 입력과 자유형 입력은 별개 state.
- **Task 2 — 작품 시스템 지시 모달** (`SystemInstructionModal.tsx`, `lib/ai/system-instruction-state.ts`): Dialog 제목 "작품 시스템 지시", `BASELINE_SYSTEM_PROMPT` readOnly textarea, 편집 가능한 추가 지시(4000자·글자 수), 로딩/조회 오류(+다시 불러오기)/저장 중/저장 오류 상태. open·workId 변경 때 `loadWorkSystemInstructionAction`, `saveWorkSystemInstructionAction` 성공 때만 닫힘. 초보자: ⚙ disabled + 이유 설명; 모달이 열린 채 초보자로 바꾸면 닫히고 진행 중인 load/save는 무효(DB 값은 유지). `SaveDocumentPlanModal`의 `GenerationSettings.customInstruction`이 `buildRegeneratePayload`에 spread돼 문서 재생성에도 같은 자유형 규칙 적용; 재생성/대체 동의 전이는 그대로.
- **Task 3 — 피커·가용성·상한 소비**: 모델 Select 블록을 `ModelPicker({choices, value, onSelection, loading, loadFailed, onRetry})`로 교체, `buildModelChoices(byokModels, availability ?? undefined)`. 현재 selection이 쓸 수 없으면(loading/error/false, BYOK 무관) 보내기 버튼·Enter 차단과 사유 표시. `runAttempt`·명시 서비스 키 동의는 실제 attempt selection을 검사하고, 막히면 snapshot·모델·비용 주체를 바꾸지 않음. `ChatMessage.cappedReason`을 말풍선에 전달하고 고정 잔액 toast를 `cappedPresentation(result)?.toast`로 교체(stop은 toast 없음). 계정 기본값 박스는 그대로.

## Verification

- `npx vitest run --project unit tests/ai/ai-instruction-controls.test.ts tests/ai/system-instruction-state.test.ts tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-model.test.ts tests/ai/model-picker.test.ts tests/ai/regenerate-contract.test.ts tests/ai/work-instructions-actions.test.ts tests/ai/save-document-plan-modal.test.ts tests/ai/ai-panel-notice.test.ts tests/ai/capped-reason.test.ts tests/ai/service-availability.test.ts tests/ai/freeform-chat-action.test.ts tests/ai/chat-action.test.ts` → 13 files, 195 tests 통과.
- `tests/studio/chapter-editor-state|kb-editor-state|mobile-workspace-wiring` → 31 통과(공용 AiPanel 소비처 회귀 없음).
- repo `npx tsc --noEmit` 깨끗함. 바뀐 파일에 eslint 오류 없음.
- Task 3 테스트는 SSR 문자열만 보지 않는다: 테스트 전용 hook harness로 실제 send/Enter/retry/동의 handler를 실행하고 `chatAction` 호출 인자, `ChatMessageBubble` props, sonner `toast` 호출을 확인한다(balance/thinking/request_limit/BYOK 8192/stop, frozen selection 반례 2건, replacement 가용성 반례).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] StrictMode에서도 안전한 controller attach/dispose**
- **Found during:** Task 2
- **Issue:** unmount에서 한 번 dispose하면 개발 모드 StrictMode의 effect 재실행 때 controller가 계속 죽어 있음
- **Fix:** `attach()`가 다시 살리고 dispose를 돌려준다. dispose는 알림 없이 seq만 올려서, 다시 attach된 뒤에도 앞 마운트의 응답을 받지 않는다. 회귀 테스트도 추가함.
- **Files modified:** lib/ai/system-instruction-state.ts, tests/ai/system-instruction-state.test.ts
- **Commit:** 2f6c611

**2. [Rule 2 - Correctness] 저장 중 닫기 무시**
- **Found during:** Task 2
- **Issue:** 저장 요청이 진행 중일 때 닫으면 서버에는 저장됐는데 UI는 "취소"로 보일 수 있음
- **Fix:** 저장 중에는 취소·닫기(X/ESC)를 막는다. 닫기 전에 성공이 확인돼야 한다.
- **Commit:** 2f6c611

**3. [Test infra] 기존 `@/components/ui/dropdown-menu` mock은 지우지 않음** (AiPanel이 더는 쓰지 않아도 해가 없음). `ModelPicker`는 mock하지 않고 실제 컴포넌트 그대로 썼다(기존 Select mock으로 SSR 행 검증이 유지되고, props는 element tree에서 확인).

## Known Stubs

없음.

## Gaps / Deferred (04-12 gate)

- 브라우저 수준 focus trap, ESC/취소/재열기, 키보드 동작은 실제 DOM으로 확인하지 않았다(node 환경, UI 테스트 라이브러리 없음) → 04-12.
- 실제 DB에서 work instruction load/save와 실제 유료 제공자 응답의 `cappedReason`은 확인하지 않았다(live-DB suite·`*.database.test.ts`는 실행하지 않음) → 04-12 / 11-12.
- 재생성 모달 전이의 실제 callback UI 회귀는 11-13 담당.
- 지시에 따라 `graphify update .`와 `graph-link-requirements.py`는 실행하지 않았다(오케스트레이터 몫). STATE.md/ROADMAP.md도 수정하지 않았다.

## Commits

- 692aa18 test(04-10): add failing preset dropdown, inline freeform and snapshot tests
- 77c4375 feat(04-10): preset dropdown with inline freeform instruction wired into frozen sends
- 1dce82c test(04-10): add failing work system instruction modal state tests
- 2f6c611 feat(04-10): per-work system instruction modal and freeform regeneration input
- eab9644 test(04-10): add failing picker availability guard and capped reason consumer tests
- 6132469 feat(04-10): consume ModelPicker/service availability and capped result contracts in AiPanel

## Self-Check: PASSED
