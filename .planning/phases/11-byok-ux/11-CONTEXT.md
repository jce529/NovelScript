# Phase 11: BYOK 호출 경로 · 사용 기록 · 실패 UX - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 자기 API 키(BYOK)로 실제 생성을 수행한다 — 지갑 토큰은 차감되지 않고 잔액이 0이어도 막히지 않는다. 실패는 원인 4종(무효·폐기 키 / 레이트리밋 / 크레딧 소진 / 타임아웃·장애)별로 구분되어 안내되고, 선택한 키를 쓸 수 없을 때는 무엇으로 대체됐는지 화면에서 보고 작가가 진행 여부를 결정한다. 이번 달 제공자별 BYOK 호출 수·토큰 수를 볼 수 있으며, 모든 AI 호출(서비스 키 포함)이 지갑 원장과 분리된 사용 기록(`ai_usage`)에 남는다.

**범위 밖(이미 정해짐):** 자동 재시도, 서비스 키로의 조용한 폴백, 제공자당 다중 키, 스트리밍 응답, 키 자동/주기 재검증 (REQUIREMENTS Out of Scope / Phase 10 D-03).

</domain>

<decisions>
## Implementation Decisions

### 패널 표시 · 출력 상한 (BYOK-08, BYOK-09)
- **D-01:** BYOK 모델을 선택하면 지갑 토큰 비용 게이지를 숨기고, 그 자리에 **안내 한 줄**("내 키로 호출해요 · 지갑 토큰은 차감되지 않아요" 계열, 정확한 문구는 UI-SPEC에서 확정)을 보여준다. 누가 비용을 내는지가 배지(`[BYOK]`)와 함께 계속 보이도록 한다.
- **D-02:** BYOK 호출의 1회 출력 토큰 상한은 **8192 고정**이다 (서비스 키 `PER_REQUEST_MAX_OUTPUT_TOKENS` 2048의 4배). 제공자·모델과 무관한 단일 상수이며, 세 벤더 모두 이 값을 지원해야 한다(플래너/리서처가 각 카탈로그 모델의 실제 최대 출력으로 검증). 서비스 키 상한은 변경하지 않는다.
- **D-03:** BYOK 모델 선택 시 "입력 1,000 + 출력 1,000 토큰 기준 약 N 지갑 토큰" **예시 비용 문구는 숨긴다** (지갑 토큰 개념이 BYOK에 해당하지 않음). Phase 10에서 넣은 "BYOK 모델 호출은 아직 준비 중이에요"(`BYOK_COPY.sendBoundary`)와 [보내기] 비활성 조건(`keySource === 'byok'`)은 이 phase에서 제거한다.

### 실패 안내 · 재시도 · 대체 (BYOK-05, PROV-06)
- **D-04:** 실패 안내는 **기존 패널 알림 카드**(서비스 키 실패가 나오는 자리, `notice` + `onRetry`)를 재사용해 BYOK 4종 문구·버튼을 추가한다. 새로운 대화 로그 말풍선 컴포넌트는 만들지 않는다.
- **D-05:** [다시 시도] 버튼은 **무효·폐기 키를 제외한 3종**(레이트리밋 / 크레딧 소진 / 타임아웃·장애)에 제공한다. 재시도는 항상 사용자가 직접 누르며 자동 재시도는 없다(같은 멱등 키·같은 스냅샷 재사용, 기존 UI-SPEC §1 동작). 무효·폐기 키는 재시도해도 소용없으므로 버튼 대신 **[설정에서 키 확인]** 링크만 제공하고, 해당 키 상태를 `검증 실패`로 전환한다. 다른 3종은 키 상태를 바꾸지 않는다(무효 키만 `검증 실패`, BYOK-05). 크레딧 소진은 제공자에서 충전해야 하는 상황임을 문구로 안내한다.
- **D-06:** 선택한 BYOK 키를 쓸 수 없을 때(이미 `검증 실패`이거나 전송 직전 삭제된 경우) **전송하지 않고** 알림 카드에 무엇으로 대체 가능한지를 보여주며 **[서비스 키로 보내기(지갑 토큰 차감)] / [취소]** 명시 동의 버튼을 둔다. 사용자가 누를 때만 같은 모델의 서비스 키 항목으로 전송한다 — 서비스 키↔BYOK 간 조용한 전환은 없다(PROV-06). 서비스 키로 제공되지 않는 모델이면 Phase 10 D-09의 대체 규칙(Gemini 기본값)을 따른다.
- **D-07:** 과금 모드(서비스/BYOK)는 **매 호출 서버에서 재도출**한다 — 클라이언트가 보낸 `byok`/`keySource`는 분기 입력으로 신뢰하지 않는다(TOCTOU, 로드맵 Notes / Phase 10 D-06). BYOK 경로는 "상한 0인 서비스 경로"가 아니라 지갑 cap 계산·차감 블록 전체를 구조적으로 건너뛰는 **별도 분기**다. BYOK 성공 시 지갑 원장에는 0원 행을 기록하지 않는다.

