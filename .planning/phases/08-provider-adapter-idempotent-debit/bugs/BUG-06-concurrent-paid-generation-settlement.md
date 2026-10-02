---
id: BUG-06
title: 같은 지갑의 유료 AI 생성이 동시에 진행되면 정산 실패로 응답이 사라지고 모델 비용만 발생한다
status: open
severity: medium
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 08 (멱등 차감 설계 08-01·08-03; 공통 로직은 9c4bb87 feat(15-10)에서 lib/ai/paid-generation.ts로 추출됨)
files:
  - lib/ai/paid-generation.ts
  - supabase/migrations/0001_init.sql
---

# BUG-06: 동시 유료 생성의 잔액 스냅샷 경합

## 증상
같은 작가가 AI 생성을 동시에 여러 번 보내면(여러 탭, 재생성 연타, 문서 계획 + 채팅 병행), 잔액이 넉넉하지 않을 때 일부 요청은 모델 호출이 끝난 뒤 정산에서 `insufficient balance`로 거절된다. 사용자는 응답을 받지 못하고(`settlement` 실패 안내), 플랫폼은 이미 모델 비용을 지불한다.

## 재현
1. 잔액을 한 요청 비용 정도로만 남긴다(예: 100).
2. 서로 다른 idempotency key로 `preflightPaidGeneration` → 생성 → `settlePaidGeneration`을 동시에 2회 실행한다.
3. 두 요청 모두 preflight에서 잔액 100을 읽고 통과한다. 먼저 정산된 요청이 잔액을 소진하면 두 번째의 `apply_wallet_delta`가 `insufficient balance`를 던져 `settlement` 실패가 된다.

## 기대 / 실제
- 기대: 동시에 보내도 잔액을 초과하는 생성은 시작되지 않거나(안내 후 거절), 시작된 생성은 반드시 정산된다.
- 실제: preflight(`readBalance`)와 정산(`apply_wallet_delta`) 사이에 잔액 예약이 없다. `debitAmount = min(스냅샷 잔액, 비용)`는 스냅샷 기준이라 다른 요청이 그 사이 차감한 사실을 모른다.

## 원인
- 08-01·08-03 설계가 "추정치로 `maxOutputTokens`만 정하고, 차감은 생성 후 실제 사용량으로" 하는 구조다(D-13). 같은 키의 마지막 잔액 경합은 08-06에서 검증됐지만(이중 차감 없음), **서로 다른 요청**의 동시 실행은 다루지 않았다.
- 이중 차감은 일어나지 않는다(원장 제약). 손실은 "정산되지 않은 모델 호출 비용"과 "응답 유실"이다.

## 수정 방향
**확정(2026-10-02, 사용자 선택 A): 지갑별 직렬화.**
- 같은 작가의 유료 생성은 한 번에 하나만 진행한다. 진행 중에 다른 유료 생성이 들어오면 새 호출을 시작하지 않고 "이미 생성 중이에요" 계열 안내를 반환한다.
- 구현 후보: 지갑 단위 락 행(예: `ai_generation_locks(wallet_id, idempotency_key, expires_at)`)을 preflight에서 원자적으로 획득하고 settle(성공·실패 모두)에서 해제, 비정상 종료 대비 만료 시각(예: 생성 타임아웃 + 여유)을 둔다. 기존 `findGenerationEntry` 멱등 경로와 충돌하지 않게 한다.
- 선차감/예약(B안)과 손실 허용(C안)은 채택하지 않았다.
- Phase 11(BYOK)은 지갑을 우회하므로 BYOK 호출에는 이 락을 적용하지 않는다. Phase 11 11-04/11-05 계획과 겹치는 파일(`lib/ai/paid-generation.ts`)이므로 **실행 순서를 조율**한다(Phase 11 이전에 먼저 고치거나, Phase 11 계획에 락 제외 조건을 명시).
- 새 마이그레이션이 필요하면 다음 빈 번호를 사용한다(번호 정리는 Phase 6 BUG-01 참고).

