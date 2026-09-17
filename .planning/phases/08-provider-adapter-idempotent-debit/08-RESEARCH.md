# Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정 — Research

**Researched:** 2026-09-17
**Requirements:** PROV-01, COST-01
**Confidence:** HIGH for repository/installed SDK facts; MEDIUM for estimator calibration and live refusal usage.
**Status:** Research complete; planning awaits UI design contract.

## Summary

기존 DI 구조를 프로젝트 소유 `ProviderClient`로 일반화한다. Gemini만 등록하고, 사전 입력 토큰 계산을 동기 로컬 추정으로 교체한다. 실제 차감은 제공자 사용량으로 계산한다. 클라이언트 전송 UUID를 원장의 stable reference로 사용하고, 처리된 키는 제공자 호출 전에 조회한다. 스키마·새 벤더·BYOK·자동 재시도는 추가하지 않는다.

중요한 발견은 세 가지다. (1) 기존 원장 RPC는 unique 충돌 처리보다 잔액 부족 검사가 먼저다. (2) 기존 AiPanel에는 컨텍스트가 가정한 인라인 오류 영역이 없고 토스트만 있다. (3) 설치된 SDK의 retry 문서만 보고 현재 요청이 자동 재시도된다고 단정하면 안 된다. 구현은 retryOptions가 없으면 단일 fetch를 실행한다.

## User Constraints and Precedence

- `08-CONTEXT.md` D-01~D-12와 discretion 범위를 기준으로 한다.
- `ROADMAP.md` Phase 8의 정상 생성 회귀, 중복 차감 방지, 로컬 추정, 구조화 거절 처리가 성공 기준이다.
- `REQUIREMENTS.md`: PROV-01, COST-01을 계획 frontmatter에 매핑한다.
- `.planning/research/STACK.md`의 "Gemini remote countTokens 유지" 및 공통 tokenizer 제안은 최신 Phase 8 컨텍스트/로드맵과 충돌한다. 이번에는 Gemini도 원격 사전 카운팅을 제거한다. 새 tokenizer 패키지는 필수 아님.
- `.planning/research/ARCHITECTURE.md`의 `listModels()`는 후속 BYOK 스코프다. Phase 8 인터페이스에 미구현 필수 메서드를 추가하지 않는다.
- Phase 4의 모델 티어·프롬프트·상한 및 Phase 7의 생성 전/차감 직전 쓰기 권한 확인을 보존한다.
- 기존 모델 ID/가격표는 이관 기준이며 최신 모델 추천이 아니다. 이번 리서치에서 모델 교체나 가격 정책 변경을 승인하지 않는다.

## Standard Stack

| Area | Existing dependency / pattern | Phase 8 use |
|---|---|---|
| Runtime | Next.js 16.3.2, React 19.2.8 | 기존 Server Action + AiPanel |
| Provider | `@google/genai` ^2.19.0, installed declarations/source | 어댑터 내부 SDK 호출과 정규화 |
| Validation | zod ^4.4.3 | commerce의 UUID validation 재사용 |
| Database | Supabase, `apply_wallet_delta` | 기존 원장 unique + 행 잠금 재사용 |
| Tests | Vitest 4.1.11, node environment | DI/mock unit, 실제 DB integration 구분 |

새 프레임워크·서비스·스키마는 필요 없다. `server-only`는 런타임 제공자/registry 모듈에 유지하고, UI가 사용하는 공용 타입은 type-only import로 연결한다.

## Architecture and File Responsibilities

