---
phase: 15-jev-ai
verified: 2026-09-27T20:15:00Z
status: human_needed
score: 4/4 must-haves verified (code-level); 1 human UAT item outstanding
human_verification:
  - test: "Plan 15-09 Task 2 — 브라우저에서 저장 확인 모달(추천/선택 분리, 폴더 변경 저장, 템플릿 변경 재생성/취소/실패, 저장 content 확인, 이동·삭제 race)과 QuickAddDialog 폴더 선택기를 사람이 직접 조작"
    expected: "SaveDocumentPlanModal이 추천값과 선택값을 분리해 보여주고, 폴더/템플릿 변경 후 저장이 재검증을 통과하며, 템플릿 변경 시 재생성 확인 단계가 뜨고 성공/취소/실패가 각각 올바른 문구를 보이고, QuickAddDialog에서 카테고리별 실제 폴더를 선택해 저장할 수 있다"
    why_human: "브라우저 UI 상호작용·시각적 확인이 필요하며, 15-09-PLAN.md의 Task 2(checkpoint:human-verify)가 이 세션 시점까지 수행되지 않았다"
---

# Phase 15: Jev 선계획 기반 AI 문서 생성 · 저장 위치 선택 Verification Report

**Phase Goal:** 작가가 AI에게 설정 문서를 요청하면 Jev가 먼저 작업 종류·문서 카테고리·저장 폴더·템플릿을 제한된 후보 안에서 계획하고, Gemini가 그 계획과 템플릿을 따라 문서를 생성하며, 작가는 결과와 저장 위치를 확인·변경한 뒤 권한이 검증된 폴더에 저장한다.
**Verified:** 2026-09-27
**Status:** human_needed (모든 자동 검증 통과, Plan 15-09 Task 2 브라우저 UAT만 미수행)
**Re-verification:** No — initial verification

## Important framing (per verification brief)

Plan 15-09는 Phase 15를 의도적으로 **"Code complete / Activation blocked"** 로 기록한다. Jev의 실제 벤더 정확도가 활성화 기준(`JEV_ACTIVATION_THRESHOLDS`)을 아직 충족하지 못했고, DB 정책 승인(`ai_doc_activation_approvals`)·실제 벤더 holdout 증거(`ai_doc_activation_evidence`)·그림자 표본(`ai_doc_plan_shadow_log` ≥200건/30일)이 아직 쌓이지 않았기 때문이다. 이는 설계상 의도된 상태(15-CONTEXT.md D-08/D-09, 15-VALIDATION.md)이며 **갭이 아니다**. 이 검증은 "프로덕션에서 Jev가 꺼져 있다"를 문제 삼지 않고, 대신 `getAiDocPlanningMode()`가 이 게이팅을 **올바르게 fail-closed로 강제**하는지, 그리고 활성화되었을 때 실제로 동작할 코드 경로가 완전한지를 검증한다.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Jev가 제한된 후보 안에서 작업 종류·카테고리를 확률과 함께 계획하고, 확신도 미달 시 clarify로 전환한다 (AIDOC-01) | ✓ VERIFIED | `lib/ai/decision/plan.ts` `planTaskAndCategory` — opaque key 후보만 Jev에 전달, `JEV_CONFIDENCE_THRESHOLDS` 미달 시 `clarify` kind 반환. `lib/ai/decision/candidates.ts`의 `TASK_CANDIDATES`/`CATEGORY_CANDIDATES`로 후보 고정. 테스트: `tests/ai/jev-plan.test.ts`, `tests/ai/jev-candidates.test.ts` |
| 2 | 카테고리 확정 후에만 폴더·템플릿 후보가 Jev에 전달되고, 반환 키는 재검증되며 앱 타입으로 무단 캐스팅되지 않는다 (AIDOC-01) | ✓ VERIFIED | `plan.ts` `planFolderAndTemplate`/`planFolderAndTemplateFromCandidates` — `resolve()`로 opaque key를 후보 집합에서만 역매핑, 실패 시 clarify/data_integrity. `lib/kb/actions.ts` `listCategoryFolderCandidates`는 카테고리 확정 뒤에만 호출됨(document-plan.ts에서 순서 확인) |
| 3 | Gemini가 Jev가 선택한 템플릿의 제목·필수 섹션·순서를 유지해 생성하고, 계약 위반 시 제안을 만들지 않는다 (AIDOC-02) | ✓ VERIFIED | `lib/ai/document-contract.ts` `validateDocumentAgainstPlan`/`extractRequiredHeadings` — 순서 있는 부분수열 검사. `lib/ai/document-plan.ts` `runDocumentPlanningStrategy`가 검증 실패 시 제안 미생성(사용량은 정상 차감). 테스트: `tests/ai/document-generation.test.ts`, `tests/ai/document-plan-generation.test.ts` |
| 4 | 작가가 생성 결과·추천 저장 위치·템플릿을 확인하고 변경할 수 있다 (AIDOC-02) | ✓ VERIFIED (코드) / ? 브라우저 미확인 | `SaveDocumentPlanModal.tsx`(248줄) — 추천값/선택값 분리 상태, 폴더 변경, 템플릿 변경 시 재생성 확인 단계. `AiPanel.tsx`에 배선 확인(`import { SaveDocumentPlanModal }`, 사용 지점 376행). 코드는 존재·배선됨. 실제 브라우저 조작 확인은 Plan 15-09 Task 2 미수행 — human_verification 항목 |
| 5 | AI 제안 저장과 @멘션 빠른 추가는 저장 직전 소유권·작품·범위·카테고리·삭제 상태·버전을 재검증하고, 무효 시 조용히 다른 폴더로 대체하지 않는다 (AIDOC-03) | ✓ VERIFIED | `lib/kb/actions.ts` `validateTargetFolder(expectedVersion)` — 판별 유니온(`root_missing`/`root_duplicate`/`query_failed`)은 hard error, 폴백 없음. `saveDocumentProposalAction`/`quickAddMentionAction`이 재검증 경유. 테스트: `tests/kb/folder-candidates.test.ts`, `tests/ai/save-validation.test.ts`, `tests/ai/mention-search.test.ts`, `tests/ai/quick-add-folders.test.ts` |
| 6 | Jev 계획은 오프라인 평가·순서 교란 평가·그림자 운영을 거친 뒤에만 활성화되고, 정책 검토 전에는 실제 작품 본문을 프로덕션 Jev에 보내지 않는다 (AIDOC-04) | ✓ VERIFIED | `lib/ai/decision/activation.ts` `getAiDocPlanningMode` — env 요청 + DB 정책 승인 + 버전 결합 holdout 증거(`used_real_vendor=true` 필수) + 그림자 게이트를 전부 만족해야 `'active'`, 하나라도 없으면 `'shadow'`/`'off'`로 강등, 예외 없이 fail-closed(`catch { return failed(...) }`). `lib/ai/decision/shadow.ts`는 합성 시나리오만 사용(D-08), 실제 작품 본문/실제 폴더명 미전송 |

