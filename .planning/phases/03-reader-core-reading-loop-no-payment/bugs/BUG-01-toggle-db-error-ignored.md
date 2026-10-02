---
id: BUG-01
title: 좋아요·북마크·구독 토글이 DB 쓰기 오류를 무시하고 성공을 반환한다
status: implemented (브라우저 확인 대기)
severity: medium
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 03 (b5db0eb feat(03-04): implement likes/subscriptions/bookmarks toggle modules)
files:
  - lib/reader/likes.ts
  - lib/reader/bookmarks.ts
  - lib/reader/subscriptions.ts
---

# BUG-01: 토글 DB 쓰기 오류 무시

## 증상
RLS 거부·일시적 DB 오류·FK 위반으로 INSERT/DELETE가 실패해도 `toggleLike`/`toggleBookmark`/`toggleSubscription`은 성공 상태(`liked: true` 등)를 반환한다. UI는 반영된 것처럼 보이다가 새로고침하면 원래 상태로 돌아간다.

## 재현
1. 토글 대상 테이블 쓰기를 실패시킨다(예: 존재하지 않는 `workId`, 또는 쓰기 권한이 없는 상태로 `delete/insert`).
2. 토글 함수를 호출한다.
3. 반환값이 `{ liked: true }`(또는 `false`)이고 오류 정보가 없다.

## 기대 / 실제
- 기대: 쓰기 실패 시 상태를 바꾸지 않고 오류를 호출자에게 알린다.
- 실제: 세 함수 모두 `await supabase.from(...).delete()/insert(...)`의 반환값(`error`)을 읽지 않고 곧바로 낙관적인 상태를 반환한다. 또한 상태 조회(`existing`)의 `error`도 확인하지 않아 조회 실패가 "없음"으로 취급된다.

## 원인
- 03-04 구현이 RESEARCH Pattern 6(select → insert/delete)의 단순 형태를 따랐고 오류 분기를 두지 않았다.
- 정지 계정 차단은 `checkWriteAccess`가 별도로 처리하므로(D-07) 영향받는 것은 그 외 실패 경로다.

## 수정 방향
- 세 함수가 조회·쓰기의 `error`를 확인하고, 실패 시 `{ liked/bookmarked/subscribed: <기존 상태>, error: '...' }` 형태로 반환한다. 반환 타입에 선택적 `error`를 추가하고 호출 액션(`app/.../actions.ts`)과 UI가 이를 사용자 문구로 표시하게 한다.
- BUG-02(경합)와 같은 코드를 건드리므로 함께 수정하는 것을 권장한다. 정책 결정은 필요 없다.

## 검증
- fake client로 insert/delete가 `{ error }`를 돌려줄 때 반환값이 기존 상태 + 오류인지 확인하는 단위 테스트를 세 모듈에 추가(먼저 실패 확인).
- 기존 `tests/reader/*` 회귀 통과 확인.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약
- 기존 수정 방향대로 세 토글의 조회·쓰기 실패를 성공으로 반환하지 않고, 액션의 `ok: false`와 기존 UI 오류 토스트로 전달한다. 조회가 실패해 이전 상태를 알 수 없으면 상태를 추정하지 않고 오류와 함께 상태 필드를 생략한다.
- BUG-02와 같은 세 함수를 건드리므로 함께 고친다. 두 요청이 모두 빈 상태를 읽는 경우 `delete → insert on conflict do nothing`도 두 번 토글을 보장하지 못한다. DB 함수 안에서 같은 작품 행을 잠그고 상태 조회·반전을 한 트랜잭션으로 처리한다.
- 현재의 `checkWriteAccess` 사전 검사를 유지하고, `SECURITY DEFINER` 함수 내부에서도 `auth.uid()`와 `user_can_write`를 확인한다. 로그인 사용자의 기존 순차 토글 결과와 정지 계정 거부를 유지한다.
- 새 마이그레이션은 Phase 6 BUG-01 확정안에 따라 `0018`부터 배정한다. `0015_byok_secret_cleanup` 유지, payments→`0016`, settlement→`0017`이 먼저 정리되어야 한다.

