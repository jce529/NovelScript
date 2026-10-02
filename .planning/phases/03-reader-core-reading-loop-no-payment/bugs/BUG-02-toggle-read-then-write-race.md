---
id: BUG-02
title: 토글이 읽기 후 쓰기라서 빠른 연속 클릭 시 한 번만 반영될 수 있다
status: implemented (브라우저 확인 대기)
severity: low
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 03 (b5db0eb feat(03-04): implement likes/subscriptions/bookmarks toggle modules)
files:
  - lib/reader/likes.ts
  - lib/reader/bookmarks.ts
  - lib/reader/subscriptions.ts
  - supabase/migrations/0003_reader.sql
---

# BUG-02: 토글 읽기→쓰기 경합

## 증상
같은 사용자가 같은 작품에 대해 토글을 거의 동시에 두 번 보내면(더블클릭, 느린 응답 중 재클릭, 두 탭), 두 요청이 같은 현재 상태를 읽고 같은 동작을 수행한다. 두 번 토글했는데 결과가 "켜짐"으로 남을 수 있다.

## 재현
1. 현재 상태가 "없음"인 작품에 대해 `toggleLike`를 `Promise.all`로 2회 호출한다.
2. 두 호출이 모두 `existing = null`을 읽고 둘 다 INSERT를 시도한다.
3. 한 INSERT는 성공하고 다른 INSERT는 PK `(work_id, user_id)` 위반으로 실패한다. BUG-01 때문에 실패가 무시되어 두 호출 모두 `liked: true`를 반환한다.

## 기대 / 실제
- 기대: 두 번 토글하면 최종 상태가 원래대로(없음)이다. 또는 최소한 반환값이 실제 DB 상태와 일치한다.
- 실제: 최종 상태는 "있음"이고 두 응답 모두 `liked: true`다. 데이터 중복은 PK가 막으므로 오염은 없고 UX 불일치만 발생한다.

## 원인
- select → insert/delete가 별도 요청이며 트랜잭션·락·조건부 쓰기가 없다.
- 테이블 PK는 있으나(0003_reader.sql) 실패를 처리하지 않아 경합이 은폐된다.

## 수정 방향
- 상태 전환을 DB에서 원자적으로 처리한다. **2026-10-02 재측정:** 별도 요청의 `delete ... returning` 뒤 `insert ... on conflict do nothing`만으로는 두 요청이 모두 빈 상태를 본 경우 두 번의 반전을 보장하지 못한다. 단일 RPC에서 같은 대상의 상태 조회·반전을 직렬화하고 최종 반환값을 실제 쓰기 결과에서 도출한다.
- 클라이언트 쪽에서도 요청 중 버튼 비활성화(중복 클릭 방지)를 함께 적용하면 체감 문제는 대부분 사라진다.
- BUG-01과 같은 변경 단위로 처리한다. 정책 결정은 필요 없다.

## 검증
- 독립 호출 2회 동시 실행 후 최종 DB 행 수와 반환값이 일치하는지 확인하는 DB 테스트를 추가(먼저 실패 확인).
- 순차 토글 on→off→on 회귀 통과 확인.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 확정된 DB 원자 토글 방향을 따른다. 좋아요·북마크·구독별 RPC에서 `auth.uid()`와 쓰기 가능 여부를 확인하고, 같은 작품 행을 `FOR UPDATE`로 잠근 뒤 상태를 읽고 반전한 결과를 반환한다.
- 현재 세 라이브러리 함수는 읽기·쓰기 오류를 무시한다. Phase 3 BUG-01과 같은 변경 단위로 RPC 오류 및 응답 형식 오류를 액션의 `ok: false`와 기존 UI 실패 토스트에 연결한다.
- 진행 중 버튼 비활성화는 한 화면의 중복 클릭을 줄인다. 두 탭·독립 요청의 정확성은 DB RPC와 독립 연결 테스트로 보장한다.
- 신규 마이그레이션은 Phase 6 BUG-01 확정안(`0015` BYOK 유지, payments→`0016`, settlement→`0017`)을 선행 적용한 뒤 `0018`부터 미사용 번호를 배정한다. Phase 11의 예정 번호와 생성 직전에 조율한다.

### 변경 파일 목록