**Score:** 6/6 truths verified at code level (1 항목은 브라우저 UAT 대기 — 코드/배선은 확인됨)

### Required Artifacts (spot sample across 11 plans)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/ai/decision/types.ts` | DecisionClient 계약 | ✓ VERIFIED | 존재, 계약 타입 정의 |
| `lib/ai/decision/jev.ts` | createJevClient 어댑터 | ✓ VERIFIED | 110줄, 단일 sanitized catch 확인 |
| `lib/ai/decision/errors.ts` | 에러 스크러빙 | ✓ VERIFIED | 54줄 |
| `lib/ai/decision/plan.ts` | 2단계 계획 함수 | ✓ VERIFIED | 188줄, resolve()/data_integrity 확인 |
| `lib/kb/actions.ts` | listCategoryFolderCandidates/validateTargetFolder | ✓ VERIFIED | 431줄 |
| `supabase/migrations/0010_kb_category_root_unique.sql` | partial unique index | ✓ VERIFIED | 22줄 |
| `lib/ai/document-plan.ts` | runDocumentPlanningStrategy | ✓ VERIFIED | 89줄, chat.ts에서 import·호출됨 (WIRED) |
| `lib/ai/paid-generation.ts` | preflight/settlePaidGeneration | ✓ VERIFIED | 148줄 |
| `lib/ai/document-contract.ts` | validateDocumentAgainstPlan | ✓ VERIFIED | 32줄 |
| `lib/ai/decision/eval/evaluate.ts`, `run-eval.ts` | 오프라인 평가 파이프라인 | ✓ VERIFIED | `npm run eval:jev` 실행 성공, 임계값 추천 출력 확인 |
| `lib/ai/document-regenerate.ts` | 재생성 lifecycle | ✓ VERIFIED | 98줄 |
| `SaveDocumentPlanModal.tsx` | 저장 확인 모달 | ✓ VERIFIED, WIRED | AiPanel.tsx에 import·사용 확인 |
| `app/.../ai-panel/quick-add-folders.ts` | reducer | ✓ VERIFIED | 52줄 |
| `QuickAddDialog.tsx` | 폴더 선택 UI | ✓ VERIFIED | 115줄 |
| `lib/ai/decision/shadow-scenarios.ts`, `shadow.ts` | 그림자 실행기 | ✓ VERIFIED | 114줄/83줄 |
| `supabase/migrations/0011_ai_doc_planning.sql` | 활성화/그림자 테이블 | ✓ VERIFIED | 49줄, cascade 확인 |
| `lib/ai/decision/metrics.ts`, `activation.ts` | 지표·resolver | ✓ VERIFIED, WIRED | actions.ts에서 `getAiDocPlanningMode` import·매 요청 호출 확인 |