### 변경 파일 목록

| 파일 | 계획된 변경 |
|---|---|
| `supabase/migrations/0018_reader_atomic_toggle.sql` (신규, 번호 가안) | 좋아요·북마크·구독별 토글 RPC를 추가한다. `auth.uid()`/쓰기 권한 검사, 대상 작품 행 `FOR UPDATE` 잠금, 현재 행 조회와 반전, 최종 boolean 반환을 같은 DB 트랜잭션에서 수행한다. `SECURITY DEFINER`의 고정 `search_path`, 스키마 지정, `PUBLIC`/`anon` 실행권 회수와 `authenticated` 실행권 부여를 명시한다. 기존 `0003_reader.sql`은 수정하지 않는다. |
| `lib/reader/likes.ts`, `lib/reader/bookmarks.ts`, `lib/reader/subscriptions.ts` | 조회 응답의 `error`를 확인하고, 성공 시 원자 토글 RPC의 실제 반환값을 사용한다. RPC `error`·빈/잘못된 반환값은 안전한 공통 사용자 문구의 `error`로 반환한다. 쓰기 실패 시 조회로 확인한 기존 상태만 유지하고, 조회 실패 시 상태 필드를 생략하도록 반환 타입을 확장한다. `denied` 경로는 보존한다. |
| `app/works/[workId]/actions.ts` | 세 액션이 라이브러리의 `denied` 또는 `error`를 `ok: false`로 전달하고 실패 시 `revalidatePath`를 호출하지 않게 한다. 성공 응답만 실제 상태를 보낸다. |
| `components/reader/like-button.tsx`, `components/reader/work-header-actions.tsx` | 이미 있는 실패 토스트를 유지하고 실패 시 로컬 상태·좋아요 수를 바꾸지 않는다. 진행 중에는 해당 토글의 중복 클릭을 막도록 pending 상태를 버튼 `disabled`에 연결한다. 헤더의 두 독립 버튼은 각 요청의 진행 상태를 따로 관리한다. |
| `tests/reader/toggle-errors.test.ts` (신규) | 세 토글의 조회 실패, RPC 실패, 잘못된 응답, 기존 상태 보존, 정지 계정 거부를 fake client로 검증한다. |
| `tests/reader/toggle-actions.test.ts` (신규) | 세 액션의 `ok: false`/안전한 오류 문구, 실패 시 재검증 생략, 성공 시 실제 상태 전달을 mock으로 검증한다. |
| `tests/reader/toggle-concurrency-db.test.ts` (신규) | 마이그레이션이 적용된 테스트 DB에서 인증된 동일 사용자·작품에 대한 독립 연결 동시 토글과 권한 거부를 검증한다. `SUPABASE_DB_URL`이 없으면 skip하되 완료 게이트에서는 skip을 인정하지 않는다. |
| 기존 `tests/reader/likes.test.ts`, `bookmarks.test.ts`, `subscriptions.test.ts` | 현재 service-role `adminClient()`로 토글하는 회귀 테스트를 인증된 사용자 호출 방식으로 맞추고 순차 on→off→on, 상태·카운트 단언을 유지한다. 서비스 롤에 RPC 실행권을 추가해 인증 검사를 우회하지 않는다. |

### 작업 순서 (TDD; 단계마다 커밋 1개)

