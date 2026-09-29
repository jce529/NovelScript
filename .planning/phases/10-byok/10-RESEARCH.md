# Phase 10: BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 - Research

**Researched:** 2026-09-29  
**Domain:** Supabase Vault custody, provider models-list validation, model selection  
**Confidence:** MEDIUM (repo/installed SDK HIGH; live Vault permissions and provider behavior unverified)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
- BYOK 호출 경로 · 플랫폼 토큰 차감 우회 · 비용 게이지 숨김 · 출력 상한 상향 — Phase 11 (BYOK-06/08/09)
- 실패 4분류 안내와 호출 실패 시 자동 `검증 실패` 전환, 1탭 재시도 — Phase 11 (BYOK-05)
- 이번 달 제공자별 BYOK 사용량·예상 비용 — Phase 11 (BYOK-07, COST-02)
- 주기적/자동 키 재검증, 키 제자리 교체(rotate) UI — 필요해지면 별도 검토
- 카탈로그 밖 모델의 자동 노출(신모델 즉시 사용) — 단가 수집 방식이 정해지면 재논의

### Reviewed Todos (not folded)
- `2026-09-17-phase-07-deferred-browser-checks.md` (Phase 7 브라우저 검수) — 키워드 매칭(점수 0.2)뿐, 이 페이즈와 무관
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|----|-------------|------------------|
| BYOK-01 | 제공자별 작가 키 1개 등록 | 유일 제약, writer 인증, 검증 후 원자적 Vault 저장 |
| BYOK-02 | 저장 전 무과금 모델 목록 검증, 실패 시 미활성 | 설치 SDK의 list API, 정제 오류, 타임아웃/페이지 순회 |
| BYOK-03 | 메타데이터만 표시, 평문 재노출 금지 | 서비스 롤 전용 복호화, masked hint, 응답/로그 허용 목록 |
| BYOK-04 | 삭제 안내, 기본값 대체, 삭제 후 재등록 | 트랜잭션 삭제와 기본값 갱신, UI-SPEC 다이얼로그 |
| PROV-05 | 실제 가능한 모델과 결제 주체 배지 | 카탈로그 교집합, source별 중복 항목, Phase 10 생성 차단 |
</phase_requirements>

## Summary

[VERIFIED: repo `10-CONTEXT.md`, `10-UI-SPEC.md`] Vault 사용, 키별 수동 검증, 카탈로그 교집합, source별 피커 항목, 삭제 대체 규칙은 고정이다. Phase 10에서는 BYOK 생성이 아직 불가능하므로 UI-SPEC은 BYOK 선택 시 전송을 비활성화하고 명시적 안내를 요구한다. 이를 빠뜨리면 서비스 키 호출과 과금으로 조용히 넘어갈 수 있다.

[VERIFIED: installed SDK types; repo] 세 제공자 SDK에 모델 목록 API가 있으며 기존 저장/피커는 source 없는 `provider:model`이다. 추천 계획 순서는 DB/Vault 트랜잭션 경계와 권한 → 검증/정규화 → 기본값·피커 read model → 설정 UI와 생성 차단 → 실DB/브라우저 보안 검증이다. **Primary recommendation:** 비밀의 등록·조회·삭제를 소수의 서비스 롤 전용 SQL 함수로 묶고, 화면에는 허용된 메타데이터와 교집합 모델 ID만 전달한다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 등록/재확인/삭제 승인 | Frontend Server | Database | Server Action마다 writer 인증·입력 검증; DB가 불변식 집행 [VERIFIED: Next local docs, repo] |
| Vault 암호화·원자성·권한 | Database | Frontend Server | 비밀과 참조 행의 단일 트랜잭션 [ASSUMED: 설계 권고] |
| models-list·오류 분류 | Frontend Server | External provider | 평문이 필요한 유일한 외부 요청 [VERIFIED: D-11] |
| 모델 교집합·기본값 적격성 | Frontend Server | Database | 사용자별 검증 결과와 정적 카탈로그 조합 [VERIFIED: D-04~07] |
| 배지·삭제 다이얼로그·전송 차단 | Browser | Frontend Server | 안전하게 정제된 read model만 사용 [VERIFIED: UI-SPEC] |