### 이번 달 사용량 화면 (BYOK-07)
- **D-08:** 사용량은 **각 제공자 카드 안**에 표시한다 (`/studio/settings/ai-providers`의 `ByokKeyCards`). 카드에는 제공자 합계(호출 수 · 입력/출력 토큰 수)를 보이고, **모델별 상세**를 펼쳐 볼 수 있게 한다.
- **D-09:** **금액(예상 비용)은 표시하지 않는다 — 호출 수와 토큰 수만 보여준다.** 이는 REQUIREMENTS BYOK-07과 ROADMAP Phase 11 성공 기준 5의 "예상 비용(금액)"을 삭제하는 결정이며, 두 문서를 이 결정에 맞춰 수정한다. 따라서 Phase 10 D-04가 언급한 "BYOK 사용량 금액(BYOK-07)" 목적의 카탈로그 단가 사용은 이 phase에서 필요하지 않다.
- **D-10:** "이번 달"의 경계는 **KST(Asia/Seoul) 매월 1일 00시**다. 집계 쿼리는 이 기준 월 시작을 사용한다.

### 사용 기록 `ai_usage` (COST-02)
- **D-11:** **서비스 키와 BYOK 모두** 기록한다(`key_source` = `service` | `byok`). 지갑 원장과 분리된 별도 테이블이며, "정산 무관"임을 명시하는 SQL 주석을 남겨 향후 작가 90/10 정산 쿼리를 오염시키지 않게 한다(로드맵 Notes).
- **D-12:** **성공한 호출과 제공자 거부(usage가 보고된 경우)만** 기록한다. 타임아웃·장애·레이트리밋·무효 키 같은 실패는 토큰이 소비되지 않았으므로 기록하지 않는다 — 기록 실패가 호출을 막지 않고, 집계에 노이즈가 없다.
- **D-13:** BYOK 분기와 사용 기록은 **`preflightPaidGeneration`/`settlePaidGeneration` 공통 경로에 한 번에** 둔다. chat뿐 아니라 문서 계획·문서 재생성 등 같은 경로를 쓰는 모든 AI 진입점이 자동으로 같은 규칙(BYOK 분기 + 사용 기록)을 따른다 — 빠지는 경로가 없어야 한다.
- **D-14:** 기록 필드는 **최소 + 작품/회차 참조**다: 소유자, 제공자, 모델, `key_source`, 입력·출력(및 별도 보고되는 사고) 토큰, 상태(성공/거부), 시각, 멱등 키, 작품·회차 참조. **프롬프트·응답 본문은 저장하지 않는다.**

### Claude's Discretion
- `ai_usage` 스키마 세부(제약·인덱스·RLS·서비스 롤 기록 방식)와 멱등 키 중복 방지 방식(같은 요청 재시도 시 이중 기록 방지).
- 사용량 집계 쿼리/뷰 형태와 카드 내 펼침 UI 세부, 문구, 배치 — UI-SPEC에서 확정.
- 크레딧 소진을 각 제공자 오류 응답에서 어떻게 식별·분류할지(제공자별 status/코드 매핑), 무효 키를 `검증 실패`로 전환하는 시점의 레이스 처리.
- BYOK 호출 시 복호화 함수(`get_byok_secret`) 호출 위치와 키 수명(메모리 내 최소 유지), 요청 중 키 삭제와의 레이스.
- "정산 무관" 주석의 정확한 위치와 표현.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 정의 · 요구사항
- `.planning/ROADMAP.md` §Phase 11 — Goal, Success Criteria 1~5(단, 5의 "예상 비용(금액)"은 D-09로 삭제), Notes(서버 재도출·별도 분기·ai_usage 정산 무관 주석)
- `.planning/REQUIREMENTS.md` — PROV-06, BYOK-05~09, COST-02 (BYOK-07은 D-09로 수정), Out of Scope 표(자동 폴백·다중 키·스트리밍)

### 이전 phase 결정 (이 phase가 확장하는 계약)
- `.planning/phases/10-byok/10-CONTEXT.md` — D-01~D-13: Vault 보관, `masked_hint`, 선택 값 `keySource` 인코딩(D-06), 삭제 시 기본값 대체(D-09), 수동 재확인만(D-03)
- `.planning/phases/10-byok/10-UI-SPEC.md` — 설정 카드·피커 배지·알림/다이얼로그 UI 계약 (이 phase의 UI-SPEC이 확장)
- `.planning/phases/10-byok/10-06-SUMMARY.md` — Phase 10 종료 상태와 Known gaps
- `.planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md` — 멱등 차감(D-02/D-03), 실패 분류 rate_limited/unavailable/config, 정제된 오류 로깅
- `.planning/phases/09-openai-anthropic/09-CONTEXT.md` — 제공자별 단가·카탈로그·계정 기본값