1. **DB 원자 토글** — 먼저 실패하는 테스트: `toggle-concurrency-db.test.ts`에 같은 `(work_id,user_id)`의 두 호출을 별도 DB 연결에서 동시에 시작해 각 응답과 최종 행 수가 두 번의 반전을 나타내는지 단언한다. 빈 상태에서 두 호출 뒤 0행, 기존 1행에서 두 호출 뒤 1행을 확인하고, 다른 사용자·작품과의 격리 및 무인증/정지 계정 거부를 추가한다. 마이그레이션 전에는 함수 부재로 실패해야 한다. → 구현: `0018_reader_atomic_toggle.sql`을 가안으로 세 RPC를 추가하되, 생성 직전에 `0018` 이상 첫 미사용 번호를 확정한다. 같은 작품 행 잠금 후 조회·삭제/삽입한다. 테스트 fixture는 연결 간 보이도록 커밋하고 `finally`에서 정리한다. Commerce의 `max: 1` 트랜잭션 격리 패턴을 그대로 복사하지 않는다. → 확인 명령: `npx vitest run tests/reader/toggle-concurrency-db.test.ts --no-file-parallelism --reporter=verbose` (skip 0 확인), `npx tsc --noEmit`. → 커밋 제안: `fix(reader): add atomic database toggles`.
2. **라이브러리 오류·상태 반환** — 먼저 실패하는 테스트: `toggle-errors.test.ts`에서 각 함수의 조회 오류, 알려진 off/on 상태에서 RPC 오류, 잘못된 RPC 응답, `denied` 우선 처리, 성공 시 RPC boolean 사용을 단언한다. 기존 세 회귀 파일은 인증 클라이언트로 전환한 뒤 순차 토글을 확인한다. → 구현: 세 모듈이 조회 오류를 성공으로 취급하지 않고, 사전 권한 검사 후 RPC 결과를 해석하도록 변경한다. 실패 시 DB 원문을 UI로 흘리지 않는다. → 확인 명령: `npx vitest run tests/reader/toggle-errors.test.ts tests/reader/likes.test.ts tests/reader/bookmarks.test.ts tests/reader/subscriptions.test.ts --no-file-parallelism`, `npx tsc --noEmit`. → 커밋 제안: `fix(reader): propagate toggle database failures`.
3. **액션·UI 실패 전달** — 먼저 실패하는 테스트: `toggle-actions.test.ts`에서 세 액션의 DB 오류가 `ok: false`가 되고 `revalidatePath`를 호출하지 않는지, 성공은 실제 상태만 보내는지 단언한다. UI 검증은 실패 후 좋아요 수/상태 유지와 진행 중 재클릭 방지를 컴포넌트 테스트 또는 수동 브라우저 확인으로 기록한다. → 구현: 액션의 오류 분기를 추가하고 버튼별 pending 비활성화를 연결한다. → 확인 명령: `npx vitest run tests/reader --no-file-parallelism`, `npx tsc --noEmit`, `npx eslint 'app/works/[workId]/actions.ts' components/reader/like-button.tsx components/reader/work-header-actions.tsx lib/reader/likes.ts lib/reader/bookmarks.ts lib/reader/subscriptions.ts`. → 커밋 제안: `fix(reader): show toggle failures without changing UI state`.

### 테스트 계획

- 새 `tests/reader/toggle-errors.test.ts`: 3종 토글 각각 조회 오류, 쓰기/RPC 오류, 응답 형식 오류, 알려진 기존 상태 보존, 알 수 없는 상태 미추정, `denied` 회귀.
- 새 `tests/reader/toggle-actions.test.ts`: 3종 액션 각각 인증 실패, `denied`, DB 오류, 성공, 실패 시 `revalidatePath` 미호출.
- 새 `tests/reader/toggle-concurrency-db.test.ts`: **독립 연결 2개 이상**에서 같은 대상 동시 on/on 및 off/off 요청을 실행해 반환 상태 집합과 최종 행 수를 함께 검증한다. 같은 작품의 다른 사용자와 다른 작품의 동일 사용자도 검증한다. 단일 연결 풀·공유 미커밋 트랜잭션은 동시성 증거로 인정하지 않는다. 환경 변수가 없어 skip되면 완료로 보지 않는다.
- 기존 회귀: `npx vitest run tests/reader --no-file-parallelism`; DB 환경에서는 `--reporter=verbose`로 새 동시성 테스트 skip 0을 확인한다. 타입 및 변경 파일 lint는 위 단계 명령으로 확인한다.

### 위험과 롤백

