# Phase 17: 버그 수정 통합 - Research

**Researched:** 2026-10-23
**Domain:** 기존 Next.js/Supabase/AI 패널 코드의 버그 정리 (새 기능 없음) — AI 응답 잘림 안내·출력 상한, 업로드 다이얼로그 UI, 재시도 동작, 테스트·린트 기준선
**Confidence:** HIGH (코드·측정으로 확인) / 일부 MEDIUM (상한 상향 효과는 실키 관측 전 추정)

## Summary

`17-CONTEXT.md`(2026-10-02, 일부 10-08 보강)는 상당 부분 **낡았다.** 코드로 확인한 현재 상태는 다음과 같다.

- **BUGFIX-01의 문구 정정(A-1)은 전부 끝났다.** Phase 11 plan 11-11(`5092889`)이 보류분이던 `chat.ts` 연결을 처리했고 `AiPanel.tsx`도 이미 `cappedPresentation`으로 토스트·말풍선을 연결했다. 남은 BUGFIX-01은 **A-2(요청당 상한 상향 + 관측 로그)** 하나다. Phase 11 코드가 끝나 겹침도 해소됐다.
- **BUGFIX-02는 코드 작업이 거의 없다.** Phase 15 BUG-03·04는 `fixed/15-03`·`15-04`로 이미 닫혔고(BUG-03 UAT도 2026-10-02 수행) 남은 것은 (a) 미검증 2항목, (b) Phase 15 HUMAN-UAT item 2, (c) 문서·상태 갱신뿐이다. 단 **BUG-07**(재생성 잘림이 `structure` 거부로 처리됨)이 CONTEXT 이후에 생겼고, 원인이 BUGFIX-01과 같은 계열이라 범위 편입 여부를 사용자가 정해야 한다.
- **BUGFIX-03: G2(Select 경고)는 이미 수정됨**(`3b9ca0f`). **G3(파일 입력 기본 문구)는 코드로 시각 노출이 확정**됐다 — 수정 필요.
- **BUGFIX-04: 코드상 "재시도는 이전 모델로 재전송"이 의도된 동작**이다(Phase 11 UI-SPEC·테스트가 고정). BUGFIX-04 문구("현재 선택된 모델로 재전송")는 이 설계와 **충돌**하므로 정책 결정이 필요하다.
- **BUGFIX-05의 기준선은 CONTEXT보다 훨씬 좋다.** eslint 오류 0(경고 9개만 남음), `writer-upgrade` 테스트는 이미 수정(`4e1b081`), 병렬 교착은 `fixed/07-06`으로 해결(`vitest.config.ts` projects 분리), "36개 파일 실패"는 **worktree에 `.env`가 없어서 DB 프로젝트 파일이 `supabaseUrl is required`로 실패한 것**임을 재현으로 확인했다. 실제 남은 결함은 소수(0022 번호 중복 1건, 정리 스크립트 vs 0023 잠금 트리거 7건, 경고 9개, 그리고 메인 체크아웃에 미커밋인 테스트 수정 4건)다.

**Primary recommendation:** Phase 17을 "신규 구현"이 아니라 **좁은 정리 phase**로 계획한다 — plan 5~6개: ① 린트 경고 + 미커밋 테스트 수정 반영, ② 업로드 파일 입력 숨김, ③ 서비스 키 상한 상향(2048→4096) + 관측 로그(+ BUG-07 편입 시 재생성 잘림 사유 분리), ④ 재시도 정책(결정 후) + `AiPanel.tsx` 경고 1건, ⑤ DB 기준선 분류·0022 번호·정리 스크립트(일회용 DB 필요, 결정 필요), ⑥ UAT/문서 정리(수동). 상한은 **4096** 권고(아래 §BUGFIX-01).

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions
(`17-CONTEXT.md` "확정된 결정"에서 그대로 옮김)

1. **G1/BUG-04 = 문구 정정 + 요청당 상한 소폭 상향.** 잔액 캡 / 요청당 상한 / thinking 소진을 구분해 안내 문구를 정확히 하고, `PER_REQUEST_MAX_OUTPUT_TOKENS`(현재 2048)를 소폭 올린다. `thinkingBudget` 제한 등 thinking 예산 정책은 건드리지 않는다(Phase 8 BUG-04 정책 부분은 계속 보류). 상향폭은 research/planning에서 비용·잔액 영향 검토 후 정한다. SEED-002 재작업을 줄이도록 변경은 얇게. (2026-10-04: 이 결정은 BUG-04의 "단계 A"이며, 후속 정책인 사고/본문 몫 분리(후보 4)는 `phases/08-.../bugs/BUG-04-...md` "정책 정리"에서 사용자 결정 대기 → 2026-10-08 결정 완료: 후보 4 Gemini만·BYOK 제외·`T` 기본값은 관측 후.)
2. **G3·G4 = 재현 없이 코드를 읽고 바로 수정.** 코드 검토로 원인을 확인해 BUG 문서화(`/bug-plan`) 후 수정한다. 코드상 원인이 확인되지 않으면(예: G4가 이미 올바르게 동작) 그 사실을 근거와 함께 BUG 문서에 기록하고 종료한다.
3. **BUGFIX-05 = 근본 원인까지 전부.** eslint 2건, `writer-upgrade` 테스트, 36개 파일 실패(supabaseUrl 등 환경변수 포함), DB 통합 테스트 병렬 교착까지 고쳐 전체 `npx vitest run`이 통과하는 기준선을 목표로 한다. 범위가 크므로 plan을 쪼개고(린트 / 환경변수·테스트 하네스 / 교착) 실패 원인 분류를 첫 plan에 둔다.
4. **기존 확정 유지:** Phase 15 BUG-04는 C안으로 바로 실행, BUG-03은 브라우저 UAT만 남음. (→ 실제로는 둘 다 `fixed/`에 이관 완료. §BUGFIX-02 참조)

### Claude's Discretion
- 상한 상향폭, 문구 구체 표현, BUGFIX-05 plan 분할 방식.

### Deferred Ideas (OUT OF SCOPE)
- thinking 예산(`thinkingBudget`) 제한 정책 — 데이터 더 모은 뒤 별도 결정
- SEED-002 스트리밍·실시간 토큰 표시, Phase 11 BYOK 호출 경로, Jev 활성화(AIDOC-04)

(범위 밖 추가 명시: Phase 4 HUMAN-UAT 3번 실제 차감액 대조는 SEED-002 이후)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUGFIX-01 | 응답 잘림 시 원인별 안내, 잔액 충분하면 "토큰 소진" 문구 없음 | 문구·연결은 이미 구현(11-11). 남은 일 = `cost.ts` 상한 상향 + 관측 로그 + 테스트 상수 갱신 (§BUGFIX-01) |
| BUGFIX-02 | 재생성·저장 후 이름·위치 유지, 템플릿 카테고리 폴더 남은 UAT 검증 | `fixed/15-03`·`15-04`로 코드·UAT 완료. 잔여 = 미검증 2항목 + HUMAN-UAT item 2 + BUG-07 판단 (§BUGFIX-02) |
| BUGFIX-03 | 업로드 다이얼로그 콘솔 경고 없음, 파일 입력 기본 문구 비노출 | 경고는 `3b9ca0f`로 수정 완료. 기본 문구는 `UploadFilesDialog.tsx:201-212` 확정 노출 (§BUGFIX-03) |
| BUGFIX-04 | 재시도가 현재 선택 모델·제공자로 재전송 | 현재 코드는 frozen snapshot 재전송이 의도된 설계. 정책 결정 필요 (§BUGFIX-04) |
| BUGFIX-05 | tsc·린트 깨끗, 전체 테스트 실패가 환경/결함으로 분류 | 측정 완료 (§BUGFIX-05) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 요청당 출력 상한·잔액 환산 | API / Backend (`lib/ai/cost.ts`, `paid-generation.ts` preflight) | — | 서버가 provider 호출 직전에 `maxOutputTokens`를 정한다 |
| 잘림 원인 분류·문구 | API / Backend (`chat-result.ts` 순수 함수) | Browser / Client (`AiPanel`·`ChatMessageBubble` 표시) | 분류 입력(`ctx.maxOutputTokens`, `usage`)은 서버에만 있고 문구는 client-safe 모듈 |
| 관측 로그 | API / Backend (`paid-generation.ts` 정산 후) | — | 서버 로그만 가능, 본문 미기록 |
| 업로드 파일 입력 UI | Browser / Client (`UploadFilesDialog.tsx`) | — | 순수 클라이언트 렌더링 |
| 재시도 스냅샷·멱등 키 | Browser / Client (`AiPanel` `failedAttemptRef`) | API / Backend (`findCompletedGeneration` 키 조회) | 키는 client가 만들고 서버가 키로 중복 차감을 막는다 |
| 마이그레이션 번호·DB 정리 스크립트 | Database / Storage (`supabase/migrations`, `scripts/`) | — | 스키마·fixture 정리 |