## Project Constraints (from CLAUDE.md)

- [VERIFIED: `CLAUDE.md`] 사용자와 한국어로 대화한다.
- [VERIFIED: `CLAUDE.md`, `AGENTS.md`] Next 16.3.2는 동봉 `node_modules/next/dist/docs`의 해당 가이드를 읽는다. 이 연구는 `01-app/02-guides/server-actions.md`, `forms.md`, `data-security.md`를 확인했다. 각 Server Action은 직접 POST 가능하므로 액션 안에서 다시 인증·인가·입력 검증한다.
- [VERIFIED: `AGENTS.md`] 코드 수정 뒤 `graphify update .`; 이 작업은 연구 문서만 작성한다. GSD 외부 AI 호출은 모델 명시·전후 확인이 필요하나 이번 조사에서는 호출하지 않았다.
- [VERIFIED: `CLAUDE.md`] UI 페이즈 완료 시 목업 제공, executor 완료 시 ROADMAP 동기화, 버그는 bug-plan→bug-execute→bug-complete. 이 연구에서 해당 워크플로를 실행하지 않는다.

## Standard Stack

| Component | Installed version | Purpose | Evidence |
|-----------|-------------------|---------|----------|
| Next.js | 16.3.2 | 설정 Server Actions / RSC | [VERIFIED: `package.json`, local Next docs] |
| `@supabase/supabase-js` / Supabase Vault | ^2.112.4 / `supabase_vault` 0.3.1 per locked D-01 | service role RPC, secret storage | [VERIFIED: repo package; user decision for Vault version] |
| `openai` | ^7.23.0 | `models.list()` | [VERIFIED: `package.json`, installed `resources/models.mjs`] |
| `@anthropic-ai/sdk` | ^0.127.0 | `models.list()` | [VERIFIED: package, installed `resources/models.mjs`] |
| `@google/genai` | ^2.19.0 | `models.list()` Pager | [VERIFIED: package, installed `dist/node/node.d.ts`] |
| Zod / Vitest | ^4.4.3 / ^4.1.11 | 입력 검증 / tests | [VERIFIED: `package.json`, `vitest.config.ts`] |

**Installation:** 없음. 기존 설치 SDK를 사용한다. 네트워크 차단 때문에 registry 최신 버전·배포일은 확인하지 않았고 업그레이드를 추천하지 않는다. `slopcheck`/registry 감사는 새 패키지 설치가 없어 해당하지 않는다.

## Architecture Patterns

### Data flow

```text
키 입력 → Server Action 인증/형식 검증 → 고정 제공자 SDK models-list
  ├─ 실패 → 정제 코드/한국어 문구 → 미저장
  └─ 성공 → catalog ∩ 응답 → DB 함수: Vault 비밀 + 참조 행 원자 저장
                               → 공개 메타데이터/모델 ID → 설정·피커
삭제 확인 → Server Action 인증 → DB 함수: 기본값 대체 + Vault 삭제 + 행 삭제
전송 → source=service → 기존 chatAction | source=byok → Phase 10 명시적 차단
```

### Component responsibilities

| Component | Recommendation |
|-----------|----------------|
| `supabase/migrations/0014_*.sql` | `byok_keys` unique `(owner_id,provider)`, constrained provider/status, Vault functions, grants, `profiles.default_key_source` grant [ASSUMED: proposed schema] |
| `lib/ai/providers/byok.ts` | server-only metadata reads, fixed-provider validator dispatch, sanitized actions; no plaintext return [ASSUMED: placement from research architecture] |
| `catalog.ts` + selection helper | strict ID intersection and `provider:model:source` encode/decode [ASSUMED: recommended shape] |
| `settings.ts` | `keySource` default read/write; legacy null means service [ASSUMED: recommended migration] |
| Settings page / `AiPanel` / chapter page / `actions.ts` | source-aware choices and labels, default propagation, Phase 10 BYOK send guard [VERIFIED: current integration points] |

### Vault transaction and permissions