| 파일 | 예정 변경 |
|---|---|
| `supabase/migrations/0018_reader_atomic_toggle.sql` (신규, 번호 가안) | 기존 `0003_reader.sql`은 그대로 두고 세 토글 RPC를 추가한다. 사용자 ID 인자를 받지 않고 `auth.uid()`와 `user_can_write(auth.uid())`를 확인한다. 작품 행 잠금 후 해당 사용자 행을 반전하며 실제 boolean을 반환한다. `SECURITY DEFINER`의 고정 `search_path`, 함수 안의 권한 검증, `PUBLIC`/`anon` 실행권 회수와 `authenticated` 실행권 부여를 명시한다. |
| `lib/reader/likes.ts`, `lib/reader/bookmarks.ts`, `lib/reader/subscriptions.ts` | 기존 읽기→쓰기 경로를 RPC 호출로 교체한다. `checkWriteAccess` 거부 동작을 유지하고, 조회·RPC 오류와 비정상 반환값을 성공으로 처리하지 않는다. 성공 상태는 RPC가 반환한 값만 사용한다. Phase 3 BUG-01의 오류 반환 계약과 함께 조율한다. |
| `app/works/[workId]/actions.ts` | 세 액션이 라이브러리 오류를 `ok: false`로 전달하고, 성공한 토글에만 `revalidatePath`를 호출한다. |
| `components/reader/like-button.tsx`, `components/reader/work-header-actions.tsx` | 기존 오류 토스트와 실패 시 상태 유지 동작을 살린다. 좋아요·구독·북마크 버튼 각각의 진행 상태로 해당 버튼을 비활성화한다. |
| `tests/reader/toggle-concurrency-db.test.ts` (신규) | 격리된 테스트 DB에서 별도 연결 두 개 이상으로 같은 사용자·작품의 동시 토글, 응답 순서와 최종 행 수, 인증·정지 계정 거부를 검증한다. |
| `tests/reader/toggle-errors.test.ts`, `tests/reader/toggle-actions.test.ts` (신규) | Phase 3 BUG-01과 공유하는 읽기·RPC 오류 및 액션 실패 전달 회귀를 추가한다. |
| `tests/reader/likes.test.ts`, `tests/reader/bookmarks.test.ts`, `tests/reader/subscriptions.test.ts` | 현재 `adminClient()`로 호출하는 순차 회귀를 인증 사용자 경로로 맞추고 on→off→on 및 상태·좋아요 수 단언을 보강한다. |

### 작업 순서 (TDD)

1. **DB 원자 토글 — 커밋 제안: `fix(reader): add atomic database toggles`**
   - 먼저 실패하는 테스트: `tests/reader/toggle-concurrency-db.test.ts`에서 인증된 같은 사용자의 같은 작품에 빈 상태 2회와 기존 행 상태 2회를 별도 연결로 동시 호출한다. 반환값 집합은 각각 `{true, false}`이고 최종 행 수는 각각 0과 1이어야 한다. RPC 생성 전 함수 부재로 실패함을 확인한다. 무인증·정지 계정·다른 사용자 행 불변도 검증한다.
   - 구현: 새 번호의 SQL에 세 RPC를 작성한다. 작품 행 잠금, `auth.uid()`와 `user_can_write` 검사, 상태 조회·반전을 한 트랜잭션에 둔다. 두 연결에서 보이는 커밋된 fixture를 사용하고 `finally`에서 정리한다. `tests/commerce/database.test.ts`의 단일 연결(`max: 1`)·미커밋 fixture 패턴은 동시성 재현에 복사하지 않는다.
   - 확인 명령: `npx vitest run tests/reader/toggle-concurrency-db.test.ts --no-file-parallelism --reporter=verbose`; `npx tsc --noEmit`. DB 테스트의 skip이 0인지 확인한다.
