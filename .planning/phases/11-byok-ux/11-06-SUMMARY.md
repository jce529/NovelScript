---
phase: 11-byok-ux
plan: 06
subsystem: ai-ui
tags: [byok, chat, retry, consent, accessibility, vitest]

requires:
  - phase: 11-byok-ux
    provides: Server-routed BYOK chat actions and safe replacement result payload
provides:
  - Client-safe BYOK failure and replacement notice decisions
  - BYOK send cost-owner copy and explicit service-key consent UI
  - Frozen replacement-consent attempts that preserve the idempotency key and request snapshot
affects: [ai-panel, byok-chat, provider-errors]

tech-stack:
  added: []
  patterns: [discriminated notice actions, immutable consent attempt derivation]

key-files:
  created: [.planning/phases/11-byok-ux/11-06-SUMMARY.md]
  modified:
    - lib/ai/chat-result.ts
    - lib/ai/chat-request.ts
    - lib/ai/providers/byok-copy.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice.tsx
    - tests/ai/chat-request-lifecycle.test.ts
    - tests/ai/ai-panel-model.test.ts
    - tests/ai/ai-panel-notice.test.ts
    - tests/ai/chat-action.test.ts

key-decisions:
  - "Keep legacy CHAT_COPY.byokPending as an empty compatibility value because out-of-scope server action files still import it; remove the visible pending copy and BYOK_COPY.sendBoundary."
  - "Replacement consent carries the original BYOK selection plus the server-proposed service selection, allowing the server action to revalidate the proposal while preserving the request snapshot and idempotency key."

patterns-established:
  - "BYOK notices carry explicit action discriminants and never render raw provider error data."
  - "Only an explicit consent callback derives and submits a replacement attempt."

requirements-completed: [PROV-06, BYOK-05, BYOK-08]

duration: 4min
completed: 2026-10-08
---

# Phase 11 Plan 06: BYOK Panel UX Summary

**AI 패널에서 BYOK 호출 안내와 오류별 다음 행동을 제공하고, 서비스 키 대체는 명시 동의와 동일 멱등 스냅샷으로 처리한다.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-08T00:58:00Z
- **Completed:** 2026-10-08T01:02:00Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- BYOK 결과를 invalid-key 설정 이동, 세 가지 재시도, replacement 동의 action으로 매핑하고 client-safe 한글 문구를 추가했다.
- BYOK 선택 시 지갑 차감 없음 안내로 비용 문구를 전환하고, key source만으로 전송·재시도·재생성을 차단하던 조건을 제거했다.
- 대체 동의 카드를 알림 영역에 추가했다. 취소가 초기 focus이며, 동의 시 기존 요청 스냅샷과 idempotency key를 유지한 채 서버 제안 선택을 함께 제출한다.
- 테스트 66개가 네 지정 테스트 파일에서 통과했다.

## Task Commits

커밋은 요청에 따라 생성하지 않았다. 상위 orchestrator가 task별로 커밋한다.

## Files Created/Modified

- `lib/ai/chat-result.ts` — 실패 kind와 safe replacement DTO 확장
- `lib/ai/chat-request.ts` — 결과 결정표 및 consent attempt helper
- `lib/ai/providers/byok-copy.ts` — visible send-boundary copy 제거
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — BYOK send, focus, refresh, consent wiring
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice.tsx` — retry/settings/replacement action rendering
- `tests/ai/chat-request-lifecycle.test.ts` — 결정표와 frozen replacement snapshot 테스트
- `tests/ai/ai-panel-model.test.ts` — BYOK 비용 문구 전환 테스트
- `tests/ai/ai-panel-notice.test.ts` — 실패·대체 카드 렌더링 테스트
- `tests/ai/chat-action.test.ts` — 제거된 pending-copy 계약 정리

## Deviations from Plan

### Scope-limited compatibility

기존 `paid-generation.ts`, `actions.ts`, `document-regenerate.ts`가 파일 수정 허용 목록 밖이지만 `CHAT_COPY.byokPending`을 계속 참조한다. 해당 서버 파일을 수정하지 않기 위해 호환 속성은 빈 문자열로 남겼다. `BYOK_COPY.sendBoundary` 및 패널에서 pending copy를 보여주는 코드는 제거했다.

**Upstream result limitation:** 허용된 서버 코드에서 BYOK `invalid_key`와 `credit_exhausted`는 모두 `config`로 합쳐진다. 따라서 새 UI 결정표와 테스트는 세분화된 safe discriminant를 처리하지만 현재 서버 응답만으로 실제 구분까지 할 수 없다. 이를 추측해서 안내하지 않았다. 서버 결과 매핑을 후속으로 수정해야 한다.

## Verification

- `npx.cmd vitest run tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-notice.test.ts tests/ai/ai-panel-model.test.ts tests/ai/chat-action.test.ts --no-file-parallelism` — **PASSED**, 4 files / 66 tests.
- `npx.cmd tsc --noEmit` — 이번 plan 파일 오류 없음. 전체 명령은 범위 밖 `app/layout.tsx:22`의 기존 `LayoutProps` 미정의 오류 1건으로 실패.
- 원격 DB 및 네트워크 통합 테스트는 실행하지 않았다.
- graphify update는 허용된 files_modified 범위 밖 graphify-out 파일을 변경하므로 생략했다.
- 커밋 및 STATE/ROADMAP 변경은 하지 않았다.

## Self-Check: PASSED

- 지정된 9개 plan 파일 변경과 summary 파일 생성 확인.
- 지정 단위 테스트 66개 통과.
- TypeScript에서 이 plan 변경 관련 오류는 없으며, 남은 오류는 범위 밖 `app/layout.tsx` 1건.

## Next Phase Readiness

UI와 client-safe 결과 분기는 준비됐다. 실제 provider의 invalid-key와 credit-exhausted 구분을 사용하려면 허용 범위 밖 `lib/ai/paid-generation.ts`의 결과 매핑을 업데이트해야 한다.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*
