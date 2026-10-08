---
phase: 11-byok-ux
verified: 2026-10-08T00:00:00Z
status: human_needed
score: 7/7 requirements code-verified (브라우저 UAT 6건 대기)
re_verification:
  previous_status: gaps_found
  previous_score: 6/7 requirements fully verified (PROV-06 partial)
  reverified: 2026-10-08T23:40:00+09:00
  gaps_closed:
    - "Gap 1: 문서 재생성 모달 UI-서버 계약 (커밋 b1182f3)"
  gaps_remaining: []
  regressions: []
gaps: []
human_verification:
  - test: "UAT-1 모델 피커 전환: 서비스 모델 <-> BYOK 모델 전환 시 비용 게이지/문구 확인"
    expected: "BYOK 선택 시 '내 키로 호출해요 · 지갑 토큰은 차감되지 않아요'(role=status)가 보이고 비용 추정 게이지는 숨겨진다. 서비스 선택 시 '입력 1,000 + 출력 1,000 토큰 기준 약 N 지갑 토큰' 복귀"
    why_human: "렌더링/카피/aria-live 실제 표시는 브라우저 확인 필요 (UI-SPEC exact copy)"
  - test: "UAT-2 잔액 0 BYOK 성공: 지갑 잔액 0 계정 + 연결된 BYOK 키로 생성"
    expected: "호출 성공, ledger_entries에 해당 idempotency_key 행 0개, wallets.balance 불변, ai_usage 1행(key_source=byok, thoughts_tokens 포함)"
    why_human: "실제 브라우저 전송 + 원격 DB 결과 확인(사전 조건: 잔액 0 작가 계정, 유효한 BYOK 키 1개 연결). 원격 DB 조회는 사용자가 수행"
  - test: "UAT-3 실패 4종 카드: invalid_key / rate_limited / credit_exhausted / unavailable 각각 유도"
    expected: "각 카드가 UI-SPEC exact copy로 구분 표시, invalid_key만 '검증 실패' 전환+설정 링크로 포커스, 나머지는 키 상태 유지+다시 시도 버튼 포커스, 자동 재시도·서비스 폴백 없음"
    why_human: "실제 벤더 오류 유도가 필요(잘못된 키/폐기 키, 한도 초과, 네트워크 차단 등), focus/ARIA는 브라우저 확인. 사전 조건: 제공자별 BYOK 키(유효/무효), 오류 유도 수단"
  - test: "UAT-4 대체 동의: 삭제/failed 키 상태에서 BYOK 모델로 전송"
    expected: "대체 카드가 cancel 버튼에 초기 포커스, 명시 버튼 클릭 전 service 전송 0회(네트워크 탭), 클릭 후 동일 idempotency key로 service 전송 및 지갑 차감. 취소 시 아무 호출 없음. (채팅 경로 + 문서 재생성 모달 경로 모두 확인 대상: 모달은 동의 카드 표시 후 같은 idempotencyKey로 재시도)"
    why_human: "네트워크 호출 횟수/포커스는 브라우저에서만 관찰 가능. 사전 조건: 키 삭제 또는 failed 상태 키, 창 열어 둔 AI 패널"
  - test: "UAT-5 설정 usage 카드: connected / failed / empty / error 상태, 모델별 토글 키보드·ARIA·정렬"
    expected: "이번 달(KST) 제공자별 호출수·입력·출력 토큰 표시(금액 없음), 모델별 토글이 키보드로 동작하고 aria-expanded/controls 정상, 호출수 내림차순 정렬. 사용 기록이 없으면 empty, 조회 실패 시 error"
    why_human: "시각/키보드/ARIA 확인. 사전 조건: BYOK 호출 이력이 있는 계정과 없는 계정, 조회 실패 상태 재현 수단"
  - test: "UAT-6 375px 모바일: 설정 usage 요약과 AI 패널 action 줄바꿈"
    expected: "summary/action 영역이 375px 폭에서 잘림/가로 스크롤 없이 wrap"
    why_human: "반응형 레이아웃은 시각 확인 필요"
---

# Phase 11: BYOK 호출 경로 · 사용 기록 · 실패 UX 검증 보고서