2. **라이브러리 반환 계약 — 커밋 제안: `fix(reader): use atomic toggle results and report failures`**
   - 먼저 실패하는 테스트: `tests/reader/toggle-errors.test.ts`에 세 함수별 읽기 오류, RPC 오류·비정상 응답, 사전 권한 거부, 성공 시 DB boolean 사용을 추가한다. 기존 순차 테스트에 on→off→on을 추가해 현재 경로와 인증 RPC 전환 후 결과를 확인한다.
   - 구현: 세 함수의 별도 SELECT/INSERT/DELETE 쓰기를 RPC로 바꾸고, Phase 3 BUG-01의 오류 계약에 맞춰 실패를 전파한다. 상태를 확인할 수 없는 오류에서는 값을 추정하지 않고 DB 원문을 사용자에게 노출하지 않는다.
   - 확인 명령: `npx vitest run tests/reader/toggle-errors.test.ts tests/reader/likes.test.ts tests/reader/bookmarks.test.ts tests/reader/subscriptions.test.ts --no-file-parallelism`; `npx tsc --noEmit`.
3. **액션·UI 연결 — 커밋 제안: `fix(reader): handle toggle failures and pending clicks`**
   - 먼저 실패하는 테스트: `tests/reader/toggle-actions.test.ts`에 세 액션의 오류 시 `ok: false` 및 재검증 미호출, 성공 시 RPC 상태 전달을 단언한다. UI는 버튼별 진행 중 재클릭 및 실패 시 상태·좋아요 수 유지를 브라우저에서 먼저 재현해 기록한다.
   - 구현: 액션 오류 분기를 연결하고 각 버튼의 pending 상태를 비활성화에 연결한다. 실패 시 로컬 상태나 좋아요 수를 바꾸지 않는다.
   - 확인 명령: `npx vitest run tests/reader --no-file-parallelism`; `npx tsc --noEmit`; `npx eslint 'app/works/[workId]/actions.ts' components/reader/like-button.tsx components/reader/work-header-actions.tsx lib/reader/likes.ts lib/reader/bookmarks.ts lib/reader/subscriptions.ts`.

### 테스트 계획

- 신규 `tests/reader/toggle-concurrency-db.test.ts`: **독립 DB 연결 2개 이상**에서 같은 `(work_id,user_id)`의 2회 동시 토글을 빈 상태와 기존 행 상태에서 각각 실행한다. 응답의 `true`/`false` 집합, 최종 행 수, 좋아요·북마크·구독별 권한을 확인한다. 다른 사용자·작품의 행은 바뀌지 않아야 한다. `SUPABASE_DB_URL` 부재로 skip되면 완료로 세지 않는다.
- 신규 `tests/reader/toggle-errors.test.ts`: 세 함수의 조회 오류, RPC 오류, 비정상 응답, 권한 거부, 실제 DB 상태 반환을 검증한다. 신규 `tests/reader/toggle-actions.test.ts`: 세 액션의 인증 거부·DB 오류·성공 및 실패 시 `revalidatePath` 미호출을 검증한다.
- 기존 회귀 명령: `npx vitest run tests/reader --no-file-parallelism`. DB 환경에서는 `--reporter=verbose`로 동시성 케이스 skip 0을 확인한다. `npx tsc --noEmit`과 변경 파일 lint를 수행한다. UI 수동 확인은 단일 버튼 빠른 재클릭, 별도 탭의 같은 토글, 실패 토스트 및 좋아요 수 유지로 기록한다.

### 위험과 롤백

- **데이터·권한:** 기존 세 테이블의 행과 `0003_reader.sql`은 변경하지 않는다. `SECURITY DEFINER`는 RLS를 우회하므로 사용자 ID를 인자로 신뢰하지 않고 함수 내부에서 로그인·`user_can_write`를 검사해야 한다. 작품 행 잠금은 같은 작품의 서로 다른 사용자 토글도 직렬화하므로 인기 작품의 대기 시간은 배포 전 측정이 필요하다. 실제 부하 영향은 **미확인**이다.
- **배포·번호:** 현재 디렉터리에는 `0015`가 세 개 있고, Phase 11의 `11-01-PLAN.md`는 아직 `0016_ai_usage.sql`을 예정한다(2026-10-02 확인). Phase 6 BUG-01의 재번호링과 Phase 11 계획 조율이 먼저 필요하며, 이 버그의 신규 파일은 생성 직전 `0018` 이상 첫 미사용 번호로 확정한다. 대상 DB의 적용 이력·Phase 11 실행 여부는 **미확인**이다. 신규 RPC 적용 후 앱 경로를 배포한다.
- **다른 phase·롤백:** Phase 3 BUG-01과 라이브러리·액션·테스트를 공유하므로 같은 구현 커밋에서 계약을 맞춘다. Phase 2 회차 경합 계획도 신규 마이그레이션을 요구하므로 번호를 예약한 것으로 가정하지 않는다. 배포 전에는 위 커밋을 역순으로 되돌린다. 배포 후에는 앱을 먼저 기존 호출 경로로 되돌리고, RPC 미사용을 확인한 뒤 새 상위 번호 마이그레이션으로 함수 권한 회수·제거를 검토한다. 이미 적용한 SQL 파일을 삭제하거나 번호를 재사용하지 않는다.