## Standard Stack

신규 외부 패키지를 설치하지 않는다 (**Package Legitimacy Audit: 해당 없음 — 이 phase는 신규 의존성 0**).

### Core (이미 사용 중, 버전은 `package.json` 기준)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | (저장소 고정) | 앱 프레임워크 — **AGENTS.md: 학습 데이터와 다름, `node_modules/next/dist/docs/` 확인 후 코드 작성** | 기존 |
| vitest | ^4.1.11 [VERIFIED: package.json] | 테스트 (`vitest.config.ts`가 `unit`/`db` projects로 분리) | 기존 |
| eslint (`eslint.config.mjs`) | 저장소 고정 | 린트, `npm run lint` = `eslint --max-warnings=0` [VERIFIED: package.json:9] | 기존 |
| Base UI `Select` (`components/ui/select`) | 저장소 고정 | 업로드/빠른추가 다이얼로그 셀렉트 | 기존 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 파일 입력을 `sr-only` + 버튼으로 교체 | CSS로 `::file-selector-button`만 스타일 | "선택된 파일 없음" 텍스트는 CSS로 숨길 수 없다 → `sr-only` 입력 + 별도 버튼 방식이 유일하게 확실 |

**Installation:** 없음.

## Architecture Patterns

### 시스템 흐름 (이 phase가 만지는 경로)

```
[작가 입력] -> AiPanel.handleSend -> createSendAttempt(frozen payload, 새 멱등 키)
      |                                   |
      |                                   v
      |                      chatAction(server) -> chat()/document-plan/regenerate
      |                                   |
      |            preflightPaidGeneration: 잔액 읽기 -> computeMaxOutputTokens
      |                 = min(잔액 환산, PER_REQUEST_MAX_OUTPUT_TOKENS)   [BYOK는 8192 고정]
      |                                   |
      |                       provider.generateContent(maxOutputTokens)
      |                                   |
      |            settlePaidGeneration: 사용량 정산(candidates+thoughts)  --(A-2) 관측 로그
      |                                   |
      v                                   v
 cappedPresentation(result) <-- cappedCompletionFields(finishReason, ctx.maxOutputTokens, usage)
      |
 토스트 + ChatMessageBubble 원인별 문구 (balance / thinking / request_limit)

[실패] -> resolveChatOutcome -> notice(다시 시도) -> handleRetry -> 같은 attempt(같은 키·같은 스냅샷) 재전송
```

### 파일 소유 (충돌 판단용)
| 영역 | 파일 |
|---|---|
| BUGFIX-01 | `lib/ai/cost.ts`, `lib/ai/paid-generation.ts`, (선택) `lib/ai/document-regenerate.ts`, `tests/ai/{capped-reason,paid-generation,cost-estimate,regenerate-document}.test.ts` |
| BUGFIX-03 | `app/studio/[workId]/chapters/[chapterId]/ai-panel/UploadFilesDialog.tsx` (+ 신규 테스트) |
| BUGFIX-04 | `.../ai-panel/AiPanel.tsx`, `lib/ai/chat-request.ts`, `tests/ai/ai-panel-model.test.ts` |
| BUGFIX-05 | `components/world-tree/era-board.tsx`, 테스트 6파일, `supabase/migrations/0022_*`, `tests/migrations/numbering.test.ts`, `scripts/lib/report-fixture-cleanup.mjs` |

### Anti-Patterns to Avoid
- **`wasCapped`만 보고 문구를 고르는 것:** 이미 `cappedReason`으로 분리됨. 상한을 올려도 `classifyCappedReason`의 `ctx.maxOutputTokens < PER_REQUEST_MAX_OUTPUT_TOKENS` 비교는 상수를 import해서 쓰므로 자동 추종한다 — 상수만 바꾸고 하드코딩 2048을 남기지 말 것(테스트에 하드코딩 있음, 아래).
- **공유 Supabase에 DB 테스트/마이그레이션 적용:** 금지. `.env.local`은 공유 프로젝트를 가리킨다.
- **재시도에서 새 멱등 키를 무조건 발급:** `settlement`/`unknown` 실패는 정산 직전·후 모호 상태일 수 있어 이중 차감 위험 (§BUGFIX-04).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 잘림 원인 분류 | 새 분류기 | `classifyCappedReason`/`cappedCompletionFields`/`cappedPresentation` (`lib/ai/chat-result.ts:39-88`) | 이미 chat·document-plan·AiPanel 모두 연결됨 |
| 파일 선택 UI 숨김 | CSS 해킹으로 입력 텍스트 가리기 | `sr-only` 입력 + `<Button>` 트리거(ref `.click()`) | 브라우저 기본 문구는 CSS로 제거 불가 |
| DB 테스트 직렬화 | 테스트별 lock | `vitest.config.ts` `db` project (`fileParallelism: false`) | `fixed/07-06`에서 이미 해결 |
| 일회용 DB 선택 | 임의 `.env` 편집 | 프로세스 env 고정 + `node scripts/check-env.mjs` 로 키 존재만 확인 | `.env*` 읽기는 deny 규칙 |

## Common Pitfalls

### Pitfall 1: 상한 상수 상향 시 테스트 하드코딩 깨짐
**What goes wrong:** `PER_REQUEST_MAX_OUTPUT_TOKENS`를 바꾸면 다음이 실패한다. `tests/ai/capped-reason.test.ts:27,31-32,44-46,141-149`(2047/2048 경계 및 `toBe(2048)`), `tests/ai/capped-ux.test.ts:160`, `tests/ai/paid-generation.test.ts:48`, `tests/ai/cost-estimate.test.ts:30,41-54`(`candidatesTokenCount: 2048` 디버그 기대값은 상수와 무관하지만 `cap` 기대 30행은 연동), mock `maxOutputTokens: 2048`(`document-plan-generation.test.ts:111`, `document-regenerate.test.ts:56`, `freeform-generation.test.ts:36`)은 임의 값이라 무해.
**How to avoid:** 테스트는 상수를 import해 경계(`PER_REQUEST_MAX_OUTPUT_TOKENS - 1`/`PER_REQUEST_MAX_OUTPUT_TOKENS`)로 쓰도록 바꾼다.

### Pitfall 2: worktree에서 측정한 실패를 결함으로 오인
**What goes wrong:** 이 worktree에는 `node_modules`·`.env*`·`.next/types`가 없다. `tsc`가 `LayoutProps`(`.next/types` 생성 타입)를 못 찾고, DB 프로젝트 40개 파일이 `supabaseUrl is required`로 실패한다. Phase 16의 "36개 실패" 기준선이 정확히 이 증상이다.
**How to avoid:** 측정은 "worktree(무 env)"와 "일회용 DB env 고정"을 구분해 기록한다. 환경 요인은 결함 목록에서 제외.

### Pitfall 3: Windows CRLF 정규식·`after()` mock
**What goes wrong:** `core.autocrlf=true`라서 `.sql`을 `split('\n')`하면 `\r`이 남아 주석 제거가 틀어진다(`tests/world-tree/schema-source.test.ts`). `next/server`의 `after`를 mock하지 않은 테스트(`provider-fixture.test.ts`)가 실패.
**How to avoid:** 메인 체크아웃에 이미 수정이 있다(미커밋, 아래). 반영 후 통과.

### Pitfall 4: 이름이 같은 마이그레이션을 이미 적용된 DB에서 재번호링
**What goes wrong:** `0022` 중복 해소를 위해 파일명을 바꾸면 일회용/공유 DB 적용 이력과 어긋나거나 적용 순서가 바뀐다 (`06-01` 선례는 "원격에 먼저 적용된 쪽 유지").
**How to avoid:** §BUGFIX-05 결정 질문 Q4 참조.