**Phase Goal:** 지갑 잔액이 0인 작가도 자기 키로 막힘없이 생성하고, 실패했을 때 원인별로 다른 안내를 받으며, 이번 달 자기 키의 제공자별 호출 수·토큰 수를 확인할 수 있다.
**Verified:** 2026-10-08
**Status:** human_needed (코드·자동 검증 전부 PASS, Gap 1 해소 확인. 브라우저 UAT 6건만 사용자 단계로 대기)
**Re-verification:** Yes - 2026-10-08 재검증 (커밋 b1182f3 이후)
**작업 폴더:** C:UsersMSINovelScript-p11 (master worktree)

## 자동 검증 결과

| 검증 | 결과 |
| --- | --- |
| `npx vitest run tests --no-file-parallelism` | 119 files / 1251 tests 전부 통과 (재검증, 계약 테스트 2건 추가) |
| `npx tsc --noEmit` | 오류 1건: `app/layout.tsx(22,50) LayoutProps` (worktree에 .next 타입 없는 환경 문제로 합의된 항목). 그 외 오류 없음 |
| `npm run lint` (`--max-warnings=0`) | 경고·오류 0 |



## 요구사항별 판정

| 요구사항 | 판정 | 근거 (파일:줄) |
| --- | --- | --- |
| PROV-06 대체 시 화면 고지, 조용한 전환 없음 | **PASS** (재생성 모달 포함, 재검증) | 채팅 경로 PASS: `byok.ts` `resolveGenerationRoute`(키 없음/failed/모델 불일치/복호화 실패/재확인 불일치 시 `replacement_required`, 약 53-77행) -> `actions.ts:198-213` replacement_required 반환(서비스 호출 없음) -> `paid-generation.ts:118-120` preflight도 차단 -> `chat-request.ts` resolveChatOutcome의 replacement 카드(동의 버튼 `byokAction.kind='replacement'`), `AiPanel.tsx:285-295` `createReplacementAttempt`로 명시 클릭 후에만 `replacementConsent`+`replacementSelection` 재전송. 서버는 `JSON.stringify(route.replacement) === JSON.stringify(replacementSelection)`일 때만 service로 재해석(`actions.ts:192-197`). 재생성 모달 경로(재검증 PASS): `SaveDocumentPlanModal.tsx` handleRegenConfirm이 `replacement_required`를 받으면 서비스 호출 없이 `AiPanelNotice` 동의 카드만 표시, `onUseServiceKey` 클릭 시에만 `replacementConsent:true`+`replacementSelection`을 같은 `regenKeyRef` idempotencyKey로 재전송. 서버 `regenerateDocumentWithTemplateAction`은 chat과 동일한 재도출 일치 검사 후에만 service로 해석 |
| BYOK-05 실패 4종 구분 전달 | **PASS (채팅 + 재생성 모달)** | 분류: `providers/errors.ts:56-76` (429->rate_limited/credit_exhausted, 5xx·status 없음·타임아웃->unavailable, byok 401/403/Gemini 400 API_KEY_INVALID->invalid_key). 자동 재시도 없음: `maxRetries: 0`(openai.ts:41,54 / anthropic.ts:29,42), Gemini `retryOptions.attempts:1`(gemini.ts:~70). 서버 전달: `paid-generation.ts:195-210`이 `info.kind`를 그대로 `failureKind`로 + `CHAT_COPY[kind]`(config로 합치지 않음). UI: `chat-request.ts` `resolveChatOutcome`이 providerId가 있을 때 4종을 제목/본문 분리, invalid_key만 `removeUserTurn`+설정 링크+`router.refresh`(AiPanel.tsx:256-257), 나머지는 `retryable` + 키 상태 유지 문구. 서비스 폴백 없음(replacement는 명시 동의 경로만). 재생성 모달(재검증): chat과 동일한 `resolveChatOutcome`(BYOK일 때 providerId 전달)으로 얻은 4종 원인별 title+body를 배너로 표시. invalid_key는 배너 문구만이고 설정 링크/포커스 이동은 없음(Info) |
| BYOK-06 BYOK 호출은 토큰 차감 없음, 잔액 0이어도 성공 | **PASS** | `paid-generation.ts:121-123` byok preflight는 지갑 read/lease/원장 조회 이전에 반환(잔액 0이어도 차단 없음). `settleInner`(211-214)는 BYOK에서 `apply_wallet_delta`/`findGenerationEntry` 호출 없이 `completed` 반환(원장 접근은 service 분기 218행 이후에만). 테스트 `tests/ai/byok-generation.test.ts`, `paid-generation.test.ts` 통과. live smoke PASS는 사용자 보고 기준(`scripts/verify-byok-generation-live.mjs`). 실제 원격 원장 0행 확인은 UAT-2 |
| BYOK-07 이번 달 제공자별 호출 수·토큰 수 | **PASS (코드) / UI는 UAT** | `usage.ts:32-39` KST 월 경계(UTC 환산), `usage.ts:108-123` `loadMonthlyByokUsage`: 세션 클라이언트(RLS `ai_usage_select_own`) + `.eq('owner_id')` + `.eq('key_source','byok')` + 월 범위, 제공자/모델별 합산·검증. `settings/ai-providers/page.tsx:28-31,49-60` 카드로 전달, `ByokKeyCards.tsx:54-75` 호출 수·입력·출력 표시(금액 없음). `0018_ai_usage.sql` RLS select own |
| BYOK-08 BYOK 선택 시 비용 게이지 숨김 | **PASS (코드)** | `AiPanel.tsx:371-375` `keySource === 'byok'`이면 게이지 대신 '내 키로 호출해요 · 지갑 토큰은 차감되지 않아요', 아니면 추정 비용. 시각 확인은 UAT-1 |
| BYOK-09 BYOK 출력 상한 8192 / service 2048 | **PASS** | `cost.ts:4-5` (2048 / 8192), `paid-generation.ts:122` BYOK ctx `maxOutputTokens: BYOK_MAX_OUTPUT_TOKENS`, service는 `computeMaxOutputTokens`(`cost.ts:27`)가 2048로 cap. `paid-generation.test.ts:44-45` 값 고정 테스트. chat/document-plan/regenerate 모두 `ctx.maxOutputTokens`를 사용 |
| COST-02 모든 AI 호출 사용 기록, 원장 0원 행 없음 | **PASS** | `0018_ai_usage.sql` 별도 테이블(provider, model, key_source, status, input/output/thoughts_tokens, reported flags, work/chapter, idempotency_key, unique(owner_id, idempotency_key)), RLS + service_role insert만. `paid-generation.ts:171-190` 성공/refused 시 공통 `recordUsageBestEffort`(best effort, 실패해도 호출 결과 유지). BYOK는 원장 접근 자체가 없어 0원 행 불가. `usage.ts:48-52` failed/미보고 refusal은 기록 안 함(토큰 없음) |