## 검증
- 독립 연결로 같은 지갑에 유료 생성 2건을 동시에 시작하는 테스트(fake provider)를 추가: 한 건만 진행되고 다른 건은 안내로 거절되며, 잔액이 음수가 되거나 정산 실패가 발생하지 않는지 확인(먼저 실패 확인).
- 락 해제 확인: 성공, 공급자 실패, 정산 실패, 타임아웃 후 재시도 각각에서 다음 생성이 가능한지.
- 서로 다른 작가의 동시 생성은 서로 막지 않는지.
- 기존 `tests/ai/*`(멱등·last-balance race) 회귀 통과.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약
- 확정된 A안대로 **service 유료 생성만 지갑별로 직렬화**한다. 같은 지갑의 점유 중 요청은 공급자 호출 전에 "이미 생성 중" 안내를 받으며, BYOK 경로에는 지갑 락을 적용하지 않는다.
- 기존 원장 조회 → DB의 원자적 lease 획득 → 잔액 조회 순서로 preflight를 바꾸고, 획득 토큰을 수명주기 끝까지 전달한다. settle의 모든 결과와 settle 이전 조기 종료에서 토큰 일치 조건으로 해제한다.
- PostgREST 요청 간 DB 세션이 이어진다는 보장이 없으므로 세션 advisory lock 대신 지갑별 lease 행과 service-role 전용 RPC를 쓴다. 만료된 lease만 원자적으로 회수하며 이전 소유자의 해제는 새 소유자의 lease를 지우지 못하게 한다.
- **확정(2026-10-02, 사용자 선택 A) — 공급자 호출 상한/lease TTL:** 공급자별 취소 가능한 호출 상한을 정하고, lease TTL을 그 상한과 정산 여유보다 길게 설정한다. 호출 중 lease 갱신(B안)은 채택하지 않는다. 상한 수치는 구현 4단계에서 각 SDK의 취소 동작을 확인한 뒤 정하며, 만료 후 이미 발송된 외부 요청의 중복 비용은 절대적으로 배제하지 못한다는 점을 완료 기록에 남긴다.

### 변경 파일 목록

| 파일 | 계획된 변경 |
|---|---|
| `supabase/migrations/0018_ai_generation_locks.sql` (신규) | `wallet_id`를 유일 키로 하는 lease 상태(`owner_token`, `expires_at`)와 원자적 획득·토큰 조건 해제 RPC 추가. 활성 lease를 덮어쓰지 않고 DB 시각으로 만료를 판정한다. 지갑 외래 키, RLS, 직접 접근 제한, `SECURITY DEFINER`의 명시적 `search_path`, RPC의 `REVOKE`/service-role `GRANT`를 포함한다. **Phase 6 BUG-01의 0015 유지, payments→0016, settlement→0017 재번호링이 먼저 완료되어야 한다.** |
| `lib/ai/paid-generation.ts` | 기존 멱등 원장 조회 뒤 lease 획득, 그 뒤 잔액 조회. 점유 중·획득 오류를 구분해 공급자 호출 전 반환하고, 획득 후 preflight 실패도 해제한다. context에 소유 토큰과 한 번만 해제하는 수명주기 함수를 담아 settle의 성공·공급자 실패·권한 거부·원장 재조회·차감 실패 전 경로에서 해제한다. lease 해제 오류는 기록하고 후속 요청이 만료까지 닫힐 수 있음을 처리한다. |
| `lib/ai/chat.ts`, `lib/ai/document-plan.ts`, `lib/ai/document-regenerate.ts` | `chat()`의 언급 조회·계획 분기·프롬프트 구성, 재생성의 프롬프트 구성처럼 settle 전 반환/예외가 가능한 범위를 `finally`로 감싸 lease를 회수한다. 문서 계획의 직접 settle과 채팅 fallthrough에서 중복 해제하지 않도록 같은 context를 전달한다. |
| `lib/ai/chat-result.ts` | 점유 중 안내의 명시적 실패 종류와 한국어 문구를 추가하고, 재생성 결과에도 기존 변환 경로로 전달한다. |
| `lib/ai/providers/types.ts`, `lib/ai/providers/gemini.ts`, `lib/ai/providers/openai.ts`, `lib/ai/providers/anthropic.ts` | 선택한 시간 정책에 맞춰 생성 호출의 취소/시간 상한을 공통 계약과 각 SDK 호출에 적용한다. 타임아웃을 기존 공급자 오류 정규화 경로로 보낸다. SDK별 실제 취소 동작은 구현 시 확인한다. |
| `tests/helpers/fake-ledger-admin.ts`, `tests/ai/paid-generation.test.ts`, `tests/ai/chat-idempotency.test.ts`, `tests/ai/document-plan-generation.test.ts`, `tests/ai/regenerate-document.test.ts` | fake RPC의 lease 상태·오류를 지원하고 점유, 멱등, 조기 종료, 해제, 재시도 회귀를 추가·수정한다. 기존 같은 키 동시 호출의 "두 공급자 호출" 기대는 새 직렬화 정책에 맞춰 갱신한다. |
| `tests/ai/paid-generation-lock.database.test.ts` (신규) | 실제 PostgreSQL의 **독립 연결** 두 개로 원자적 획득·만료 회수·토큰 조건 해제·권한을 검증한다. 앱 수준 fake provider barrier와 결합해 두 요청 중 한 건만 공급자를 호출하는지 확인한다. |
| `tests/ai/provider-gemini.test.ts`, `tests/ai/provider-openai.test.ts`, `tests/ai/provider-anthropic.test.ts` | 선택한 호출 상한의 전달·취소·오류 정규화 회귀를 필요한 범위에서 추가한다. |