[ASSUMED: exact Vault SQL API/privileges unverified locally] Prefer a service-role-only `SECURITY DEFINER` registration function that calls `vault.create_secret` then inserts the metadata/model IDs in **one SQL transaction**. A SQL exception should roll back both changes; test this on the target project. The delete function should lock the owner's key row, choose replacement, update profile, delete the referenced Vault secret, and delete the key row in one transaction. A unique `(owner_id, provider)` constraint protects concurrent registration. Recheck and delete should lock the same row to serialize status updates with removal. Avoid RPC sequences from Node because they cannot guarantee a shared DB transaction.

[VERIFIED: `0007_admin_operations.sql`] Existing functions explicitly revoke execution from `public, anon, authenticated, service_role`, then grant selected signatures only to `service_role`, with pinned `search_path`. Follow that pattern; schema-qualify `vault` and `public` objects, prevent dynamic SQL, and never grant decrypted-view access to browser roles. [ASSUMED] Confirm actual Vault function signature and whether `DELETE FROM vault.secrets` is permitted to the function owner before migration is finalized. A service-role-only plaintext lookup should take a server-derived owner ID/provider, use the `byok_keys.secret_id` join, and return just the key to server-only code for Phase 11; it must not be exposed in any page/RSC serialization.

### Provider validation and ID matching

| Provider | Installed SDK evidence | Extract / normalize | Confidence |
|----------|------------------------|---------------------|------------|
| OpenAI | `client.models.list()` uses `GET /models` and bearer security; model has `id` | exact `id`; no prefix removal | HIGH (installed SDK) |
| Anthropic | `client.models.list()` uses `GET /v1/models`, auto-pagination; `ModelInfo.id` | exact `id`; no alias guessing | HIGH (installed SDK) |
| Gemini | `ai.models.list()` returns async `Pager<Model>`; `Model.name`, `supportedActions` optional | remove exactly one leading `models/`, then exact catalog ID; if action metadata exists, require generation support | MEDIUM (SDK type; runtime endpoint/values not observed) |

[ASSUMED: recommendation] Use installed SDKs rather than custom header construction; they own vendor authentication/version headers. Set an explicit finite timeout and disable automatic retries for validation so 429 and timeout remain visible. OpenAI/Anthropic `RequestOptions` and Gemini `ListModelsConfig.httpOptions/abortSignal` exist in installed types, but exact option values and abort behavior must be proven in a focused adapter test. Bound pagination to a reasonable page count/response size while ensuring all catalog candidates can be found; incomplete scans must fail closed. A successful empty intersection still records `연결됨` with zero BYOK choices, per UI-SPEC. Never turn an unknown alias into a catalog ID by fuzzy matching.

[ASSUMED: product caveat] A successful list response demonstrates that the key can list models, not necessarily that every listed model will accept a generation request or has billing capacity. The Phase 10 contract deliberately uses this proxy without a charged generation probe. The planner should preserve this caveat and avoid claiming stronger proof in implementation notes.

### Selection encoding and compatibility

[ASSUMED: proposed choice] Keep the existing two profile columns and add `default_key_source text NOT NULL DEFAULT 'service' CHECK (...)`. This preserves existing rows; a null/read failure also falls back to service. Use one shared parser/encoder for `provider:model:service|byok`; accept legacy `provider:model` as `service` for previously rendered clients/tests, then emit only the three-part value. Catalog IDs currently contain no colon [VERIFIED: `catalog.ts`]; validate provider, model, source after parsing. `chatActionSchema` receives source but Phase 10 explicitly rejects `byok` before `createPlatformProvider`/`chat`. A BYOK default read must additionally check current connected key and saved intersection; stale defaults fall back visibly to the defined service choice [ASSUMED: recommendation]. On delete, determine fallback server-side again rather than trusting dialog text.

## Don't Hand-Roll

| Problem | Use instead | Why |
|---------|-------------|-----|
| Encryption at rest | Supabase Vault [VERIFIED: D-01] | Locked decision; no app AES key custody |
| Vendor auth headers/pagination | Installed vendor SDK list methods [VERIFIED: installed SDK] | Fewer provider protocol differences |
| Cross-request key secrecy | Service-role-only RPC + server-only module [ASSUMED: recommendation] | Avoid browser-readable secret paths |
| Select source parsing in three places | One tested encoder/decoder [ASSUMED: recommendation] | Keeps panel, settings, action consistent |