## 중점 점검 7항목

1. **잔액 0 BYOK 지갑/원장 미접촉 성공:** PASS. 위 BYOK-06 근거. BYOK 분기는 `ctx.admin`을 usage insert와 `mark_byok_failed`에만 사용.
2. **실패 4종 서버->UI 구분:** 채팅 경로 PASS (위 BYOK-05). 문서 재생성 모달 경로도 재검증 PASS (keySource 전달, 4종 문구 chat과 동일 함수).
3. **비밀/prompt/응답/raw 에러 비유출:** PASS. 모든 `console.*`는 `{provider, status, kind, idempotencyKey, stage}` 수준(`errors.ts:87-90`, `paid-generation.ts:186,197,204,236`, `actions.ts:199,382`)이며 raw error 객체/prompt/응답 미출력. `toSanitizedProviderError`는 allowlist로 status/kind/code만 복사하고 Gemini 메시지는 판정에만 사용(errors.ts:41-48). `ProviderCallError`는 info 4필드만 보존. DTO(`ChatResult`)에 키/원문 에러 필드 없음. 사용 기록은 최소 필드만. live 스크립트는 `RESULT/SELF_TEST` 등 요약 출력만(`verify-byok-generation-live.mjs`). 
4. **ai_usage 최소 필드·thoughts_tokens·월간 KST owner-scoped 집계:** PASS. `usage.ts:58-72` insert 필드 = 마이그레이션 컬럼과 일치(prompt/응답 컬럼 없음, thoughts_tokens `?? 0`), 집계 owner-scoped(세션 RLS + owner_id eq), KST 월 범위. 참고: 재생성 BYOK에서 출력 검증 거부(`GenerationRejectedError`)된 호출은 토큰이 소모돼도 usage에 기록되지 않음(Info, 설계상 허용 범위로 판단).
5. **대체 동의 없이 service 호출 불가:** PASS(서버). service 해석은 `replacementConsent && replacementSelection === 서버가 재도출한 replacement`일 때만(`actions.ts:192-197`), 그렇지 않으면 `replacement_required`를 반환하고 `chat()`까지 가지 않는다. 클라이언트 변조로 임의 selection 불가(재도출 값과 불일치 시 거부). 재생성 액션도 동일 로직이며 이제 모달이 정상 호출. 지갑/원장 우회: 재생성은 `preflightPaidGeneration`/`settlePaidGeneration`에 route를 넘기므로 BYOK는 원장 접근 없이 `recordUsageBestEffort`로 ai_usage만 기록, 동의된 service 대체는 정상 차감.
6. **BYOK 8192 / service 2048:** PASS (BYOK-09).
7. **race-safe mark_byok_failed:** PASS. `0018_ai_usage.sql` `update ... where id = p_expected_key_id and status = 'connected'` + `row_count = 1` boolean 반환, execute는 service_role만. 호출은 `paid-generation.ts:202-205`에서 route가 재도출한 `trusted.keyId`를 사용(삭제 후 재등록된 새 키를 오염시키지 않음). `byok.ts` `markByokFailed`는 `data === true`만 성공. 키 id 재확인은 `resolveGenerationRoute`에서 복호화 후 한 번 더 수행. DB 테스트(`byok-db.test.ts`, `ai-usage-db.test.ts`) 통과.

