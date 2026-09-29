# Phase 10: BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 제공자별(OpenAI · Anthropic · Gemini) 자기 API 키를 1개씩 계정 설정에서 등록·삭제하고, 서버가 저장 전에 제공자의 **모델 목록 엔드포인트(무과금)** 로 키를 검증한다. 검증이 돌려준 모델 목록이 곧 AI 패널 모델 피커에 나타나는 "내가 실제로 호출 가능한 모델"이 되며, 각 항목에 `BYOK` / `서비스 키` 배지가 붙어 누가 비용을 내는지 선택 시점에 보인다.

**이 페이즈가 하지 않는 것 (Phase 11):** BYOK 키로 실제 생성 호출, 플랫폼 토큰 차감 우회, 실패 4분류 안내와 `검증 실패` 자동 전환, 사용량/예상 비용 화면, 비용 게이지 숨김, 출력 상한 상향. 여기서는 **키 보관·검증·관리와 피커 표시**까지다.

**요구사항:** BYOK-01, BYOK-02, BYOK-03, BYOK-04, PROV-05
**UI 페이즈:** yes (`/gsd:ui-phase 10` 권장)

</domain>

<decisions>
## Implementation Decisions

### 키 보관 · 재검증
- **D-01:** 키는 **Supabase Vault**(`vault.create_secret` / `vault.decrypted_secrets`, 테스트 프로젝트에 `supabase_vault` 0.3.1 활성화 확인됨)에 암호문으로 보관한다. 앱 레벨 AES-256-GCM은 채택하지 않는다(이 결정은 ROADMAP이 "계획 시점에 확정"하라고 못박은 항목이며 여기서 확정 — 구현 중 번복하면 데이터 마이그레이션이 된다).
- **D-02:** 테이블(예: `byok_keys`)에는 Vault의 `secret_id`와, 등록 시 **한 번 계산해 저장하는 평문 `masked_hint`(끝 4자리)**, 제공자, 등록일, 상태만 둔다. `masked_hint`는 비밀에서 다시 파생하지 않는다. 복호화는 **서비스 롤 전용 SECURITY DEFINER 함수**를 통해서만 하고, 설정 화면은 복호화된 값을 절대 렌더하지 않는다.
- **D-03:** 저장된 키의 상태를 다시 확인하는 **수동 [다시 확인] 버튼**을 카드마다 둔다(models-list 호출, 무과금) — 상태와 모델 목록을 갱신한다. **자동/주기 재검증은 만들지 않는다.** 호출 실패로 인한 자동 `검증 실패` 전환은 Phase 11(BYOK-05) 범위.

### 피커 모델 목록 · 배지
- **D-04:** BYOK 항목으로 피커에 나오는 모델 = **카탈로그(`lib/ai/providers/catalog.ts`) ∩ 키 검증(models-list) 응답**. 카탈로그 밖 모델(예: 새로 나온 모델)은 노출하지 않는다 — 단가·상한·거절 매핑이 검증된 모델만 다루고, Phase 11의 BYOK 사용량 금액(BYOK-07) 계산이 가능하도록 한다. 새 모델은 카탈로그에 추가해야 나타난다.
- **D-05:** 같은 모델이 서비스 키와 BYOK로 모두 호출 가능해지면 **피커 항목을 둘로 분리**해 각각 `[BYOK]` / `[서비스 키]` 배지를 붙인다. 키가 없는 제공자는 `[서비스 키]` 한 줄만. `검증 실패`(폐기된 키) 상태의 제공자는 BYOK 항목을 숨긴다("실제 호출 가능한 모델만"). **전역 BYOK 모드 토글은 만들지 않는다** — 모드는 선택한 항목의 배지에서 파생된다.
- **D-06:** 결과적으로 **"선택 값"에 결제 주체(key source)가 포함돼야 한다.** Phase 9의 `providerId:model` 선택 값(AI 패널 `Select` value, `chatAction` 스키마, 계정 기본값 저장)은 `providerId + model + keySource(byok|service)` 로 확장한다. 단, 서버는 클라이언트가 보낸 `byok` 값을 신뢰해 분기하지 않고 **매 호출 키 존재·상태를 재도출**한다(TOCTOU, Phase 11에서 강제) — 이 페이즈는 값 확장과 저장 형태만 다룬다.
- **D-07:** 계정 기본값(`profiles.default_provider/default_model`, Phase 9)도 keySource를 가질 수 있다(기본 선택이 `BYOK` 항목일 수 있음). 저장 형태(새 컬럼 vs 인코딩)는 플래너가 정한다. **`profiles`에 컬럼을 추가하는 마이그레이션은 0006의 컬럼 단위 UPDATE grant도 함께 갱신해야 한다**(Phase 9에서 grant 누락으로 저장이 실패했던 교훈).