### Pitfall 5: Phase 12와 마이그레이션 번호 충돌
Phase 12가 새 마이그레이션을 추가할 때 같은 "다음 번호"를 계산할 수 있다(06-01의 원인). Phase 17의 번호 정리는 Phase 12 마이그레이션 전에 끝내거나 번호 예약을 명시한다.

## Code Examples

### 상한 상수와 BYOK 상수 (현재)
```ts
// Source: lib/ai/cost.ts:4-5, 27  [VERIFIED: 코드]
export const PER_REQUEST_MAX_OUTPUT_TOKENS = 2048;
export const BYOK_MAX_OUTPUT_TOKENS = 8192;
// computeMaxOutputTokens: Math.max(0, Math.min(outputBudget, PER_REQUEST_MAX_OUTPUT_TOKENS))
```

### 분류기가 상수를 직접 참조 (상향 시 자동 추종)
```ts
// Source: lib/ai/chat-result.ts:39-47  [VERIFIED: 코드]
if (call.maxOutputTokens < PER_REQUEST_MAX_OUTPUT_TOKENS) return 'balance';
const { thoughtsTokens, outputTokens } = call.usage;
if (thoughtsTokens != null && thoughtsTokens >= outputTokens) return 'thinking';
return 'request_limit';
```
주의: BYOK는 `maxOutputTokens=8192 >= 상수`라 balance로 분류되지 않는다(테스트 `capped-reason.test.ts:58-61`). 상한을 8192 이상으로 올리면 이 가정이 깨지므로 **서비스 상한은 BYOK(8192)보다 작게 유지**.

### 관측 로그 (A-2, 제안 — `paid-generation.ts` settleInner 성공 반환 직전, 본문 미기록)
```ts
// 제안 형태. 기존 재생성 로그(lib/ai/document-regenerate.ts:181)와 같은 필드명을 쓴다.
console.info('[ai] generation observed', {
  provider: client.provider, keySource: ctx.route.keySource, model,
  finishReason: result.finishReason, maxOutputTokens: ctx.maxOutputTokens,
  outputTokens: result.usage.outputTokens, thoughtsTokens: result.usage.thoughtsTokens,
  idempotencyKey: id.idempotencyKey,
});
```
`cappedReason`은 호출자(chat/document-plan)가 계산하므로 settle 안에서는 `finishReason==='max_tokens'`만 기록하고, 분류값은 필요하면 `classifyCappedReason`을 같은 곳에서 재호출한다.

## BUGFIX별 상세 (코드 확인)

### 1. 범위 재정리: CONTEXT vs 현재

| CONTEXT 항목 | 현재 상태 | Phase 17에 남은 일 |
|---|---|---|
| G1 문구/배너 오표시 | **해결(A-1 완료)** — `chat.ts:135`가 `cappedCompletionFields` 전개, `AiPanel.tsx:304-311`이 `cappedReason`·`cappedPresentation` 토스트 연결, `ChatMessageBubble.tsx:42-47`이 원인별 문구, `document-plan.ts:82-93` 동일. 테스트 `tests/ai/capped-reason.test.ts`(chat() 회귀 포함)·`capped-ux.test.ts` | 없음 (Phase 8 BUG-04 문서의 "적용 상태/보류" 표기가 낡았다 → 문서 갱신) |
| G1 상한 상향·관측(A-2) | **미착수** — `cost.ts:4` 아직 2048, 관측 로그는 재생성 경로 1곳(`document-regenerate.ts:181`)뿐 | 구현 |
| G2 Select 경고 | **해결** — `UploadFilesDialog.tsx:259`, `QuickAddDialog.tsx:79` `value={folderState.selectedFolderId ?? null}`; 커밋 `3b9ca0f`, `16-UAT.md` 상태 `fixed` | 문서화만(`/bug-plan` 문서 없이 수정됨 → fixed 문서/추적 정리) |
| G3 파일 입력 문구 | **미해결, 노출 확정** | 수정 |
| G4 재시도 모델 | **의도된 동작과 요구사항 충돌** | 결정 후 수정 또는 "의도된 동작" 기록 |
| Phase 15 BUG-04 | **`fixed/15-04`로 이관 완료** (이름 서버 강제 + provider 정렬) | 없음 |
| Phase 15 BUG-03 | **`fixed/15-03`로 이관 완료**, 브라우저 UAT 2026-10-02 수행. 미검증 2항목만 남음 | 아래 BUGFIX-02 |
| Phase 15 BUG-07 (신규, CONTEXT 이후) | open, 옵션 3 확정(관측 로그만 — 로그는 이미 추가됨 `document-regenerate.ts:181`). 라이브 관측: `max_tokens`, `thoughtsTokens 1964/2048`, 본문 80토큰 | 편입 여부 결정 (Q2) |
| eslint 2건 | **해결** — `QuickAddDialog.tsx:31`, `UploadFilesDialog.tsx:61` 등 `eslint-disable-next-line react-hooks/set-state-in-effect -- 사유`로 처리됨. 측정: 오류 0 | 경고 9개 (`--max-warnings=0` 위반) |
| `writer-upgrade` 테스트 | **해결** — 커밋 `4e1b081`(2026-09-30). 2026-10-23 일회용 DB 전체 실행의 실패 목록에도 없음 | 없음 |
| DB 테스트 병렬 교착 | **해결** — `fixed/07-06`, `vitest.config.ts` `db` project `fileParallelism:false` | 없음 |
| "36개 파일 실패" | **환경 요인으로 재현** (§BUGFIX-05) | 분류 문서화 |

#### 열린 `bugs/` 문서의 Phase 17 범위 분류
| 문서 | 분류 | 이유 |
|---|---|---|
| Phase 8 `BUG-04` (사고 토큰) | **범위 안(단계 A-2만)** | 단계 B(T/B 분리)는 2026-10-08 결정으로 "관측 후·Phase 17 밖". CONTEXT Deferred와 일치 |
| Phase 15 `BUG-07` (재생성 잘림) | **경계 — 사용자 결정(Q2)** | 원인이 BUG-04와 동일. 2026-10-08에 "관측만, 본 수정은 단계 B와 함께"로 확정됐으나, BUGFIX-01의 "원인에 맞는 안내" 취지와 맞고 변경이 작음(옵션 1) |
| Phase 9 `BUG-02` (기본 모델 조용한 대체) | **범위 밖** | 서버·UI 수정은 끝났고 "남은 항목은 Phase 11 연결 후, /bug-complete 대기". 어느 BUGFIX-0x에도 대응하지 않음. Phase 11 연결 확인·`/bug-complete`는 Phase 11 마무리 작업 |
| Phase 9 `BUG-03` (서비스 키 없는 모델 노출) | **범위 밖** | 정책 미정("나중에 논의", 사용자 보류). 논의 전 `/bug-execute` 금지 |
| Phase 10 `BUG-01` (failed 키 하나가 BYOK 모델 전체 숨김, `byok-models.ts`) | **범위 밖(권고) — Q5로 질문** | medium이지만 BUGFIX-01~05 어디에도 대응하지 않고 CONTEXT 범위 밖에 "Phase 11 BYOK 호출 경로"가 있음. 로더 한 곳의 `return {}`→`continue` 수정으로 작아 별도 quick 수정 후보 |
| Phase 11 `bugs/` | 비어 있음 (`fixed/11-01`만 있음) | — |

### 2. BUGFIX-01 (A-2) 상세

**현재 코드:** `PER_REQUEST_MAX_OUTPUT_TOKENS = 2048`, `BYOK_MAX_OUTPUT_TOKENS = 8192` (`lib/ai/cost.ts:4-5`). BYOK preflight는 `paid-generation.ts:140`에서 8192 고정. 서비스 키는 `paid-generation.ts:167-168` `computeMaxOutputTokens({walletBalance, pricing})`. `thinkingConfig`는 어디에도 없다(`grep` 결과 0건, `gemini.ts` `config`에 `systemInstruction, maxOutputTokens, temperature, abortSignal`만).