### 완료 조건

- 세 토글의 순차 on→off→on과 **독립 연결 동시 2회**가 각각 기대 행 수·반환값을 만족한다. 조회·RPC 오류는 성공으로 보이지 않고, 무인증·정지 계정·타 사용자 접근이 거부된다.
- 액션은 실패를 `ok: false`로 전달하며 UI는 실패 시 상태·좋아요 수를 유지하고 진행 중 같은 버튼의 중복 클릭을 막는다. `tests/reader`의 DB 테스트 skip 0, 타입 검사, 변경 파일 lint, UI 확인 결과를 기록한다.
- Phase 6 확정 마이그레이션 번호와 Phase 11 조율이 반영되고, 대상 DB의 적용 상태 및 배포 순서가 확인된다. Phase 3 BUG-01과 공유한 변경의 검증·단계별 커밋 근거가 준비되면 `bug-complete`로 넘긴다.

### 예상 규모

- 구현 시 3개 커밋 단계, SQL·코드·테스트 합계 약 300~500줄 변경 예상(Phase 3 BUG-01과 공유하는 변경 포함). RPC·DB fixture의 실제 줄 수와 DB 배포 소요는 **미확인**이다.

## 실제 적용 내용 (bug-execute, 2026-10-02)

- `supabase/migrations/0019_reader_atomic_toggle.sql`: `toggle_work_likes/bookmarks/subscriptions(p_work_id)` RPC. 사용자는 `auth.uid()`에서만 얻고 `user_can_write` 검사, `anon`/`public` 실행권 회수·`authenticated`만 부여. **계획과 달리 작품 행 `FOR UPDATE` 대신 (테이블, 작품, 사용자) 단위 `pg_advisory_xact_lock`으로 직렬화**했다(같은 작품의 다른 사용자끼리 대기하지 않도록; 계획의 "인기 작품 대기 시간" 위험 제거). 번호는 0018이 Phase 11 `ai_usage`용으로 조율돼 있어 0019를 사용했다.
- `lib/reader/toggle.ts`(신규 공통) + `likes/bookmarks/subscriptions.ts`: RPC 호출로 교체. 반환 상태는 RPC boolean만 사용, RPC 오류·예외·비정상 payload는 `error`(DB 원문 미노출)로 반환하고 상태는 추정하지 않음. 정지 계정 사전 검사(D-07)와 DB `write_access_denied`는 `denied`로 유지. (Phase 3 BUG-01의 오류 반환 계약도 이 변경으로 함께 구현됨 — `/bug-complete` 때 BUG-01도 같이 검토.)
- `actions.ts`: `error`/상태 미확정이면 `ok: false`, `revalidatePath`는 성공 시에만. `like-button.tsx`, `work-header-actions.tsx`: 버튼별 `useTransition` pending으로 비활성화·재클릭 무시.
- 테스트: `toggle-concurrency-db.test.ts`(독립 연결 동시 2회 빈/기존 상태, on→off→on, 타 사용자 불변, 무인증·영구정지 거부; 3 테이블×4), `toggle-errors.test.ts`, `toggle-actions.test.ts`, 기존 likes/bookmarks/subscriptions 테스트를 인증 세션(`signedInClient`) 경로 + on→off→on으로 갱신.
- 검증: `vitest run tests/reader tests/admin/sanctions.test.ts` 127 통과(DB 테스트 skip 0), `tsc --noEmit` 통과, 변경 파일 eslint 오류 0(기존 경고 2). 0019는 원격 Supabase DB(SUPABASE_DB_URL)에 적용함.
- 미수행: UI 브라우저 수동 확인(로그인 세션 필요), 인기 작품 부하 측정. 롤백: 앱 커밋 revert 후 RPC 미사용 확인 → 새 번호 마이그레이션으로 함수 drop.