### 키 삭제 · 대체
- **D-08:** 삭제는 **영향 안내 다이얼로그 → [삭제]/[취소]** 를 거친다(제공자명 직접 입력 같은 추가 마찰은 요구하지 않는다). 안내 문구는 (a) 이 제공자의 BYOK 모델 N개가 피커에서 사라지고, (b) 기본값이 BYOK였다면 무엇으로 바뀌는지, (c) 삭제된 키는 Vault에서도 폐기돼 복구할 수 없고 교체는 삭제 후 재등록임을 담는다.
- **D-09:** 삭제된 키가 **기본 선택이었으면 같은 모델의 `[서비스 키]` 항목으로 자동 대체**한다. 서비스 키로 제공되지 않는 모델이면 Gemini 기본값(`gemini-3.5-flash` 서비스 키)으로 대체한다. 삭제 시 Vault 비밀과 `byok_keys` 행을 함께 제거한다(고아 비밀 금지).

### 키 등록 화면 · 검증 UX
- **D-10:** BYOK 대상은 **OpenAI · Anthropic · Gemini 3개 제공자 전부**, 제공자당 키 1개. 위치는 `/studio/settings/ai-providers`(Phase 9 D-04)의 기존 "계정 기본값" 섹션 아래 새 섹션으로 합류한다.
- **D-11:** 등록은 **[등록] 한 번에 검증+저장**이다. 키를 붙여넣고 [등록]을 누르면 서버가 models-list로 검증하고 **성공한 경우에만** Vault에 저장한다. 실패하면 키는 저장되지 않고 입력란 아래에 사유가 표시된다. 검증 자체는 생성 호출이 아니므로 작가에게 과금되지 않는다. 평문 키는 요청 처리 중 서버 메모리에만 존재하며 응답·로그·에러 어디에도 되돌리지 않는다.
- **D-12:** 검증 실패 사유는 **원인별 한국어 문구**로 안내한다(형식 오류 / 유효하지 않은 키 401 / 권한 부족 403 / 제공자 일시 장애·타임아웃 / 한도 초과 429) — 각각 "다시 시도" vs "키 확인"처럼 다음 행동이 다르게 안내된다. Phase 8의 정제된 에러 분류(`ProviderCallError.info`)를 재사용하며 키·헤더·응답 본문은 노출하지 않는다.
- **D-13:** 카드에는 제공자 · 끝 4자리 · 등록일 · 상태(`연결됨` / `검증 실패` / `미등록`)만 표시한다. 평문·앞자리는 어디에도 나오지 않는다. 키 교체 전용 UI는 없다(삭제 후 재등록).

### Claude's Discretion
- `byok_keys` 테이블 스키마 세부(제약, 인덱스, RLS, 서비스 롤 접근 방식)와 Vault 함수 시그니처.
- 제공자별 models-list 호출 구현(SDK vs fetch, 타임아웃, Gemini 모델 목록 엔드포인트 사용법), 응답 모델 ID와 카탈로그 ID 매칭 규칙(접두사·별칭).
- 피커 정렬·그룹 표기, 배지의 시각 디자인, 설정 페이지 세부 레이아웃, 다이얼로그 카피 — UI-SPEC에서 확정.
- 진행 중인 요청과 키 삭제가 겹칠 때의 레이스 처리 방식.
- 선택 값 인코딩(D-06)의 정확한 형태와 기존 `providerId:model` 값의 하위 호환.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 요구사항 · 로드맵
- `.planning/ROADMAP.md` §Phase 10 — 목표, Success Criteria 4개, Notes(암호화 결정 시점, `masked_hint`)
- `.planning/REQUIREMENTS.md` — BYOK-01~04, PROV-05 원문, "전역 BYOK 모드 토글 없음"·"BYOK 실패 시 서비스 키 자동 폴백 없음" 제외 항목
- `.planning/phases/09-openai-anthropic/09-CONTEXT.md` — D-01~D-08(카탈로그, 설정 페이지 위치, 1회 전환, 비용 단위), Phase 10이 합류할 레이아웃
- `.planning/phases/09-openai-anthropic/09-VERIFICATION.md` — 라이브/브라우저 UAT에서 드러난 결함 3건(grant 누락 포함)
- `.planning/phases/08-provider-adapter-idempotent-debit/08-CONTEXT.md` — 에러 스크러빙 choke point, 원인별 에러 분류(D-07~D-10)

### 리서치 (v1.1)
- `.planning/research/ARCHITECTURE.md` — Vault 보관 패턴, `byok.ts` 위치, 키 온보딩 흐름(§Pattern 3), 신뢰 경계
- `.planning/research/FEATURES.md` — BYOK 키 저장 표(암호화 + masked hint), 실패 4분류
- `.planning/research/PITFALLS.md` — 키 유출 경로, 과금 경계(TOCTOU)
- `.planning/research/STACK.md` — 호출 계층, 암호화 옵션