| Path | Responsibility |
|---|---|
| `lib/ai/providers/types.ts` (new) | ProviderClient, GenerateParams/Result, UsageReport, normalized refusal/error contracts |
| `lib/ai/providers/gemini.ts` (new) | 유일한 SDK import, usage/refusal mapping, sanitized errors |
| `lib/ai/providers/registry.ts` (new) | 플랫폼 Gemini factory와 현재 lite/pro 모델 매핑 |
| `lib/ai/providers/errors.ts` (new, if useful) | status/kind/code allowlist; raw error 제외 |
| `lib/ai/token-estimate.ts` (new) | provider별 명명 상수를 사용하는 순수 로컬 추정 |
| `lib/ai/gemini.ts` | 모든 소비자 이관 후 제거 또는 임시 re-export; SDK 구현 중복 금지 |
| `lib/ai/chat.ts` | ledger precheck → local cap → provider → permission recheck → debit → refusal/parse |
| `app/studio/[workId]/chapters/[chapterId]/actions.ts` | 인증, 입력 검증, registry, balance refresh |
| `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` | 전송 키 수명, 재전송, 인라인 오류/거절, 잔액 |

추천 인터페이스는 `generateContent(params): Promise<GenerateResult>`와 `estimateInputTokens(systemInstruction, contents): number`다. `GenerateResult`는 `text`, 정규화된 `finishReason`, `usage`, `refusal`을 가진다. 현재 `maxOutputTokens`, temperature 0.9, system/user string 조합은 유지한다. prompt.ts의 프로토콜을 fork하지 않는다.

## Idempotency and Settlement

### Request identity

클라이언트의 한 전송 객체에 UUID와 불변 payload snapshot을 함께 보관한다. pending ref를 첫 await 이전에 잠가 같은 이벤트 턴의 더블클릭도 차단한다. 같은 payload의 네트워크 재전송은 UUID를 유지한다. 성공 후 '다시 생성하기'는 새 생성 의도이므로 새 UUID를 만든다. 사용자가 내용·멘션·프리셋을 바꾸면 새 전송이다. 실패한 user turn을 history에 다시 추가하지 않는다.

`chatAction`에서 UUID 형식을 검증하고 ownerId는 세션에서만 도출한다. wallet_id + reference_type='ai_generation' + reference_id=idempotencyKey 전체로 조회한다. 다른 사용자의 같은 UUID가 영향을 주면 안 된다. 조회 실패를 "기록 없음"으로 간주하면 안 된다.

처리된 키는 저잔액 검사와 제공자 호출 전에 `already_processed` 결과 및 현재 잔액을 반환한다. 이전 결과 본문은 복구하지 않는다. 정상 완료와 거절 모두 같은 reference를 사용한다.

### Concurrent requests and existing RPC trap

`supabase/migrations/0001_init.sql:36`의 RPC 순서는 wallet FOR UPDATE → balance + delta 검사 → ledger INSERT ON CONFLICT DO NOTHING → wallet UPDATE다. 두 요청이 사전 조회를 통과할 수 있다. unique는 이중 차감을 방지하지만, 첫 요청이 잔액을 소진하면 두 번째는 unique 처리 전에 insufficient balance로 실패한다.

스키마를 바꾸지 않는 대응: debit 실패 시 같은 scoped ledger reference를 재조회한다. 이미 있으면 processed 안내와 현재 잔액을 반환한다. 없으면 settlement 실패로 반환하고 생성된 본문/초안/제안을 노출하지 않는다. DB 오류 원문은 로그/응답으로 내보내지 않는다. 이 경로에서 새 UUID나 자동 재호출을 만들지 않는다.

동시 동일 키가 아직 원장에 없으면 제공자가 두 번 호출되는 것은 여전히 가능하다. D-03은 **이미 기록된 키**를 차단하며, discretion은 경합 시 최소 한 번만 차감하도록 요구한다. 프로세스 Map을 분산 잠금으로 주장하거나 별도 예약 테이블을 몰래 도입하지 않는다. 네트워크 결과 유실/차감 실패 후 미기록 키의 사용자 재전송 역시 외부 원가 중복 가능성이 남는다.

### Local estimate and insufficient funds