## Gaps Summary

### Gap 1 - CLOSED (커밋 b1182f3, 재검증 2026-10-08)

- `lib/ai/regenerate-contract.ts`로 `regenerateSchema`를 분리, 서버 액션과 계약 테스트가 동일 스키마를 import. 모달은 `buildRegeneratePayload`(RegeneratePayload 타입에서 keySource 필수)로 payload를 만들고, `AiPanel.tsx`가 `modalMessage.keySource ?? keySource`를 generation에 전달(메시지 메타에 keySource 저장, 대체 동의 시 'service').
- 반례 탐색: 서버 우회 경로 없음(replacementSelection은 서버 재도출 값과 불일치 시 거부, 모달 외 regenerate 호출자 없음). 동의 전 service 호출 0회, 동의 후 같은 key로 재전송.
- 잔여 약점(Info, blocker 아님): `tests/ai/regenerate-contract.test.ts`는 모달 핸들러를 실행하지 않고 `buildRegeneratePayload`에 손으로 만든 입력을 넣어 `regenerateSchema.safeParse`만 확인한다. keySource 누락 회귀는 필수 타입(tsc)이 막지만, 모달의 replacement 상태 전이(동의 전 0회, 동의 후 같은 key)는 자동 테스트가 없어 UAT-4에서 확인해야 한다. invalid_key 재생성 실패는 배너 문구만 표시(설정 링크 없음).

### 기타 Info (blocker 아님)
- BYOK 경로는 service와 달리 같은 idempotencyKey 이중 전송을 사전 차단하지 않는다(lease/ledger 선조회 없음). usage unique 제약이 기록 중복만 막는다. BYOK는 플랫폼 과금이 없어 허용 가능하나 사용자 키로 중복 호출이 갈 수 있음.
- 11-VALIDATION.md는 UAT 완료 전이므로 `approved`가 될 수 없음(11-08 Task 2 대기).

## Human Verification Required

11-08 Task 2의 브라우저 UAT 6개 시나리오는 사용자가 수행한다(자동화 불가). 위 frontmatter `human_verification`에 시나리오·기대 결과·사전 조건을 정리했다. 요약:

| # | 시나리오 | 사전 조건 |
| --- | --- | --- |
| 1 | service<->BYOK 피커 전환 시 비용 게이지/무차감 문구 | 서비스 모델 + 연결된 BYOK 모델이 모두 보이는 작가 계정 |
| 2 | 잔액 0 BYOK 성공, ledger 0행 / ai_usage 1행 | 잔액 0 지갑, 유효 BYOK 키, 원격 DB 확인 수단 |
| 3 | 실패 4종 카드 exact copy, invalid만 '검증 실패', focus | 무효/폐기 키, 한도·크레딧·네트워크 오류 유도 수단 |
| 4 | 대체 동의: cancel 초기 포커스, 동의 전 전송 0회, 동의 후 동일 idempotency 전송 | 삭제 또는 failed 키 상태의 BYOK 선택 |
| 5 | 설정 usage 카드 connected/failed/empty/error, 모델 토글 키보드·ARIA·정렬 | BYOK 호출 이력 있는/없는 계정 |
| 6 | 375px에서 summary/action wrap | 모바일 폭 뷰포트 |

**참고:** UAT-3/4에 문서 템플릿 재생성 모달 경로도 포함해 확인할 것.

---

_Verified: 2026-10-08 (재검증 2026-10-08T23:40+09:00)_
_Verifier: Claude (gsd-verifier)_