## Common Pitfalls

1. **Orphan secret or dangling default.** [ASSUMED] Separate Vault/RPC/profile calls can partially succeed. Put each mutation in one DB function/transaction; test forced unique-conflict and forced-delete-error rollback.
2. **Grant omission.** [VERIFIED: `0006`, `0013`, `09-VERIFICATION.md`] New `profiles` column is not owner-writable under column grants. Add `grant update (default_key_source) on profiles to authenticated` if the browser client writes it, or keep update in service-role RPC and verify grants deliberately. Test with authenticated user, not admin only.
3. **Secret exposure through SDK errors or action return.** [VERIFIED: `errors.ts`, Next data-security guide] Return only allowlisted status/kind/code; never serialize raw exceptions, FormData, headers, Vault rows or `secret_id` into UI props. Avoid key substrings in logs, test snapshots and URLs.
4. **Misclassified failures.** [VERIFIED: `errors.ts`] Current `toSanitizedProviderError` maps 401/403 to `config`, 429 to `rate_limited`, null/5xx to `unavailable`; UI needs status-specific Korean text and a local malformed-input branch. Recheck 401/403 changes status to failed; 429/5xx/timeout leaves stored status unchanged [VERIFIED: UI-SPEC].
5. **Incomplete model scan or broad aliases.** [ASSUMED] First-page-only lists and fuzzy names can incorrectly hide or expose a model. Test multi-page and `models/` Gemini prefix with exact ID matching; discard off-catalog IDs.
6. **Phase-boundary billing leak.** [VERIFIED: `actions.ts`, UI-SPEC] Existing `chatAction` always creates platform provider. A BYOK selection must be blocked in both UI and action before any generation/debit.
7. **Live privilege illusion.** [VERIFIED: `09-VERIFICATION.md`] Mocks passed while the real profile grant was missing. Require an authenticated writer/browser flow and SQL permission checks before phase sign-off.

## Code Examples

Illustrative design, **not tested against live Vault**:

```sql
-- [ASSUMED] Verify create_secret signature and Vault delete privilege on target DB.
create function public.register_byok_key(p_owner uuid, p_provider text,
  p_plaintext text, p_hint text, p_models text[])
returns void language plpgsql security definer
set search_path = public, vault as $$
declare v_secret uuid;
begin
  -- Lock/unique constraints and server-derived owner are required.
  v_secret := vault.create_secret(p_plaintext);
  insert into public.byok_keys(owner_id, provider, secret_id, masked_hint, model_ids)
  values (p_owner, p_provider, v_secret, p_hint, p_models);
end $$;
-- Revoke PUBLIC/anon/authenticated; grant exact signature to service_role only.
```

```ts
// [ASSUMED: proposed shared codec] Existing two-part values mean service.
type KeySource = 'service' | 'byok';
function decodeSelection(value: string) {
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const [providerId, model, rawSource = 'service'] = parts;
  if (rawSource !== 'service' && rawSource !== 'byok') return null;
  // Also validate provider ID and exact catalog model before returning.
  return { providerId, model, keySource: rawSource as KeySource };
}
```

## State of the Art

[VERIFIED: repository] Phase 9 already uses official vendor SDK adapters and a fixed model catalog; this phase should extend them rather than add a gateway. `.planning/research/STACK.md` previously preferred app-level AES, but D-01 supersedes that recommendation. No current online provider documentation was consulted, so endpoint billing guarantees, current error body shapes, and SDK option semantics beyond installed types remain **ASSUMED**.

## Runtime State Inventory

| Category | Existing state / implication | Action |
|----------|------------------------------|--------|
| Stored data | `profiles.default_provider/default_model` already exists; no source column [VERIFIED: 0013] | Add default source with service migration default; no rewrite of old rows if column default works |
| Live service config | Supabase Vault extension enabled in test project per D-01; privileges not inspected [VERIFIED: user decision / ASSUMED: live state] | Read-only privilege/signature probe before migration |
| OS-registered state | No relevant registration identified in repository [VERIFIED: scoped repo search] | None anticipated |
| Secrets/env vars | Service role env and platform provider keys already used [VERIFIED: `lib/supabase/admin.ts`, `registry.ts`] | Keep browser bundle free of service role and plaintext |
| Build artifacts | Installed SDKs in `node_modules` [VERIFIED: local files] | No package migration |