완성된 systemInstruction + contents를 모두 추정한다. 한국어·영문·이모지·긴 history·멘션을 fixture로 둔다. 초기 휴리스틱 후보는 Unicode code point 분류 후 ASCII 0.25, 비ASCII 2.0 토큰 가중치에 1.25 여유 계수와 32 토큰 overhead를 더해 올림하는 방식이다. 이는 **설계 후보**이며 토크나이저 상한 보장이 아니다. Gemini별 상수로 분리하고 짧은/긴 한국어 샘플에서 실사용 입력 토큰과 비교해 보정한다. runtime countTokens 호출은 0건이어야 한다.

기존 2048 출력 상한/가격표는 유지한다. 사후 사용량이 추정보다 크거나 다른 요청이 먼저 지갑을 사용하면 RPC가 차감을 거절할 수 있다. 이때 금액을 임의로 잔액에 맞춰 줄이거나 음수 잔액을 허용하지 않는다. 새 ledger가 없으면 안전한 차감 실패 + 현재 잔액, 생성 결과 비노출로 끝낸다. 거절 차감도 같은 정책이다. 정확한 사전 예약 보장은 이 범위 밖이다.

## Gemini Refusal and Usage

공식 API는 입력 차단을 promptFeedback, 후보 완료 사유를 finishReason으로 구분한다. usage는 prompt/candidate/total 및 thinking 등 별도 필드가 있으므로 total을 출력 토큰으로 사용하지 않는다. [Gemini API reference](https://ai.google.dev/api/generate-content)

- 후보가 없고 promptFeedback.blockReason이 있으면 입력 차단으로 정규화한다.
- 텍스트 정책 목록: SAFETY, RECITATION, BLOCKLIST, PROHIBITED_CONTENT, SPII. SDK의 IMAGE_SAFETY, IMAGE_PROHIBITED_CONTENT, IMAGE_RECITATION도 방어적으로 처리할 수 있다. LANGUAGE/OTHER/MAX_TOKENS를 임의로 safety로 분류하지 않는다.
- STOP + 문장으로 된 거절은 D-05대로 일반 응답이다. 문장 정규식으로 감지하지 않는다.
- refusal을 감지하면 adapter 경계에서 text를 비우고 사유 코드만 반환한다. chat.ts는 parseChatResponse 이전에 분기한다. raw blockReasonMessage나 partial content를 반환하지 않는다.
- 실사용 promptTokenCount/candidatesTokenCount를 기존 비용 함수에 매핑한다. thoughtsTokenCount는 별도 보존 가능하나 total과 후보 토큰의 차이를 자동 출력 비용으로 추가하면 기존 과금이 달라진다. thinking 과금 재설계는 명시적 후속 결정으로 남긴다.
- usageMetadata 필드는 선택적이다. 누락된 수치를 로컬 추정으로 채워 과금하지 않는다. 보고된 유효한 비음수 정수만 사용하고, 누락 여부를 내부적으로 구분한다. 전체 누락 시 known usage 0으로 처리하되 "실제 사용량이 0이었다"고 주장하지 않는다.
- D-06은 앱의 보고 사용량 기반 차감 결정이다. 공식 문서만으로 모든 차단 요청이 항상 usage를 반환하거나 동일하게 벤더 청구된다고 확인하지 못했다. A/B fixtures와 live observation을 구분한다.

0으로 계산된 완료/거절도 기존 RPC의 delta=0으로 처리 완료 reference를 남길 수 있다. 이 행은 Phase 8 플랫폼 요청의 재실행 방지용이며, 후속 BYOK를 0원 원장으로 구현하라는 뜻이 아니다. executor는 기존 RPC의 zero delta 허용과 duplicate precheck를 테스트로 입증해야 한다.

## Error Boundary and Retry Policy

SDK ApiError에는 numeric status가 있다. 429 → rate_limited, 5xx/timeout/network → unavailable, 인증·모델 등 나머지 4xx → config로 정규화한다. status는 정상 범위만, providerErrorCode는 사전에 정한 enum만 복사한다. 원문 message/stack/cause/config/request/headers 및 임의 코드 문자열은 복사하지 않는다. 로그에는 provider/status/kind/idempotencyKey만 남긴다. 설정 누락도 같은 안전한 경계에 포함한다.

공식 retry 옵션에서 attempts 1은 재시도를 끈다. [HttpRetryOptions](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html) 설치된 `dist/node/index.mjs:13865`는 retryOptions가 없으면 단일 fetch를 실행하고, 옵션이 있을 때 attempts 기본값을 적용한다. 이관 후 `httpOptions.retryOptions.attempts=1`을 명시하고 429/503 mock에서 호출 수 1을 검증하면 정책이 분명해진다. Phase 11 이전에 자동 재시도 루프를 추가하지 않는다.

## UI Findings and Planning Gate

`AiPanel.tsx:91`은 오류 시 toast.error 후 반환한다. 현재 오류 state/사유 접기/remainingBalance 소비가 없다. 계정 잔액은 `components/layout/site-header.tsx`가 조회하고 account-panel에 prop으로 전달한다. 새 결과에 remainingBalance가 있어도 그 자체로 헤더가 갱신되지 않는다.

UI-SPEC에서 D-07~D-09를 다음처럼 구체화해야 한다: 기존 패널 내부의 말풍선 밖 상태 영역, 거절 한국어 안내, 사용한 **지갑 토큰**과 잔액의 단위, 사유 코드+짧은 설명만 있는 접근 가능한 접기, transport retry와 성공 후 regeneration 구분, 네트워크 실패 시 pending 해제. 소스의 toast를 단순히 "기존 인라인 자리"라고 가정하지 않는다.

Next.js 로컬 가이드 `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`를 확인했다. action의 refresh/revalidatePath는 현재 RSC tree 갱신과 연결되고, 반환값만 변경하면 서버 잔액 UI는 갱신되지 않는다. 성공뿐 아니라 차감된 refusal/processed 결과에서도 필요한 refresh를 설계한다. 입력 검증과 인증은 action 내부에서 수행한다.

`workflow.ui_phase=true`, `workflow.ui_safety_gate=true`, auto chain=false이며 Phase 8 UI-SPEC이 없다. 로드맵 제목의 영문 키워드 유무와 무관하게 실제 CONTEXT의 접기/잔액 UI 스코프를 확인했으므로 plan-phase 5.6의 디자인 계약 게이트가 적용된다. **PLAN.md는 작성하지 않았다.** 다음: `$gsd-ui-phase 8`, 이후 `$gsd-plan-phase 8` (이 리서치를 재사용).

## Validation Architecture

**Framework:** Vitest 4.1.11; `vitest.config.ts`, Node, `tests/**/*.test.ts`. `server-only` alias가 이미 있다. 브라우저 DOM 테스트 도구는 package.json에 없다.

**Baseline actually run:** `npm test -- tests/ai/cost-estimate.test.ts tests/ai/gemini-client.test.ts tests/ai/prompt-composition.test.ts` — 3 files / 24 tests passed, Vitest 389 ms. 현재 코드의 단위 기준선일 뿐 새 기능 검증이 아니다.

**Planned fast tests:** adapter SDK-mocked mapping; estimator fixtures; chat DI + fake Supabase ledger/RPC; request-lifecycle pure helper if extracted. `tests/ai/chat.test.ts`는 실제 Supabase admin user를 만드는 integration suite이므로 offline quick command에 무심코 포함하지 않는다.

| Requirement | Required cases | Proposed evidence |
|---|---|---|
| PROV-01 | prompt/mentions, presets/styles, reply/draft/proposal, MAX_TOKENS unchanged | existing regressions + adapter fixtures |
| PROV-01 | input blocked/no candidates; each safety finish; STOP refusal prose; absent/partial usage | SDK-mocked provider tests + chat tests |
| PROV-01 | local estimate covers full prompt; Korean/emoji/large input; provider not called at cap<=0 | pure estimator + DI call-count tests |
| PROV-01 | 429/5xx/auth/network safe result; no raw secret anywhere; one SDK attempt | sentinel key/header/prompt errors + log spies |
| COST-01 | completed retry blocks provider; same UUID other wallet isolated; failed precheck fails closed | fake-ledger orchestration tests |
| COST-01 | simultaneous same key; first consumes last balance; ledger count=1 | actual PostgreSQL transaction integration |
| COST-01 | absent ledger + settlement error; actual usage exceeds estimate; zero usage completion | mock failures + real ledger assertions |
| Both | suspended before call / while provider in-flight | update tests/admin/sanctions.test.ts without weakening double-check |
| Both | doubleclick, retry snapshot, regeneration fresh key, refusal text/details/balance | lifecycle tests + browser checks |

실제 DB 테스트는 `tests/helpers/db.ts`의 인증·DB 환경이 필요하다. 기존 STATE의 연결 실패 기록은 이번 세션에서 재확인하지 않았다. 환경이 불가하면 blocked로 기록하고 mock/PGlite를 실제 Postgres 동시성 성공이라고 표현하지 않는다. 기존 사용자 DB 테스트 유예도 존중한다. 이번 리서치에서 remote DB, 유료 Gemini, 브라우저 UAT는 실행하지 않았다.

## Don't Hand-Roll / Pitfalls

- 새 wallet update SQL이나 reservation schema 대신 기존 RPC를 사용한다.
- session owner + full ledger scope를 유지한다. UUID validation만으로 ownership이 생기지 않는다.
- 로컬 추정치는 invoice가 아니다. provider usage가 없을 때 과금 근거를 만들어내지 않는다.
- 정상 parse fallback을 지우지 말고 구조화 refusal을 그 앞에서 분기한다.
- raw error에 일부 필드를 delete하는 방식 대신 허용 필드만 새 객체로 구성한다.
- `tests/admin/sanctions.test.ts`의 Gemini mock 및 모든 ChatInput fixture도 변경 대상이다.
- 임시 SDK 호환 facade를 남기더라도 runtime remote countTokens 경로를 남기지 않는다.
- schema 파일은 읽기 근거일 뿐 수정 대상이 아니다. schema push를 계획에 자동 추가하지 않는다.

## Sources and Confidence

Primary web sources checked 2026-09-17:
- [Gemini GenerateContent API](https://ai.google.dev/api/generate-content) — structural refusal/usage contract.
- [Gemini token guide](https://ai.google.dev/gemini-api/docs/tokens) — tokens/counting distinction; English character heuristic is not Korean calibration.
- [JS SDK retry options](https://googleapis.github.io/js-genai/release_docs/interfaces/types.HttpRetryOptions.html) — attempts semantics.

Primary local evidence: `lib/ai/{gemini,chat,cost,prompt}.ts`, chapter actions and AiPanel, `supabase/migrations/0001_init.sql`, `tests/{ai,wallet,admin}`, installed SDK declarations/runtime, installed Next.js Server Actions guide. Graph navigation used `graphify query "AI chat Gemini provider wallet debit idempotency AiPanel"`; source reads verified material findings.

Canonical planning references read: Phase 8 CONTEXT; ROADMAP Phase 8; v1.1 SUMMARY/STACK/ARCHITECTURE/PITFALLS relevant sections; Phase 4 CONTEXT D-06/D-12/D-13/D-14; Phase 7 CONTEXT D-07 and current chat enforcement.

## Research Completion

RESEARCH COMPLETE. UI contract is the remaining planning prerequisite. No application code, migration, or model/pricing configuration changed. OpenAI Organization Verification / Anthropic billing-tier onboarding remain the external parallel track already listed in STATE; no application was submitted.