**비용 계산** (`KRW_PER_WALLET_TOKEN=10`, `USD_TO_KRW=1400`, 지갑 토큰당 벤더 토큰 = 1/(단가$/1M ×1400/10)). 단가 출처: `lib/ai/providers/{gemini,anthropic,openai}/cost.ts` [VERIFIED: 코드]. 출력 토큰 N개를 전부 쓴 최악의 **출력 비용만**(입력 제외), 지갑 토큰:

| 모델(출력 $/1M) | 2048 | 4096 | 8192 |
|---|---|---|---|
| gemini-3.5-flash ($9) | 2.58 | **5.16** | 10.32 |
| claude-sonnet-5 ($10) | 2.87 | 5.73 | 11.47 |
| claude-haiku-4-5 ($5) | 1.43 | 2.87 | 5.73 |
| gpt-5.6-terra ($12) | 3.44 | 6.88 | 13.76 |

(1 지갑 토큰 = 10원이므로 4096에서 최악 요청 1건이 약 50~70원. 실제 차감은 `ceil` 후 실사용량 기준.) 실측: 2026-10-02 UAT 한 요청 원장 -4.

**잔액 영향:** 상한은 `min(잔액 환산, 상수)`이므로 잔액이 충분하면(수십 토큰 이상) 상향은 그대로 반영되고, 잔액이 **약 5.2토큰(Gemini, 4096 기준) 미만**이면 기존처럼 잔액이 상한을 결정해 `balance` 문구가 나온다. 즉 상한을 올리면 "balance" 구간(잔액 < 2.6→<5.2 토큰)이 넓어지지만 의미는 정확히 유지된다.

**권고: `PER_REQUEST_MAX_OUTPUT_TOKENS = 4096`** (2배, "소폭" 범위, BYOK 8192의 절반).
- 근거: 8192는 BYOK와 같아져 서비스/BYOK 구분이 사라지고 최악 비용이 4배. 3072는 관측상 사고 소모(2048 중 1964)를 해소할 근거가 약하다.
- **MEDIUM 위험(A1):** BUG-07 라이브 관측에서 사고 토큰이 상한의 96%를 썼다. Gemini 사고량이 예산에 비례해 늘면 4096에서도 본문이 짧을 수 있다 → 상향은 **완화일 뿐 근본 해결 아님**(근본은 단계 B). 효과 판정은 실키 관측 필요(이 장치엔 키 없음).
- 관측 로그는 상향과 **같은 plan**에 넣어 실제 값을 수집한다. 문서의 정책 `T` 기본값은 이 로그 이후 결정(Deferred 유지).

**BYOK 경로와의 관계:** BYOK는 `BYOK_MAX_OUTPUT_TOKENS=8192` 고정, 지갑 무관 → 이 상향의 영향 없음. 단 분류기에서 BYOK 8192 캡이 `balance`가 되지 않는 불변식(서비스 상한 < 8192)을 유지해야 한다.

**수정 파일:** `lib/ai/cost.ts`(상수), `lib/ai/paid-generation.ts`(관측 로그, 서비스+BYOK 성공 경로), 테스트 상수 추종(Pitfall 1). `chat-result.ts` 변경 불필요(상수 import 사용).

### 3. BUGFIX-03 상세

**G2(경고):** 원인은 저장 폴더 `Select`가 폴더 로드 전 `selectedFolderId`가 `undefined`(`quick-add-folders.ts:10,26`)라 `value`가 undefined→문자열로 바뀌며 Base UI가 uncontrolled→controlled 경고를 냄. 수정은 이미 `value={folderState.selectedFolderId ?? null}`(`UploadFilesDialog.tsx:259`, `QuickAddDialog.tsx:79`)로 반영 — `3b9ca0f`. 템플릿 종류 Select(`:249`)는 `value={category}`로 항상 정의돼 무관. 남은 일: UAT 문서 상태는 `fixed`이나 `/bug-plan` BUG 문서가 없었다 → 추적 문서화(짧게) 또는 `16-UAT.md`에 근거 유지로 종료. 자동 회귀 테스트 없음 → 신규 단위 테스트 권장(SSR 렌더에서 `value`가 `null` 제어형인지, Base UI 경고는 console.error spy).

**G3(파일 입력 기본 문구): 코드로 시각 노출 확정.**
- `UploadFilesDialog.tsx:201-204`: `<input id="upload-files-input" type="file" multiple ... className="text-sm" />` — `sr-only`/`hidden` 없음.
- `:208-212`: 폴더째 선택 `<input type="file" multiple className="text-sm text-foreground" webkitdirectory>` — 마찬가지.
- 브라우저는 파일 입력 옆에 "선택된 파일 없음"(로케일별 문구)을 렌더하며 CSS로 제거 불가. UAT 스크린샷의 "파일 선택 선택된 파일 없음"은 이 입력의 네이티브 UI와 `<Label>` 텍스트("파일 선택")가 합쳐진 것으로 보는 것이 코드와 일치.
- **수정:** 두 입력을 `className="sr-only"` + `ref`로 두고 `<Button type="button" variant="outline">`이 `ref.current?.click()`하도록. 선택 결과는 이미 아래 `files` 리스트(`:216-`)가 보여주므로 별도 문구 불필요. 라벨 접근성 유지: 버튼에 `aria-describedby` 또는 입력에 `aria-label`. 입력 `value` 리셋(`e.target.value = ''`)은 그대로.
- 주의: 모바일 터치/키보드 접근(Tab→Enter) 확인 필요. 브라우저 시각 확인은 수동.

### 4. BUGFIX-04 상세

**코드 근거 (재시도는 frozen snapshot):**
- `AiPanel.tsx:100-118` `SendPayload`가 `providerId/model/keySource`를 포함하고 주석이 "retry replays it verbatim (UI-SPEC §1)".
- `:338-343` `handleRetry`: `failedAttemptRef.current`의 attempt를 그대로 `runAttempt(attempt)` — 현재 UI 선택(`providerId/model/keySource` state) 미참조. `attemptSelection()`(`:121-123`)은 "Never the current UI selection".
- 모델 변경 핸들러 `:412-417`는 state만 바꾸고 `failedAttemptRef`는 건드리지 않는다.
- `lib/ai/chat-request.ts:20-27` `createSendAttempt`가 키를 발급하고 payload를 `deepFreeze`; `createReplacementAttempt`(`:89-96`)는 **같은 키**로 선택만 교체(BYOK→서비스 키 동의 경로 전용).
- 설계 근거: `11-UI-SPEC.md:103` "재시도는 같은 멱등 키·같은 스냅샷을 재사용하며(`handleRetry`, `failedAttemptRef`) 자동 재시도는 없다", `11-CONTEXT.md:81`. 테스트가 이를 고정: `tests/ai/ai-panel-model.test.ts:171-194` "retry checks the frozen attempt selection, not the current UI selection" — 모델을 바꾼 뒤 재시도해도 `gemini/service` + **같은 `idempotencyKey`**로 재전송됨을 단언.
- 결론: UAT G4 증상("Claude Haiku로 바꿔도 Gemini 호출 반복")은 **버그가 아니라 현 설계의 직접 결과**다. BUGFIX-04 요구문("현재 선택된 모델·제공자로 재전송")과 설계가 충돌하므로 CONTEXT 결정 2("원인이 확인되지 않으면 그 사실 기록 후 종료")만으로는 판단 불가 → **사용자 결정(Q1).**