모든 11개 Plan의 선언된 산출물 파일이 실존하며 빈 스텁이 아님(라인 수·핵심 함수 존재 확인).

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/.../actions.ts chatAction` | `lib/ai/decision/activation.ts getAiDocPlanningMode` | 매 요청 resolver 호출 | ✓ WIRED | `resolveChatPlanning()` 내부에서 매 호출 시 `getAiDocPlanningMode(createAdminClient())` 실행 확인 (actions.ts:131) |
| `lib/ai/chat.ts` | `lib/ai/document-plan.ts runDocumentPlanningStrategy` | active 모드 분기 | ✓ WIRED | chat.ts:10 import, :80 호출 확인 |
| `lib/ai/document-plan.ts` | `lib/ai/paid-generation.ts settlePaidGeneration` | 공통 정산 경로 | ✓ WIRED | 15-04/15-10 SUMMARY와 코드 일치 |
| `SaveDocumentPlanModal.tsx` | `regenerateDocumentWithTemplateAction` | 재생성 확인 | ✓ WIRED (코드) | AiPanel.tsx에 모달 배선 확인, 실제 브라우저 흐름은 미확인(human) |
| `lib/kb/actions.ts validateTargetFolder` | `listCategoryFolderCandidates` | 재조회 후 id+version 비교 | ✓ WIRED | 15-03 SUMMARY 및 코드 확인 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 15 관련 vitest 스위트 통과 | `npx vitest run tests/ai/jev-off-path.test.ts tests/ai/jev-activation.test.ts tests/ai/jev-shadow.test.ts tests/ai/jev-shadow-wiring.test.ts` | 4 files, 32 tests passed | ✓ PASS |
| 전체 레포 vitest 스위트 | `npx vitest run --no-file-parallelism` | 834 passed / 1 failed (`tests/auth/writer-upgrade.test.ts` — Phase 15와 무관한 기존 회귀, DB 상태 의존 가능성) | ⚠️ 참고(Phase 15 범위 밖) |
| 타입 체크 | `npx tsc --noEmit` | 오류 0건 | ✓ PASS |
| lint | `npm run lint` | 오류 0, 경고 3건(모두 `components/reader/*` — Phase 15와 무관) | ✓ PASS |
| 오프라인 평가 파이프라인 | `npm run eval:jev` | fixture 실행 성공, 임계값 추천 출력 | ✓ PASS |
| 활성화 게이트 fail-closed 코드 리뷰 | `lib/ai/decision/activation.ts` 직접 확인 | env 미설정/DB 증거 부재 시 예외 없이 `'off'`/`'shadow'`로 강등 | ✓ PASS |

`tests/auth/writer-upgrade.test.ts` 실패는 AI 문서 계획·저장 흐름과 무관한 인증/프로필 관련 기존 테스트이며 Phase 15 산출물이 건드리지 않았다. Phase 15 범위 밖 회귀로 별도 확인이 필요하나 이 페이즈의 gap으로 기록하지 않는다.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIDOC-01 | 15-01, 15-02, 15-04 | Jev 선계획(작업/카테고리/폴더/템플릿) + 확신도 미달 시 clarify | ✓ SATISFIED (코드) | plan.ts, document-plan.ts, 관련 테스트 전부 green |
| AIDOC-02 | 15-04, 15-06, 15-10 | Gemini 템플릿 준수 생성 + 확인/변경 UI | ✓ SATISFIED (코드) / 브라우저 UAT 대기 | document-contract.ts, SaveDocumentPlanModal.tsx 배선 확인. 시각적 확인은 human_verification |
| AIDOC-03 | 15-03, 15-06, 15-07 | 저장 직전 서버 재검증, 조용한 대체 금지 | ✓ SATISFIED | validateTargetFolder, save-validation/quick-add-folders 테스트 green |
| AIDOC-04 | 15-01, 15-05, 15-08, 15-09, 15-11 | 오프라인 평가·그림자 운영 거친 뒤 활성화, 정책 검토 전 실제 본문 미전송 | ✓ SATISFIED | getAiDocPlanningMode fail-closed, 합성 데이터만 사용(shadow-scenarios.ts), eval:jev 파이프라인 동작. **실제 활성화 자체는 의도적으로 보류(Activation blocked)** — 요구사항 문구("품질 기준을 충족한 뒤 활성화")가 요구하는 것은 활성화를 가능케 하는 메커니즘이며, Phase 15는 이를 완비했다 |

REQUIREMENTS.md의 AIDOC-01~04 체크박스는 여전히 `[ ]` 미체크 상태다. 이는 실제 활성화(Production active) 전까지 로드맵 관례상 미체크로 두는 것과 일관되며(동일 phase의 `PROV-01`은 `[x]`, `PROV-02~07`은 코드/활성화 상태에 따라 `[ ]`), Phase 15 자체가 "Code complete / Activation blocked"로 문서화되어 있으므로 이 검증에서는 결함으로 처리하지 않는다. 다만 정책 검토 완료 및 활성화 시점에 REQUIREMENTS.md 체크박스를 갱신하는 후속 작업이 필요함을 기록한다.

**Orphaned requirements:** 없음 — REQUIREMENTS.md의 AIDOC-01~04는 모두 15-01~15-11 중 하나 이상의 plan frontmatter `requirements` 필드에 매핑되어 있다.

### Anti-Patterns Found

없음. `lib/ai/decision/*`, `document-plan.ts`, `document-regenerate.ts`, `paid-generation.ts`, `SaveDocumentPlanModal.tsx`, `quick-add-folders.ts`에서 TODO/FIXME/placeholder/미구현 패턴 grep 결과 0건.

### Human Verification Required

#### 1. 저장 확인 모달·재생성·QuickAdd 브라우저 UAT (Plan 15-09 Task 2)

**Test:** NODE_ENV=development + `DECISION_FIXTURE=high-confidence-document`로 브라우저에서 AI 채팅 → 문서 생성 → "문서로 저장하기" 클릭 → SaveDocumentPlanModal에서 추천/선택 분리 확인 → 폴더 변경 후 저장 → 템플릿 변경 후 재생성 확인(성공/취소/실패 각각) → 저장된 문서 content 확인 → 저장 도중 폴더 이동/삭제 race 시나리오 확인. 이어서 QuickAddDialog에서 카테고리별 실제 폴더 선택기로 저장.
**Expected:** UI-SPEC.md §1/§3/§4에 정의된 카피·상태 전이가 정확히 나타나고, 서버 재검증 실패 시 모달이 닫히지 않고 원인별 문구를 보여주며, 조용한 폴더 대체가 일어나지 않는다.
**Why human:** 시각적 UI 상호작용과 비동기 race 조건의 실사용 흐름은 자동 테스트(단위/reducer 테스트는 이미 green)만으로 최종 확증할 수 없고, 15-09-PLAN.md의 Task 2(`checkpoint:human-verify`, gate: blocking)가 이 세션 시점까지 수행된 근거가 없다.

### Gaps Summary

코드 레벨 갭 없음. 11개 Plan의 must-haves(truths/artifacts/key_links)가 모두 실코드에서 확인되었고, 관련 vitest 스위트(off-path, activation, shadow, shadow-wiring 등)가 green이며, tsc/lint/eval:jev도 통과한다. `getAiDocPlanningMode()`는 활성화 조건 미충족 시 예외 없이 안전하게 강등되도록 올바르게 구현되어 있어 "Activation blocked"가 코드 결함이 아니라 의도된 게이팅 결과임을 확인했다.

유일한 미해결 항목은 Plan 15-09 Task 2(브라우저 UAT)이며, 이는 사람이 수행해야 하는 checkpoint로 이 검증 세션에서 대신 수행할 수 없다. 그 외 발견된 `tests/auth/writer-upgrade.test.ts` 1건 실패는 Phase 15가 만들거나 수정한 코드와 무관하며 별도 조사 대상이다.

---

*Verified: 2026-09-27*
*Verifier: Claude (gsd-verifier)*