### 코드 · 마이그레이션
- `lib/ai/providers/catalog.ts` — `PROVIDER_MODELS`, `isKnownModel`, `defaultModelFor` (BYOK 모델 = 이것 ∩ 키 응답)
- `lib/ai/providers/registry.ts` — 서비스 키 provider 생성. Phase 11이 여기에 BYOK 분기를 붙인다
- `lib/ai/providers/settings.ts` — 계정 기본값 읽기/쓰기(keySource 확장 대상)
- `lib/ai/providers/errors.ts` — `toSanitizedProviderError`, `ProviderCallError` (검증 실패 사유 분류에 재사용)
- `lib/ai/providers/types.ts` — `ProviderId`, `ProviderClient`
- `app/studio/settings/ai-providers/page.tsx` — 키 관리 섹션이 합류할 페이지
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — 모델 피커(배지·항목 분리 대상), 전송 후 기본값 복귀
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` — `chatActionSchema`(선택 값 스키마)
- `supabase/migrations/0006_admin_foundation.sql` (L262-263) — `profiles` 컬럼 단위 UPDATE grant
- `supabase/migrations/0013_ai_provider_defaults.sql` — 기본값 컬럼 + grant 선례
- `scripts/apply-migration.mjs` — 마이그레이션 적용 방법 (`node --env-file=.env.local scripts/apply-migration.mjs <파일명>`; 마지막 번호는 0013)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `catalog.ts`의 `PROVIDER_MODELS`/`isKnownModel`: BYOK 모델 필터의 기준 집합.
- `errors.ts`의 정제된 에러 분류: 키 검증 실패 사유 문구 매핑에 그대로 사용.
- `settings.ts` + 설정 페이지의 server action 패턴(`saveDefault`): 키 등록/삭제 server action의 뼈대.
- `tests/helpers/db.ts`(`adminClient`, `createTestUser`): 통합 테스트용 계정·서비스 롤 클라이언트.

### Established Patterns
- 서버 전용 모듈은 `import 'server-only'`; 벤더 SDK는 어댑터 뒤에 숨기고 정제된 에러만 밖으로 나간다.
- `profiles`는 컬럼 단위 grant 정책 — 새 컬럼마다 grant 필요. RLS는 `auth.uid() = id`.
- 마이그레이션은 재실행 안전(`if not exists`)하게 작성하고 `apply-migration.mjs`로 적용. 원격 테스트 DB는 문서상 테스트 프로젝트.
- 모킹 단위 테스트는 grant·모델 파라미터 같은 실제 계약 위반을 못 잡는다 → 라이브/브라우저 검증을 phase 종료 조건에 포함(Phase 9 교훈).

### Integration Points
- AI 패널 `Select` value / `chatActionSchema` / 계정 기본값 저장: `providerId:model` → `+keySource` 확장 (D-06).
- 설정 페이지 하단에 키 관리 섹션 추가.
- Phase 11이 registry에 BYOK 분기를 붙일 때 쓸 "키 조회(서비스 롤 복호화)" 함수 경계를 이 페이즈에서 정의해 둔다(호출 경로 자체는 만들지 않음).

</code_context>

<specifics>
## Specific Ideas

- 피커 표기 예: `GPT-4o mini [BYOK]` / `GPT-4o mini [서비스 키]` — 항목 분리, 같은 이름 유지.
- 삭제 다이얼로그 예: "OpenAI 키를 삭제하면 BYOK 모델 N개가 피커에서 사라지고, 기본값이 GPT-4o mini [서비스 키]로 바뀝니다. 삭제된 키는 복구할 수 없어요."
- 검증 중 상태는 [등록] 버튼 로딩으로 표시(모델 목록 호출은 생성 호출이 아니라 빠르고 무과금).

</specifics>

<deferred>
## Deferred Ideas

- BYOK 호출 경로 · 플랫폼 토큰 차감 우회 · 비용 게이지 숨김 · 출력 상한 상향 — Phase 11 (BYOK-06/08/09)
- 실패 4분류 안내와 호출 실패 시 자동 `검증 실패` 전환, 1탭 재시도 — Phase 11 (BYOK-05)
- 이번 달 제공자별 BYOK 사용량·예상 비용 — Phase 11 (BYOK-07, COST-02)
- 주기적/자동 키 재검증, 키 제자리 교체(rotate) UI — 필요해지면 별도 검토
- 카탈로그 밖 모델의 자동 노출(신모델 즉시 사용) — 단가 수집 방식이 정해지면 재논의

### Reviewed Todos (not folded)
- `2026-09-17-phase-07-deferred-browser-checks.md` (Phase 7 브라우저 검수) — 키워드 매칭(점수 0.2)뿐, 이 페이즈와 무관

</deferred>

---

*Phase: 10-BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지*
*Context gathered: 2026-09-29*