**안전한 구현안 (결정이 "현재 선택 반영"일 때):**
- 재시도 시 `attemptSelection(attempt.payload)`와 현재 UI 선택이 **다르면** 새 attempt(`createSendAttempt({...frozen payload, providerId, model, keySource: 현재})`, 새 멱등 키)로 전송. 같으면 기존대로 같은 키 재전송.
- **이중 차감 위험:** `RETRYABLE_KINDS`(`chat-request.ts:112-120`)에 `settlement`·`unknown`·`generation_in_progress`가 포함된다 — provider 호출 후 정산 단계 실패일 수 있어 키를 바꾸면 이전 시도가 이미 차감됐을 가능성이 있다. 따라서 새 키는 **`rate_limited`·`credit_exhausted`·`unavailable`·`config`**(provider 호출 전/중 실패)에만 허용하고 `settlement`·`unknown`·`generation_in_progress`는 기존 snapshot 유지(+ "모델을 바꾸려면 새 메시지로 보내기" 안내)가 안전. 실패 종류를 `failedAttemptRef` 옆에 함께 저장해야 한다(현재는 attempt만 저장).
- BYOK 선택으로 바꾸는 경우 `canUseSelection`/`selectionBlockReason`으로 가드(기존 `:240-248` 가드는 attempt 선택 기준 → 새 attempt 선택 기준으로 호출되므로 그대로 재사용).
- 기존 테스트 `ai-panel-model.test.ts:171`의 단언은 정책에 따라 갱신(같은 선택일 땐 유지).
- **대안(더 작음):** 동작은 유지하고 모델 변경 후 실패 알림에 "모델을 바꿨다면 새 메시지로 다시 보내주세요" 안내 한 줄. 이 경우 BUGFIX-04는 UX 문구 수정이며 요구사항 문구를 "재시도는 원래 요청을 그대로 다시 보낸다"로 고쳐야 한다.

`AiPanel.tsx:192` 린트 경고(`Unused eslint-disable directive`)는 이 plan에서 같이 처리(같은 파일).

### 5. BUGFIX-02 상세 (남은 작업)

- `fixed/15-04` 검증에 "Claude Sonnet 5 반복 UAT 4건 성공, Haiku 수정 후 2건 성공". 미검증: "모델이 이름을 바꾼 응답의 실패 안내"(단위 테스트로만 커버, 실제 관측 시 확인).
- `fixed/15-03` 검증: 구조·UI·목록 필터 UAT 완료. **미검증 2항목(사용자 승인하 이관):** ① 루트 직속 커스텀 이름 템플릿의 "미분류" 표시·툴팁(현재 테스트 계정에 해당 파일 없음), ② `0012`의 이름=카테고리 평면 파일 이동·내용 보존(B4) 경로 — 일회용 DB에는 평면 시드가 없었음.
- Phase 15 HUMAN-UAT item 2 (재생성 성공/실패 문구, 이동·삭제 race 재검증 배너): `15-HUMAN-UAT.md:19,40` — 재생성 성공/race 미확인(`partial: 1`). BUG-08(`fixed/15-07`)이 배너 소실을 수정함. 브라우저·일회용 DB 필요(수동 UAT).
- `REQUIREMENTS.md:288` 상태가 "Mostly fixed (… 잔여 검증·문서 갱신)" — 이 phase에서 닫는다.
- **코드 변경 없음.** BUG-07을 편입하면 `lib/ai/document-regenerate.ts`의 `validateRegeneratedDocument` 호출 전에 `generated.finishReason === 'max_tokens'`면 `GenerationRejectedError(<잘림 문구>, 'truncated')`로 분리(`document-regenerate.ts:177-190` 콜백 안, 거부 시 무과금은 BUG-06 구조 유지) + `tests/ai/regenerate-document.test.ts` 케이스 — BUG-07 문서의 옵션 1.

### 6. BUGFIX-05 상세 — 측정 결과

측정 환경: 이 worktree(`festive-swanson-cc07cc`), `node_modules`는 메인 체크아웃으로의 디렉터리 junction(측정 후 제거), **`.env*` 없음**, 공유/일회용 DB 연결 없음(프로세스에 SUPABASE 관련 env 0개 확인).

| 명령 | 결과 | 분류 |
|---|---|---|
| `npx tsc --noEmit` (worktree) | 오류 1: `app/layout.tsx(23,50): TS2304 Cannot find name 'LayoutProps'` | **환경 요인** — `.next/types` 생성 타입 부재(`tsconfig.json:29` include). 메인 체크아웃(`.next` 존재)에서는 **오류 0** |
| `npx eslint .` | **오류 0, 경고 9** (`npm run lint`는 `--max-warnings=0`이라 실패) | 경고 9건은 실제 정리 대상 |
| `npx vitest run --project unit` | 163파일 중 **3파일 5테스트 실패**, 2519 통과 (10초) | 아래 표 |
| `npx vitest run --project db` (env 없음) | 65파일 중 40 실패·24 skipped(게이트 env off)·1 통과. 실패 53건 전부 `supabaseUrl is required` | **100% 환경 요인** (Phase 16 "36개 실패"와 같은 증상, DB 파일 수가 늘어 40) |

**eslint 경고 9건:**
`AiPanel.tsx:192`(미사용 disable 지시어), `components/world-tree/era-board.tsx:139`(useMemo 의존성 `draft` 누락 — Phase 18 파일), `tests/ai/wallet-refresh.test.ts:15`(`flush` 미사용), `tests/helpers/toss.ts:68(×2),136`, `tests/payments/payment-flow.integration.test.ts:75`, `tests/studio/chapter-editor-state.test.ts:42`, `tests/studio/kb-editor-state.test.ts:59`(`_`접두 미사용 인자 — eslint 설정이 `_` 무시 패턴을 안 가짐).

**unit 실패 5건 분류:**
| 테스트 | 원인 | 분류 |
|---|---|---|
| `tests/ai/provider-fixture.test.ts` ×2 | `next/server`의 `after` mock 누락 | **테스트 결함** — 메인 체크아웃에 미커밋 수정 있음(`vi.mock('next/server', () => ({ after: vi.fn() }))`) |
| `tests/world-tree/schema-source.test.ts` ×2 | CRLF(`core.autocrlf=true`)에서 `split('\n')` 후 `--` 주석 제거 실패(grant 개수 4, `security definer` 주석 매칭) | **테스트 결함(Windows 환경 의존)** — 메인에 미커밋 수정 있음(`split(/\r?\n/)`) |
| `tests/migrations/numbering.test.ts` ×1 | `0022_account_deletion_purge.sql`과 `0022_template_readonly_backfill.sql` 번호 중복 | **실제 결함** (Q4) |

**메인 체크아웃 미커밋 변경** (read-only 확인, `D:\MyProject\NovelScript` master): `tests/ai/provider-fixture.test.ts`, `tests/kb/tree-query.test.ts`(CRLF/예약어 픽스처 계열), `tests/payments/payment-flow.database.test.ts`(Toss 목 DONE 전환), `tests/world-tree/schema-source.test.ts`. `STATE.md`(2026-10-23)와 일치. **Phase 17 실행 전 이 4파일이 master에 커밋되어야 한다**(안 그러면 BUGFIX-05가 같은 수정을 중복하거나 병합 충돌). 이 worktree에는 없다.

**DB 통합 테스트:** `vitest.config.ts`의 `DB_MARKER = /helpers\/db['"]|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|postgres\(/` 로 **내용 기반** 분류 → `db` project(65파일, 직렬). 게이트 env가 있는 3파일은 기본 skip: `READING_STATE_DB_TEST`(`tests/reader/reading-state.database.test.ts`), `COMPLETION_DB_TEST`(`completion.database.test.ts`), `WTREE_BRANCH_RACE_SCHEMA_COMMIT`(`tests/world-tree/branching.database.test.ts`).

**일회용 DB 사용 요령** (메모리 `project-manual-gates-2026-10-23.md` + `STATE.md` "실행 시 주의" + `scripts/dev-disposable.mjs`):
1. 일회용 Supabase 프로젝트의 env 파일은 **메인 체크아웃 루트**의 `env.disposable`(점 없음)·`.env.disposable`에 있다 (worktree에는 없음). `.env*` 읽기는 `.claude/settings.json` deny 규칙으로 막혀 있다.
2. 키 존재만 확인: `node scripts/check-env.mjs <파일>` (값 미출력).
3. 실행: `node --env-file=env.disposable node_modules/vitest/vitest.mjs run` — vitest `--mode disposable`만으로는 공유 `.env.local` 값이 섞일 수 있으므로 **프로세스 env로 고정**하고 ref가 공유 프로젝트와 다른지 먼저 확인.
4. 게이트 3개를 켜려면 `READING_STATE_DB_TEST=1 COMPLETION_DB_TEST=1 WTREE_BRANCH_RACE_SCHEMA_COMMIT=1`.
5. 마이그레이션은 일회용 DB에만 `scripts/apply-migration.mjs`로 적용(0011은 UTF-8 BOM으로 단독 실행 시 구문 오류 가능). **공유 프로젝트 적용 금지.**
6. 이전 실패 테스트가 일회용 DB에 `테스트 작품`/`cleanup fixture` 신고 잔여물을 남겼다(정리: `scripts/cleanup-uat-accounts.mjs`).