### 코드 (수정 대상·연동 지점)
- `lib/ai/paid-generation.ts` — `preflightPaidGeneration` / `settlePaidGeneration`: BYOK 분기와 사용 기록을 둘 공통 경로
- `lib/ai/chat.ts`, `lib/ai/chat-request.ts`, `lib/ai/chat-result.ts` — 요청 스키마·결과 타입·실패 문구(`rate_limited`/`unavailable`/`config`)
- `lib/ai/cost.ts` — `PER_REQUEST_MAX_OUTPUT_TOKENS`(서비스 키 2048), `computeMaxOutputTokens`
- `lib/ai/providers/byok.ts`, `byok-copy.ts`, `byok-models.ts`, `selection.ts`, `registry.ts`, `errors.ts` — 키 복호화·상태 전환·문구·선택 값·제공자 오류 정제
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — 게이지·예시 비용·[보내기] 비활성·알림 카드·다시 시도
- `app/studio/settings/ai-providers/ByokKeyCards.tsx`, `page.tsx`, `actions.ts` — 카드 내 사용량 표시
- `supabase/migrations/0014_byok_keys.sql`, `0015_byok_secret_cleanup.sql` — 키 보관 스키마와 서비스 롤 전용 SECURITY DEFINER 함수

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `preflightPaidGeneration` / `settlePaidGeneration` (`lib/ai/paid-generation.ts`): 지갑 cap 계산·멱등 차감이 들어 있는 공통 경로 — BYOK는 여기서 cap·차감 블록 전체를 건너뛰는 분기로 추가한다.
- 패널 알림 카드 + `handleRetry` (`AiPanel.tsx`): 같은 멱등 키·스냅샷 재전송(`failedAttemptRef`, `retryButtonRef`) — BYOK 실패 3종 재시도와 [서비스 키로 보내기] 버튼이 재사용한다.
- `BYOK_COPY` (`byok-copy.ts`), `toSanitizedProviderError` (`errors.ts`): 원인별 한국어 문구·제공자 오류 정제 — 4종 실패 문구·분류 확장 기반.
- `get_byok_secret` (service_role 전용 SECURITY DEFINER), `set_byok_status`: 호출 시 복호화와 `검증 실패` 전환에 사용.
- `ByokKeyCards.tsx`: 카드 UI — 사용량 행 추가 위치.

### Established Patterns
- 서버가 매 호출 결제 주체를 재도출하고 클라이언트 값은 신뢰하지 않는다 (Phase 10 D-06, `chat-action` 서버 차단).
- 지갑 원장은 `(wallet_id, reference_type, reference_id)` 유니크로 이중 차감을 막는다 — `ai_usage`도 멱등 키 기준 이중 기록 방지가 필요.
- 제공자 오류는 정제된 `{ provider, status, kind, idempotencyKey }`만 로깅하고 본문·키를 노출하지 않는다 (Phase 8 D-10~D-12).
- 마이그레이션은 `scripts/apply-migration.mjs`로 원격 적용, DB 테스트는 skipped 0이어야 통과.

### Integration Points
- `chat()` → `preflightPaidGeneration` → `settlePaidGeneration(client, ctx, …, generate)`: BYOK 제공자 클라이언트 생성(복호화 키)과 사용 기록 삽입 지점.
- 문서 계획·재생성 경로(`document-plan.ts`, `document-regenerate.ts`)도 같은 공통 경로를 타는지 플래너가 확인해 누락 없이 연결.
- `ByokKeyCards` 사용량 표시는 KST 월 시작 기준 `ai_usage` 집계 조회에 의존.

</code_context>

<specifics>
## Specific Ideas

- 실패 알림 카드의 명시 동의 버튼 문구는 "서비스 키로 보내기" + 지갑 토큰이 차감된다는 사실을 함께 보여야 한다.
- 금액을 표시하지 않기로 했으므로 사용량 카드는 "이번 달 N회 · 입력 X · 출력 Y 토큰" 형태의 단순한 숫자 중심 표시.

</specifics>

<deferred>
## Deferred Ideas

- BYOK 사용량의 예상 금액(원화/USD) 표시 — 이번 phase에서 삭제. 필요해지면 별도 phase로 요구사항을 다시 세운다.
- 실패 호출까지 포함한 운영 분석용 사용 기록(status별) — 이번 phase는 성공·거부만.
- 서비스 키 사용량 화면 / 기간 선택 / 전용 사용량 페이지 — 이번 phase는 BYOK 카드 내 표시만.
- 카탈로그 밖 모델 노출, 모델별 출력 상한 튜닝 — 8192 단일 상수로 시작.

</deferred>

---

*Phase: 11-BYOK 호출 경로 · 사용 기록 · 실패 UX*
*Context gathered: 2026-09-30*