### 작업 순서 (TDD)

1. **DB lease 계약 — 1커밋.** 먼저 실패하는 테스트: 신규 DB 테스트에서 독립 연결 두 개의 동시 획득은 하나만 성공하고, 만료 회수 후 구 토큰 해제가 새 lease를 보존하며, 비인가 역할의 RPC 실행이 거부되는 케이스를 작성한다. → 구현: BUG-01 재번호링 완료를 확인한 후 `0018_ai_generation_locks.sql`의 테이블·RPC·권한을 작성한다. → 확인 명령: `npx vitest run tests/ai/paid-generation-lock.database.test.ts --no-file-parallelism` (`SUPABASE_DB_URL`이 있는 테스트 DB에서 실제 실행; 미설정으로 skip되면 통과로 간주하지 않음). 제안 커밋: `fix(ai): add atomic wallet generation lease RPC`.
2. **preflight 점유와 멱등 — 1커밋.** 먼저 실패하는 테스트: 서로 다른 키·같은 지갑의 두 preflight, 같은 키의 진행 중 재요청, 획득 RPC 오류, 잔액 부족 뒤 즉시 재시도를 `paid-generation.test.ts`와 `chat-idempotency.test.ts`에 작성한다. fake provider barrier에서 패자는 호출되지 않아야 한다. → 구현: 원장 조회→획득→잔액 조회, 점유 안내와 token 전달, preflight 실패 해제를 적용한다. → 확인 명령: `npx vitest run tests/ai/paid-generation.test.ts tests/ai/chat-idempotency.test.ts --no-file-parallelism`. 제안 커밋: `fix(ai): acquire wallet lease before paid generation`.
3. **모든 종료 경로의 해제 — 1커밋.** 먼저 실패하는 테스트: 정상·거절·공급자 실패·권한 거부·정산 실패 후 다음 요청, 채팅의 언급 조회 예외와 문서 계획 clarify/fallthrough/오류, 재생성의 settle 전 예외 후 다음 요청을 검증한다. → 구현: settle 내부 결과별 회수와 호출부 `finally`의 멱등 해제를 연결한다. 해제 RPC 실패 시 오류 기록과 TTL 회복을 검증한다. → 확인 명령: `npx vitest run tests/ai/paid-generation.test.ts tests/ai/chat-idempotency.test.ts tests/ai/document-plan-generation.test.ts tests/ai/regenerate-document.test.ts --no-file-parallelism`. 제안 커밋: `fix(ai): release generation lease on every exit path`.
4. **시간 경계 — 1커밋 (정책 A 확정: 호출 상한 + 상한보다 긴 TTL).** 먼저 실패하는 테스트: 선택한 상한에서 공급자 호출이 취소되고 lease가 회수되는지, 만료 후 구 토큰이 새 소유자를 해제하지 못하는지, 요청이 상한을 넘을 때 다음 요청의 동작이 명확한지 검증한다. → 구현: 확정된 A안(호출 상한·상한보다 긴 TTL, 갱신 없음)을 각 공급자와 공통 계약에 적용한다. 단순 `Promise.race`만으로 완료 처리하지 않고 실제 취소 결과를 확인한다. → 확인 명령: `npx vitest run tests/ai/provider-gemini.test.ts tests/ai/provider-openai.test.ts tests/ai/provider-anthropic.test.ts tests/ai/paid-generation.test.ts tests/ai/paid-generation-lock.database.test.ts --no-file-parallelism`. 제안 커밋: `fix(ai): bound provider calls to generation lease lifetime`.
5. **통합 회귀 — 1커밋.** 먼저 실패하는 테스트: 독립 연결을 쓰는 같은 지갑·다른 키의 동시 생성에서 공급자 호출 1회, 패자 점유 안내, 원장 1행·음수 잔액/정산 실패 없음; 다른 지갑은 서로 막지 않음; 첫 완료 후 같은 키는 `already_processed`를 검증한다. → 구현: 테스트에서 드러난 호출 경계와 fake/DB 계약의 누락만 보완하고 Phase 11 service/BYOK 분기를 재확인한다. → 확인 명령: `npx vitest run tests/ai/paid-generation-lock.database.test.ts tests/ai/paid-generation.test.ts tests/ai/chat-idempotency.test.ts tests/ai/document-plan-generation.test.ts tests/ai/regenerate-document.test.ts --no-file-parallelism`, `npx tsc --noEmit`, `npx eslint lib/ai tests/ai/paid-generation-lock.database.test.ts`. 제안 커밋: `test(ai): verify cross-connection paid generation serialization`.