**이번 research에서 DB 테스트는 실행하지 않았다**(규칙: 일회용 DB 확인 없이 실행 금지, worktree에 env 없음). 대신 `STATE.md` 2026-10-23 기록을 인용한다: 일회용 DB·게이트 3개 on 전체 vitest **3,027개 중 12개 실패** → 4건은 위 미커밋 테스트 수정으로 통과, **남은 8건 = ① 정리 스크립트(`scripts/lib/report-fixture-cleanup.mjs:44` `deleteFixtures`의 `kb_nodes` delete)가 `0023_template_policy_guards.sql:106,126`의 `locked_node_immutable`에 막히는 7건(`tests/reader/reports-cleanup.database.test.ts`, `tests/uat/cleanup-uat-accounts.database.test.ts` 계열) ② 0022 번호 중복 1건.** [CITED: .planning/STATE.md] — 계획 단계에서 일회용 DB로 재측정해 확정.

**plan 분할 제안(CONTEXT의 "린트/하네스·env/교착"을 현실에 맞게 수정):**
| plan | 내용 | 비고 |
|---|---|---|
| 17-0A | **분류 문서 + 린트 경고 9건 + 미커밋 테스트 4건 커밋 반영 확인** | 첫 plan. 위 표가 분류 산출물. 교착은 이미 해결이므로 별도 plan 불필요 |
| 17-0B | **하네스/env 분리**: worktree/신규 환경에서 DB 프로젝트가 `supabaseUrl is required`로 줄줄이 실패하지 않도록 DB project를 env 없으면 **명시적 skip + 안내 메시지**로 전환(예: `vitest.config.ts`에서 `SUPABASE_DB_URL`/`SERVICE_ROLE_KEY` 부재 시 db project 제외 + 1줄 경고)하고 `npm run test:unit`/`test:db` 스크립트 분리 | 선택 사항. "전체 vitest 통과" 목표는 이 변경 + 일회용 DB 실행으로 달성 |
| 17-0C | **DB 결함**: 0022 번호(Q4), 정리 스크립트 vs 0023 트리거(Q3) | 일회용 DB 필요, 결정 후 실행 |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `wasCapped` 단일 불리언 | `wasCapped` + `cappedReason`(balance/thinking/request_limit) | 2026-10-08(A-1) ~ 10-19(11-11) | UI 문구 정확. 상수만 바꿔도 분류 추종 |
| DB 테스트 파일 병렬 | `vitest.config.ts` projects(`unit` 병렬 / `db` 직렬) | 2026-10-02 (`fixed/07-06`) | 교착·타임아웃 해소 |
| eslint `set-state-in-effect` 2건 오류 | `eslint-disable-next-line` + 사유 | (확인 시점에 이미 반영) | 오류 0 |

**Deprecated/outdated:** `17-CONTEXT.md` §B/§C 표의 상태 열(위 §1 표 참조), Phase 8 `bugs/README.md`·`BUG-04` "적용 상태"의 보류 표기(11-11로 해소됨), `16-VERIFICATION.md` baseline-note.

## Runtime State Inventory

이 phase는 rename/migration이 아니다. 단 마이그레이션 **재번호링**(Q4)을 택하면 아래를 확인해야 한다.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 일회용 DB에 0022 두 파일이 모두 적용됨(STATE: 0024~, 0011~ 적용 기록). 공유 DB는 미적용 | 재번호링 시 적용 이력(적용 스크립트가 파일명 기반인지 `scripts/apply-migration.mjs`로 확인) 점검 |
| Live service config | 없음 | — |
| OS-registered state | 없음 | — |
| Secrets/env vars | 없음 | — |
| Build artifacts | 없음 | — |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 상한 4096으로 올려도 Gemini 사고량이 비례 증가하면 본문 잘림이 완전히 해소되지 않는다 | BUGFIX-01 | 실키 관측 전 효과 미확인. 4096이 부족하면 8192 근처로 재상향 필요 |
| A2 | 1 지갑 토큰 = 10원, 최악 요청 비용 표(출력만)가 사용자에게 "소폭"으로 받아들여진다 | BUGFIX-01 | 사용자가 더 보수적(3072)을 원할 수 있음 → Q6 |
| A3 | 파일 입력 숨김 시 `<Button>`+ref 클릭 방식이 모바일 브라우저(iOS Safari)에서도 파일 선택창을 연다 | BUGFIX-03 | 실기기 확인 필요(수동) |
| A4 | 정산 모호 실패(`settlement`/`unknown`)에서 새 키 발급 시 이중 차감 가능성 | BUGFIX-04 | 서버 `findCompletedGeneration`이 키 기준이라 새 키는 중복 방지가 안 됨은 코드로 확인했으나, 실제 이중 차감 시나리오는 재현하지 않음 |
| A5 | 일회용 DB가 현재도 `env.disposable`로 사용 가능하고 공유와 ref가 다르다 | BUGFIX-05 | 계획 단계에서 `check-env.mjs`+ref 확인 필수. 이 research에서는 DB를 실행하지 않음 |
| A6 | `STATE.md`의 "남은 8건" 분류가 그대로 유효하다(재측정 안 함) | BUGFIX-05 | plan 0C 착수 전 재측정 |

## Open Questions (사용자 결정 필요)

1. **BUGFIX-04 정책 (Q1) — 가장 중요.** 현재 "다시 시도"는 *같은 멱등 키·같은 모델*로 재전송하는 것이 Phase 11 UI-SPEC·테스트가 고정한 설계다. 선택지: **(a)** 요구사항대로 "현재 선택 반영"(선택이 바뀌었고 실패가 `rate_limited/credit_exhausted/unavailable/config`일 때만 새 키로 새 모델 전송; `settlement/unknown/generation_in_progress`는 기존 유지) — 권고 **(a)**; **(b)** 동작 유지 + 모델 변경 시 "새 메시지로 다시 보내기" 안내만 추가하고 BUGFIX-04 문구를 수정. 어느 쪽인가?
2. **BUG-07 편입 (Q2).** 재생성이 사고 토큰으로 잘려 `structure` 거부(과금 없음, 실사용상 재생성 거의 불가)로 처리되는 건. 2026-10-08엔 "관측만, 본 수정은 단계 B와 함께"로 확정했다. 상한 상향(A-2) 효과가 불확실하므로, **옵션 1(잘림을 별도 사유 `truncated`로 분리해 원인 문구 제공, 약 20줄)** 을 Phase 17에 편입할까? 권고: 편입(BUGFIX-01 "원인에 맞는 안내"와 일치, 단계 B 결정에는 영향 없음).
3. **정리 스크립트 vs 0023 잠금 트리거 (Q3).** `deleteFixtures`가 `kb_nodes` 삭제 시 `locked_node_immutable`에 막혀 7개 DB 테스트 실패. 선택지: 정리 스크립트가 서비스 롤 트랜잭션에서 `session_replication_role`/트리거 비활성 또는 잠금 해제 후 삭제 / 트리거에 "테스트 정리 허용" 경로 추가(보안 약화 위험) / 테스트가 잠금 노드를 만들지 않도록 fixture 변경. 권고: **fixture/정리 스크립트 쪽을 고치고 0023 트리거는 건드리지 않는다.**
4. **0022 번호 중복 (Q4).** `0022_account_deletion_purge`(Phase 1, 2026-10-09) vs `0022_template_readonly_backfill`(Phase 2, 02-07). 일회용 DB엔 둘 다 적용됨. 선택지: **(a)** 늦게 생긴 쪽을 빈 번호 0028(의도적 결번)로 개명 — 단 적용 순서가 0027 뒤 0029 앞으로 바뀌므로 `0023_template_policy_guards`와의 의존 확인 필요; **(b)** 두 파일을 그대로 두고 `numbering.test.ts`에 문서화된 예외 목록 추가; **(c)** 0037 이후로 이동. `06-01` 선례는 (a)형. 어느 쪽? (Phase 12 마이그레이션 번호 예약과 함께 결정)
5. **Phase 10 BUG-01 (failed 키 하나가 BYOK 모델 전체를 숨김) 편입 여부 (Q5).** BUGFIX-01~05에 대응하지 않아 권고는 **범위 밖(별도 quick 수정)**. Phase 17에 같이 처리할까?
6. **상한 값 (Q6).** 권고 **4096**(Gemini 기준 최악 출력비용 ≈5토큰≈50원). 3072(≈3.9토큰)나 8192(BYOK와 동일) 중 다른 값을 원하는가?
7. **BUGFIX-05 목표 (Q7).** "전체 `npx vitest run` 통과"를 일회용 DB env가 있는 환경 기준으로 정의할까, 아니면 env 없는 환경(worktree)에서도 DB 파일이 깨끗이 skip되도록(17-0B) 하네스를 바꿀까? 후자는 CONTEXT 결정 3("환경변수·테스트 하네스") 취지와 가깝다. 권고: 17-0B 포함.
8. **수동 UAT 범위 (Q8).** BUGFIX-02/03의 브라우저·실기기 확인(HUMAN-UAT item 2, 미분류 표시, 파일 입력 모바일)은 사람 승인이 필요하다. Phase 17 완료 기준에 포함할지, "코드 완료 + UAT 대기"로 둘지(재개 phase들이 쓰는 방식과 같게).
9. **미커밋 테스트 수정 4건 (Q9).** 메인 체크아웃 master에 있는 4파일 수정을 Phase 17 plan 0A가 커밋할지, 별도로 먼저 커밋될지(실행 전 필요).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npx | 전부 | ✓ | (npx 동작 확인) | — |
| `node_modules` (worktree) | tsc/eslint/vitest | ✗ (worktree 자체엔 없음) | 메인 체크아웃 548개 패키지 | 실행 시 `npm ci` 또는 메인 junction |
| `.next/types` (worktree) | `tsc` (`LayoutProps`) | ✗ | — | `next typegen`/`next dev`로 생성, 또는 메인에서 tsc |
| `.env.local`/`.env.disposable` | DB 테스트 | worktree ✗ / 메인 ✓ | — | 일회용 env를 프로세스 env로 주입 |
| 일회용 Supabase DB | DB 테스트·0017C | 메인 `env.disposable` ✓ (이 research에서 미사용) | 0001~0036 적용(결번 0028·0031) | — |
| Gemini/Claude 서비스 키 | A-2 상한 효과 관측 | ✗ (이 장치) | — | 키 있는 환경에서 수동 관측 |
| 브라우저 | G3·UAT | 별도 | — | 수동 |