- **데이터/동작:** 기존 3개 테이블과 데이터는 바꾸지 않는다. 작품 행 잠금은 같은 작품의 서로 다른 사용자 토글도 직렬화해 인기 작품의 지연을 늘릴 수 있다. 부하·잠금 대기 시간은 배포 전 확인이 필요하다. RPC에서 권한 검사를 빠뜨리면 `SECURITY DEFINER`가 RLS를 우회하므로 사용자 ID 인자를 받지 않고 `auth.uid()`만 사용하며, 무인증·정지 계정 거부와 타 사용자 행 불변 테스트를 배포 게이트로 둔다.
- **배포 순서:** Phase 6 BUG-01의 번호 정리가 선행되어야 한다. 현재 저장소에는 `0015` 세 파일이 공존하고, Phase 11의 `11-01-PLAN.md`는 `0016_ai_usage.sql`을 지정한다(2026-10-02 코드/문서 대조). Phase 2의 회차 경합 버그 계획도 신규 `0018` 이상 번호를 예상하므로 실제 파일 생성 직전에 두 작업과 Phase 11의 번호를 조율하고 `0018`이 이미 사용됐다면 다음 미사용 번호를 쓴다. 번호 충돌이 해소되기 전에는 마이그레이션을 적용하지 않는다. 원격 DB의 실제 적용 상태와 Phase 11 실행 여부는 **미확인**이다.
- **롤백:** 배포 전에는 각 단계 커밋을 역순으로 revert한다. 배포 후에는 먼저 앱 변경을 되돌려 기존 경로를 복구하고, 새 RPC가 더 이상 호출되지 않음을 확인한 뒤 별도 상위 번호의 마이그레이션으로 권한을 회수하고 함수를 제거한다. 이미 적용된 마이그레이션 파일을 삭제하거나 번호를 재사용하지 않는다. DB 함수만 먼저 제거하면 배포 중 앱 호출이 실패한다.

### 완료 조건

- 세 토글 모두 조회 실패와 쓰기 실패를 성공으로 반환하지 않고, 액션은 오류를 `ok: false`로 전달하며 UI는 실패 시 상태·좋아요 수를 유지하고 사용자 문구를 표시한다.
- 인증·정지 계정 권한 및 순차 토글 회귀가 통과하고, 독립 연결 동시 토글에서 각 응답과 최종 DB 상태가 일치한다. DB 테스트는 skip 0, TypeScript와 변경 파일 lint는 통과한다.
- 마이그레이션 번호가 Phase 6 확정안과 일치하고 Phase 11 번호 충돌이 해소되며, 테스트 DB·배포 대상 DB의 적용 여부를 기록한다. 검증 증거와 단계별 커밋이 준비되면 `bug-complete`로 넘긴다.

### 예상 규모

3개 커밋 단계. 마이그레이션·코드·테스트 합계 약 300~500줄 변경 예상(실제 규모는 RPC/DB fixture 구현 후 확인).

## 실제 적용 내용 (bug-execute, 2026-10-02)

BUG-02와 같은 변경 단위로 구현·커밋됨(`5a7cd57`). 상세는 BUG-02 문서의 "실제 적용 내용" 참고.

- 조회·RPC 오류, 예외, 비정상 payload는 성공으로 반환하지 않고 안전한 문구의 `error`로 반환한다. 상태를 알 수 없으면 상태 필드를 생략한다(`lib/reader/toggle.ts`). 정지 계정 `denied` 경로와 사전 검사는 유지.
- 액션은 `error`/상태 미확정 시 `ok: false`, `revalidatePath` 미호출. 기존 UI 실패 토스트가 그대로 문구를 표시하고 실패 시 상태·좋아요 수는 바뀌지 않는다.
- 테스트: `toggle-errors.test.ts`(조회 실패·RPC 오류·예외·비정상 payload·denied), `toggle-actions.test.ts`, 동시성 DB 테스트. `vitest run tests/reader tests/admin/sanctions.test.ts` 127 통과, `tsc` 통과.
- 계획 대비 차이: 3단계 커밋 대신 BUG-02와 합쳐 1커밋. 마이그레이션은 0019(0018은 Phase 11 예정). UI 브라우저 수동 확인은 미수행.