## Assumptions Log

| # | Claim | Risk if wrong / verification |
|---|-------|-----------------------------|
| A1 | Vault create/delete/decrypted view can be used by a service-role-only definer function with intended privileges | Migration fails or leaks; inspect target DB signatures/ACL, test anon/authenticated denial |
| A2 | SQL exception rolls back Vault secret creation/deletion and metadata in same transaction | Orphan secret; inject failure in integration test and count rows/secrets |
| A3 | Gemini `name` uses `models/` and `supportedActions` identifies generation | Incorrect intersection; fixture/live response inspection |
| A4 | List endpoint is non-billed and its output is adequate proxy for generation availability | Billing/availability promise too strong; verify current provider policy and live account behavior before acceptance |
| A5 | SDK timeout/retry controls have desired effects in these installed versions | Long action or hidden 429; mock transport timeout/retry test |
| A6 | Three-part colon encoding and new profile source column are best compatibility choice | Existing caller misses source; contract tests across settings, chapter props and chat action |
| A7 | Bounded pagination can still discover all catalog models | Valid model hidden; multi-page fixture test |

## Open Questions

1. **Vault SQL contract and privileges:** Inspect `pg_proc`, extension schema, `vault.create_secret`, `vault.decrypted_secrets`, and permitted secret deletion on the target test DB before writing SQL; the repo has no Vault migration or vendored Vault docs. [ASSUMED]
2. **Provider list semantics:** Confirm real responses and whether list visibility means generation entitlement for the exact catalog IDs. The endpoint path/method is evidenced for OpenAI/Anthropic by installed SDK; Gemini network path is not established here. [ASSUMED]
3. **Service model availability:** Current static catalog lists platform models irrespective of service-key account access. PROV-05's “actually callable” wording may require a live service-key availability check or explicit Phase 9 operational gate; the phase decisions only define BYOK intersection. Do not silently claim the static list is entitlement proof. [VERIFIED: `catalog.ts`; ASSUMED: account access]
4. **Rate control:** Public registration/recheck actions call external endpoints. Set a small per-user request bound using existing app patterns if present; no rate-limit implementation was verified in this pass. [ASSUMED]

## Environment Availability