**Missing, no fallback:** 실키 관측(A-2 효과 판정)은 키 있는 환경 필요 — plan에서 수동 gate로 분리.
**Missing, with fallback:** worktree `node_modules`·`.next/types`(위 대안).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.11 (`vitest.config.ts`: `unit`/`db` projects, `testTimeout 30000`) [VERIFIED] |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --project unit <파일>` (env 불필요) |
| Full suite command | 단위: `npx vitest run --project unit` (≈10초) / 전체: 일회용 DB env 고정 후 `node --env-file=env.disposable node_modules/vitest/vitest.mjs run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUGFIX-01 | 잘림 원인별 문구, 잔액 충분 시 "소진" 문구 없음 | unit | `npx vitest run --project unit tests/ai/capped-reason.test.ts tests/ai/capped-ux.test.ts` | ✅ |
| BUGFIX-01 | 상한 상향(상수 import 경계) + 비용 | unit | `npx vitest run --project unit tests/ai/cost-estimate.test.ts tests/ai/paid-generation.test.ts` | ✅ (상수 하드코딩 수정 필요) |
| BUGFIX-01 | 관측 로그 필드(본문 미포함) | unit | `npx vitest run --project unit tests/ai/paid-generation.test.ts` | ❌ Wave 0 (케이스 추가) |
| BUGFIX-01/02 (BUG-07 편입 시) | `max_tokens` 재생성이 `truncated`로 거부되고 무과금 | unit | `npx vitest run --project unit tests/ai/regenerate-document.test.ts` | ✅ (케이스 추가) |
| BUGFIX-02 | 이름 고정·provider 정렬 회귀 | unit | `npx vitest run --project unit tests/ai/regenerate-document.test.ts tests/ai/save-document-plan-modal.test.ts tests/ai/ai-panel-model.test.ts` | ✅ |
| BUGFIX-02 | 템플릿 카테고리 구조(DB) | db(일회용) | `…vitest.mjs run tests/kb/template-tree-mutations.test.ts tests/studio/schema-smoke.test.ts` | ✅ |
| BUGFIX-03 | 파일 입력이 `sr-only` + 버튼, Select가 제어형 | unit(SSR 렌더) | `npx vitest run --project unit tests/ai/upload-files-dialog.test.ts` | ❌ Wave 0 |
| BUGFIX-03 | 시각 확인(기본 문구 비노출, 모바일) | manual | 브라우저 | manual-only (시각/실기기) |
| BUGFIX-04 | 선택 변경 후 재시도가 정책대로 동작 | unit | `npx vitest run --project unit tests/ai/ai-panel-model.test.ts tests/ai/chat-request-lifecycle.test.ts` | ✅ (케이스 갱신) |
| BUGFIX-05 | tsc/린트 | static | `npx tsc --noEmit` ; `npm run lint` | ✅ |
| BUGFIX-05 | 마이그레이션 번호 | unit | `npx vitest run --project unit tests/migrations/numbering.test.ts` | ✅ |
| BUGFIX-05 | 프로젝트 분류 | unit | `npx vitest run --project unit tests/config/vitest-projects.test.ts` | ✅ |
| BUGFIX-05 | DB 정리 스크립트 vs 잠금 트리거 | db(일회용) | `…vitest.mjs run tests/reader/reports-cleanup.database.test.ts tests/uat/cleanup-uat-accounts.database.test.ts` | ✅ |

### Sampling Rate
- **Per task commit:** 해당 파일의 `npx vitest run --project unit <파일>` + `npx eslint <변경 파일>`
- **Per wave merge:** `npx vitest run --project unit` + `npx tsc --noEmit`(메인 또는 `.next/types` 있는 환경) + `npm run lint`
- **Phase gate:** 일회용 DB env 고정 전체 `vitest run`(게이트 3개 on) 통과 + `npm run lint` 경고 0 + 수동 UAT 목록 정리

### Wave 0 Gaps
- [ ] `tests/ai/upload-files-dialog.test.ts` — BUGFIX-03 (파일 입력 sr-only, Select 제어형)
- [ ] `tests/ai/paid-generation.test.ts` 관측 로그 케이스 — BUGFIX-01
- [ ] 상수 하드코딩 테스트 갱신 (`capped-reason`, `capped-ux`, `paid-generation`, `cost-estimate`) — BUGFIX-01
- [ ] 선택 변경 재시도 케이스 — BUGFIX-04 (정책 확정 후)
- Framework install: 없음

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | 부분 | 재시도에서 BYOK/서비스 전환 시 서버가 `route`를 신뢰 계산(클라이언트 선택을 그대로 믿지 않음) — 기존 `GenerationRoute` 검증 유지 |
| V5 Input Validation | yes | 업로드 파일 `MAX_IMPORT_FILES`/`MAX_ATTACHMENTS`·확장자 accept 유지(UI 교체가 검증을 우회하지 않게 `pickFiles` 경로 그대로 사용) |
| V6 Cryptography | no | — |
| V7 Logging | yes | 관측 로그에 **본문·키·사용자 내용을 남기지 않는다**(`document-regenerate.ts:181` 선례). 멱등 키는 기록 허용 수준(기존 로그와 동일) |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 이중 차감(재시도 키 변경) | Tampering/Repudiation | `settlement`/`unknown`에는 새 키 금지(§BUGFIX-04) |
| 공유 DB 오염(테스트가 계정 생성) | Tampering | 일회용 DB env 고정, ref 확인, 공유 적용 금지 |
| 관측 로그 PII | Information Disclosure | 토큰 수·finishReason만 |

## Phase 12(MCP OAuth)와의 파일 충돌 가능성

Phase 12는 아직 디렉터리·PLAN이 없다(ROADMAP Phase 12: MCP-01, MCP-08, OAuth discovery/등록/토큰 교환, 연결 클라이언트 목록 UI, 해제). 추정되는 변경 영역과 Phase 17의 겹침:

| 영역 | Phase 17 | Phase 12(추정) | 충돌 위험 |
|---|---|---|---|
| `supabase/migrations/` 번호 | 0022 중복 정리(Q4) | 새 MCP 토큰/클라이언트 테이블 마이그레이션 | **높음** — 번호 계산 충돌(06-01과 동일 원인). Phase 12 plan 작성 전에 번호 예약/정리 완료 필요 |
| `proxy.ts`, `app/api`·`app/.well-known` 라우트 | 없음 | OAuth discovery·토큰 엔드포인트 | 없음 |
| `app/studio/settings/*` | 없음(`ai-providers`는 건드리지 않음) | 연결 목록 UI는 설정/계정 영역 | 낮음 |
| `lib/ai/*` (`cost.ts`, `paid-generation.ts`, `chat*.ts`) | A-2 | MCP 읽기 도구(Phase 13)가 컨텍스트 번들을 호출 가능 | 낮음(Phase 13 쪽) |
| `tests/*` 공용(`vitest.config.ts`) | 17-0B에서 변경 가능 | 새 테스트 추가 | 낮음 — config 변경 시 사전 공지 |
| `package.json`/lockfile | 변경 없음 | OAuth 라이브러리 추가 가능 | 낮음 |

Phase 11 코드는 완료(`11-VERIFICATION`, 남은 건 수동 UAT 11-08 Task 2·11-12 Task 2)라 `AiPanel.tsx`/`chat.ts`/`paid-generation.ts` 동시 편집 우려는 해소됐다. 단 `AiPanel.tsx`는 BUGFIX-04가 만지는 유일한 phase 파일이므로 Phase 17 안에서 한 plan으로 묶는다. 다른 세션이 같은 파일을 편집 중인지 실행 직전 `git status`로 확인한다.

## 제안 plan 분할 (웨이브·의존·파일 겹침)

| Wave | Plan | 내용 | 주요 파일 | 의존 |
|---|---|---|---|---|
| 1 | 17-01 | BUGFIX-05 분류 문서 + 린트 경고 9건(`AiPanel.tsx:192` 제외) + 미커밋 테스트 4건 반영 | `era-board.tsx`, 테스트 6파일, 분류 문서 | Q9(4파일 커밋) |
| 1 | 17-02 | BUGFIX-03 파일 입력 sr-only + 버튼, Select 회귀 테스트, G2 문서화 | `UploadFilesDialog.tsx`, 신규 테스트 | — |
| 1 | 17-03 | BUGFIX-01 A-2: 상한 4096 + 관측 로그 + 테스트 상수 추종 (+Q2 시 BUG-07 `truncated` 분리) | `cost.ts`, `paid-generation.ts`, (`document-regenerate.ts`), 테스트 4~5파일 | Q2, Q6 |
| 1 | 17-04 | BUGFIX-04 재시도 정책 + `AiPanel.tsx:192` 경고 | `AiPanel.tsx`, `chat-request.ts`, `ai-panel-model.test.ts` | Q1 |
| 2 | 17-05 | BUGFIX-05 DB 결함: 0022 번호, 정리 스크립트 vs 0023, (17-0B 하네스) — 일회용 DB 필요 | `supabase/migrations/0022_*`, `numbering.test.ts`, `scripts/lib/report-fixture-cleanup.mjs`, (`vitest.config.ts`) | Q3, Q4, Q7, 17-01 |
| 2 | 17-06 | BUGFIX-02 마무리: UAT(HUMAN-UAT item 2, 미분류 표시), 문서 갱신(`bugs/README`·BUG-04·REQUIREMENTS·ROADMAP·STATE), 수동 gate | 문서만 | 17-03 이후 권장, Q8 |

W1의 4개 plan은 **파일이 겹치지 않아 병렬 가능**(`AiPanel.tsx`는 17-04만, `paid-generation.ts`/`cost.ts`는 17-03만, `tests/ai/ai-panel-model.test.ts`는 17-04만, `tests/ai/capped-*.test.ts`·`paid-generation.test.ts`·`cost-estimate.test.ts`는 17-03만). 테스트 `wallet-refresh.test.ts`(17-01)는 17-0x와 겹치지 않는다. 각 버그는 CLAUDE.md 규칙대로 원인 phase `bugs/`에 `/bug-plan` 문서화 후 `/bug-execute` → `/bug-complete`로 `fixed/`에 이관(가능한 건: Phase 8 BUG-04 A-2 분, Phase 16 G2·G3·G4의 문서화 위치는 `phases/16-studio-workflow-upload/bugs/` 신설 필요 — 현재 폴더 없음).

실행 후 ROADMAP 동기화 규칙(CLAUDE.md): 각 plan 종료 시 `gsd-tools.cjs roadmap update-plan-progress 17`.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- 모든 대화·문서 한국어. 에이전트/Codex 호출 시 모델 **명시**(`-m`, `model:`), 호출 전 한 줄 보고, 로그 `model:` 줄 확인.
- AGENTS.md: 이 Next.js는 학습 데이터와 다르다 — 코드 작성 전 `node_modules/next/dist/docs/` 해당 가이드 확인.
- graphify: 코드 수정 후 `graphify update .` → 직후 `python3 scripts/graph-link-requirements.py`.
- 버그 워크플로: `bug-plan`→`bug-execute`→`bug-complete`. 검증된 수정만 `.planning/fixed/{phase}-{NN} 간단한 정리.md`로.
- executor 종료마다 ROADMAP/Progress 동기화. UI phase는 목업 규칙(이 phase는 UI 변경이 작아 UI-SPEC 필요 여부는 planner 판단, ROADMAP은 `UI hint: yes`).
- plan-phase 모델 분담: planner = Codex(`gpt-6-sol`), checker = sonnet. researcher/executor는 Jev 분류 표(`jev-model-routing`).
- 공유 Supabase 프로젝트에 마이그레이션 적용 금지, DB 테스트는 일회용 DB만.

## Sources

### Primary (HIGH confidence — 코드·측정)
- `lib/ai/cost.ts`, `lib/ai/chat-result.ts`, `lib/ai/chat.ts:135`, `lib/ai/document-plan.ts:82-93`, `lib/ai/paid-generation.ts:140-215`, `lib/ai/document-regenerate.ts:177-190`, `lib/ai/chat-request.ts:20-120`
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/{AiPanel,UploadFilesDialog,QuickAddDialog,ChatMessageBubble,quick-add-folders}.ts(x)`
- `vitest.config.ts`, `package.json`, `tests/migrations/numbering.test.ts`, `tests/ai/{capped-reason,ai-panel-model,paid-generation,cost-estimate}.test.ts`
- 측정: `npx tsc --noEmit`(worktree/main), `npx eslint .`, `npx vitest run --project unit`, `npx vitest run --project db`(env 없음)
- `.planning/` 문서: `17-CONTEXT.md`, `STATE.md`, `REQUIREMENTS.md`(BUGFIX), `ROADMAP.md` Phase 17, Phase 8 `bugs/BUG-04`, Phase 9/10/15 `bugs/*`, `fixed/08-04`·`15-03`·`15-04`·`07-06`·`06-01`, `16-UAT.md`, `16-VERIFICATION.md`, `11-UI-SPEC.md`, `11-11-SUMMARY.md`
- 메모리 `project-manual-gates-2026-10-23.md`(일회용 DB 요령)

### Secondary (MEDIUM)
- `STATE.md` 2026-10-23의 DB 포함 전체 vitest 결과(이 research에서 재측정하지 않음)

### Tertiary (LOW)
- 없음 (웹 조사 없음 — 전부 코드 기반). 외부 패키지 추가 없음 → slopcheck 해당 없음.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 의존성 없음
- Architecture/범위 재정리: HIGH — 파일:줄 확인
- 상한 권고 값: MEDIUM — 비용은 코드 계산, 효과는 실키 관측 전 미확인(A1)
- BUGFIX-05 DB 항목: MEDIUM — DB suite는 STATE 인용, 재측정 미실시

**Research date:** 2026-10-23
**Valid until:** 2026-11-06 (14일 — 메인 체크아웃 미커밋 변경·Phase 12 착수로 빠르게 변함)