### 테스트 계획

- 새 파일 `tests/ai/paid-generation-lock.database.test.ts`: 별도 PostgreSQL 연결/트랜잭션으로 같은 지갑 동시 획득, 다른 지갑 병행, 활성 lease의 조건부 거절, 만료 회수, 옛 토큰의 해제 거부, RPC 권한을 검사한다. 앱 호출에는 지연 가능한 fake provider를 붙여 **독립 연결** 경합 중 실제 공급자 호출 수와 최종 원장·잔액까지 확인한다. 기존 `tests/admin/concurrency.database.test.ts`의 격리 스키마와 연결 패턴을 참고한다.
- 기존 `tests/ai/paid-generation.test.ts`: preflight의 ledger 우선순위, 점유 안내/획득 오류, 잔액 부족, settle의 모든 terminal 결과 후 해제, 해제 실패를 검사한다.
- 기존 `tests/ai/chat-idempotency.test.ts`: 같은 키 진행 중 재전송은 점유 안내, 정산 후 재전송은 `already_processed`; 다른 키 동시 요청은 한 건만 생성; 마지막 잔액과 refusal/차감 회귀를 검사한다.
- 기존 문서 계획·재생성 테스트: clarify, fallthrough, 분류 오류, 프롬프트 구성 오류, 정상·공급자 오류 뒤 lease 회수와 다음 요청을 확인한다.
- 기존 공급자 테스트: 시간 초과의 취소/정규화가 원시 SDK 오류나 응답 본문을 노출하지 않는지 확인한다. 회귀 명령은 `npx vitest run tests/ai --no-file-parallelism`, `npx tsc --noEmit`; DB 케이스는 `SUPABASE_DB_URL`을 갖춘 환경에서 skip 없이 별도 실행한다.

### 위험과 롤백

- **데이터/배포:** 현재 디렉터리에는 `0015` 세 파일이 공존한다(2026-10-02 확인). BUG-01의 재번호링과 원격 적용 이력 확인 후 0018을 적용한다. 새 테이블은 일시적 lease만 저장하므로 기존 지갑·원장을 재작성하지 않는다. 이미 모델 호출이 진행 중일 때 배포하면 구 버전 요청은 lease를 잡지 않으므로 배포 중 완전 직렬화는 보장되지 않는다. 롤링 배포/진행 요청 종료 시점을 조율한다.
- **TTL/장애:** 너무 짧으면 진행 중 생성과 새 생성이 겹치고, 너무 길면 비정상 종료 후 사용자가 오래 기다린다. DB RPC 또는 해제 실패는 공급자 호출 전에는 닫힌 실패로 처리하고, 획득 뒤 해제 실패는 만료 복구를 관측한다. 공급자 취소 후 실제 외부 과금 여부와 배포 플랫폼의 실행 제한은 **미확인**이다.
- **Phase 11:** 11-04가 `paid-generation.ts`의 route-aware context/settle을, 11-05가 채팅·문서 계획·재생성 진입점을 바꿀 계획이다. 이 수정의 실행 순서를 두 계획과 맞추고, service 유료 분기에만 lease를 유지하며 BYOK에는 적용하지 않는 회귀를 넣는다. 계획 파일 자체의 변경은 이 문서 작업 범위 밖이다.
- **롤백:** 앱 변경은 단계별 커밋을 역순으로 되돌린다. DB는 이미 적용된 0018 파일을 삭제하거나 번호를 재사용하지 않는다. 먼저 앱을 이전 경로로 전환하고 진행 lease의 만료를 기다린 뒤, 별도 후속 마이그레이션으로 RPC/테이블을 제거할지 결정한다. 그동안에는 이번 버그의 원래 경합 위험이 재발한다.

### 완료 조건