| Dependency | Available | Evidence / planning implication |
|------------|-----------|---------------------------------|
| Node/npm and `node_modules` | Yes | Local binaries and installed SDK files [VERIFIED: local probe] |
| `.env.local` | Exists; contents not inspected | DB-backed test possible in a properly authorized environment [VERIFIED: local probe] |
| `psql` CLI | Not found in command lookup | Use existing `postgres` test/helper or migration script [VERIFIED: local probe] |
| Supabase test DB / provider network | Not probed; network unavailable for this research | Live signatures, billing and UAT remain execution gates [ASSUMED] |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.11, node environment [VERIFIED: package/config] |
| Config file | `vitest.config.ts` (loads env; `server-only` stub) |
| Quick run command | `npm test -- tests/ai/byok-validation.test.ts tests/ai/provider-settings.test.ts tests/ai/ai-panel-model.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test type | Automated command / gate | File exists? |
|--------|----------|-----------|--------------------------|--------------|
| BYOK-01 | 1 key/provider, writer-only, concurrent duplicate rejection | DB integration + action | `npm test -- tests/ai/byok-db.test.ts` | Wave 0 |
| BYOK-02 | 3 list adapters, 401/403/429/timeout, pagination, no write on failure | unit + DB | `npm test -- tests/ai/byok-validation.test.ts` | Wave 0 |
| BYOK-03 | metadata only, no plaintext in response/log, RPC ACL | DB + security | `npm test -- tests/ai/byok-db.test.ts` | Wave 0 |
| BYOK-04 | dialog impact, atomic delete, default replacement, rollback | unit + DB + browser | `npm test -- tests/ai/byok-db.test.ts tests/ai/provider-settings.test.ts` | Partial (settings test) |
| PROV-05 | exact intersection, source choices, legacy decode, failed-key hiding, BYOK send guard | unit + browser | `npm test -- tests/ai/ai-panel-model.test.ts tests/ai/chat-action.test.ts` | Partial; extend existing |

### Sampling Rate

- **Per task commit:** focused affected test file(s), normally under 30 seconds; DB tests only when DB available.
- **Per wave merge:** `npm test` plus `npx tsc --noEmit` and `npm run lint` on changed code.
- **Phase gate:** full suite; test DB migration/privileges/rollback with authenticated, anon and service roles; browser UAT for register/recheck/delete, badges, focus and disabled BYOK send. [VERIFIED: Phase 9 UAT precedent, UI-SPEC]

### Wave 0 Gaps

- [ ] `tests/ai/byok-validation.test.ts`: SDK list fixtures, pagination, timeout/429, exact ID normalization, sanitized failures.
- [ ] `tests/ai/byok-db.test.ts`: actual Vault create/read/delete, ACL, duplicate/rollback, default replacement; use `tests/helpers/db.ts` and isolated users, never print keys.
- [ ] Extend `provider-settings`, `ai-panel-model`, `chat-action` tests for source/legacy/Phase 10 send guard.
- [ ] Define safe DB test preconditions and cleanup; a skipped live DB test is **not** phase verification.

## Security Domain

| ASVS category | Applies | Control / evidence |
|---------------|---------|--------------------|
| V2 Authentication / V3 Session | Yes | Recheck `auth.getUser()` in each Server Action [VERIFIED: Next local guide, settings page pattern] |
| V4 Access Control | Yes | writer ownership, unique provider, service-only RPC; test anon/authenticated denial [ASSUMED: design] |
| V5 Input Validation | Yes | fixed provider enum, key length/shape bounds, exact catalog IDs, Zod [VERIFIED: existing stack] |
| V6 Cryptography | Yes | Supabase Vault only [VERIFIED: D-01] |
| V7 Error/Logging | Yes | allowlisted `ProviderCallError.info`; no raw SDK/Vault exception, key, header or response body [VERIFIED: errors.ts, D-11/12] |

Threats: information disclosure from decrypted SQL view or raw error; elevation through definer execute grants; tampering via client owner/source; denial of service via repeated model listing; integrity loss from partial Vault/metadata deletion. The recommended controls are explicit grants, fixed search path and SQL names, server-derived owner, bounded validation calls, and one-transaction mutations. [ASSUMED: threat analysis grounded in repo boundaries]

## Sources

- [VERIFIED: repository] `10-CONTEXT.md` D-01~13; `10-UI-SPEC.md` interaction/copy; `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`; Phase 9 verification; listed catalog/registry/settings/errors/types/UI/action files; migrations 0006/0013 and 0007 function grant precedent; `scripts/apply-migration.mjs`; `tests/helpers/db.ts`.
- [VERIFIED: installed package sources] `node_modules/openai/resources/models.mjs` and `.d.ts`; `node_modules/@anthropic-ai/sdk/resources/models.mjs` and `.d.ts`; `node_modules/@google/genai/dist/node/node.d.ts` (`Models.list`, `Pager`, `Model.name`, `supportedActions`).
- [VERIFIED: bundled official Next guidance] `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, `forms.md`, `data-security.md` (Server Actions are reachable POSTs; per-action auth/validation and constrained return values).
- [VERIFIED: historical research, superseded where conflicting] `.planning/research/ARCHITECTURE.md`, `FEATURES.md`, `PITFALLS.md`, `STACK.md`; the STACK AES preference yields to D-01 Vault.
- No web, registry or live provider/DB lookup was used. All unverified current provider/Vault claims above are marked `[ASSUMED]`.

## Metadata

**Confidence breakdown:** installed stack and current integration points HIGH; Vault SQL design MEDIUM pending live signature/ACL checks; provider entitlement and current billing semantics LOW; test architecture HIGH for existing harness, MEDIUM for DB availability.  
**Research date:** 2026-09-29  
**Valid until:** 2026-10-06 for external provider semantics; repository observations must be refreshed if code changes.