- BUG-01 번호 정리 후 0018 적용이 재현되고, 독립 연결 DB 테스트가 **skip 없이** 통과한다.
- 같은 지갑의 service 유료 생성은 점유 기간 공급자 호출이 한 건뿐이며, 패자는 한국어 안내를 받고 원장·잔액이 변하지 않는다. 서로 다른 지갑과 BYOK는 불필요하게 막히지 않는다.
- 성공·거절·공급자 실패·권한 거부·정산 실패·settle 전 종료·타임아웃/만료 각각의 다음 요청이 정의대로 동작하고, 구 토큰이 새 lease를 해제하지 못한다.
- 기존 멱등/마지막 잔액/문서 계획/재생성 회귀, 타입 검사, 관련 lint가 통과하며 Phase 11 중복 수정의 보존 책임이 정리된다. 그 결과와 실제 배포 검증을 버그 문서에 기록한 후 `bug-complete`로 넘긴다.

### 예상 규모

- **5단계·5커밋**, 애플리케이션·SQL·테스트 합계 약 **450~750줄 변경** 예상. 공급자 SDK의 취소 방식과 Phase 11 선행 여부에 따라 달라지는 추정치다.

## 실제 적용 내용 (bug-execute, 2026-10-02)

- `supabase/migrations/0021_ai_generation_locks.sql`: 지갑별 lease 테이블 `ai_generation_locks`(RLS 켬, anon/authenticated 권한 없음)와 service-role 전용 RPC `acquire_ai_generation_lock(wallet, token, ttl)`(DB 시각 기준, 만료된 lease만 회수)·`release_ai_generation_lock(wallet, token)`(토큰 일치 시에만 해제). 번호는 0018(Phase 11)·0019·0020(다른 버그) 다음인 0021.
- `lib/ai/paid-generation.ts`: preflight를 원장 조회 → lease 획득 → 잔액 조회 순으로 변경. 점유 중이면 공급자 호출 전에 `generation_in_progress`("이미 생성 중이에요…")를 반환, 획득 오류는 fail-closed(`unavailable`). ctx에 멱등 `release()`를 담고 settle이 모든 결과(성공·거절·공급자 실패·권한 거부·원장 재조회·차감 실패·예외)에서 해제. 잔액 부족·지갑 없음 등 preflight 조기 종료에서도 해제. `chat()`·`regenerateDocumentWithTemplate`는 settle 전 예외/조기 반환 대비 `finally`에서 추가 해제(문서 계획 분기는 `chat()`의 finally가 커버). 해제 RPC 실패는 로그만 남기고 TTL로 복구.
- 시간 경계(정책 A): `PROVIDER_CALL_TIMEOUT_MS = 120s`를 Gemini(`abortSignal`)·OpenAI·Anthropic(`signal`+`timeout`, `maxRetries: 0`) 호출에 적용, lease TTL = 상한 + 60초(`GENERATION_LEASE_TTL_SECONDS` = 180). 타임아웃은 기존 오류 정규화를 거쳐 `unavailable`이 된다. 갱신(B안) 없음.
- `chat-result.ts`/`chat-request.ts`: `generation_in_progress` 종류와 문구 추가(재시도 가능 알림으로 표시).
- 테스트: `paid-generation-lock.database.test.ts`(독립 연결 동시 획득 1건만 성공, 다른 지갑 병행, 토큰 조건 해제, 만료 회수 후 구 토큰 해제 거부, 권한), `paid-generation.test.ts`·`chat-idempotency.test.ts`·`regenerate-document.test.ts`에 점유·해제·fail-closed 케이스 추가, 기존 "같은 키 동시 2회 호출" 기대를 직렬화 정책에 맞게 갱신, 공급자 테스트에 abort/timeout 인자 반영, fake 원장·sanctions 테스트에 lease RPC 지원 추가.
- 검증: `vitest run tests/ai tests/admin tests/chapters tests/reader --no-file-parallelism` 930 통과(DB 테스트 skip 0), `tsc --noEmit` 통과, `lib/ai`·`tests/ai` eslint 오류 0(기존 경고 2). 0021은 원격 Supabase DB에 적용함.
- 한계(문서화): lease 만료 시점에 이미 발송된 외부 요청의 중복 과금은 완전히 배제하지 못한다. 배포 중 구버전 요청은 lease를 잡지 않으므로 롤링 배포 구간에는 직렬화가 보장되지 않는다. 공급자별 실제 취소 후 과금 여부, 배포 플랫폼 실행 시간 제한은 미확인.
- 계획 대비 차이: 5커밋 대신 1커밋. Phase 11 11-04/11-05는 아직 BYOK 분기를 넣지 않은 상태라 BYOK 제외 회귀 테스트는 해당 phase 구현 시 추가해야 한다(service 분기에만 lease 유지).
