---
id: BUG-04
title: 관리자가 자기 자신을 제재하면 일반 검증 문구만 표시된다 (F-2)
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 브라우저 UAT 후속 todo (2026-09-17-phase-07-deferred-browser-checks.md)
origin_phase: 07
files:
  - lib/admin/actions.ts
---

# BUG-04: 자기 제재 시 안내 문구 부정확

## 증상
관리자가 자기 작품/계정에 경고·정지를 시도하면 서버는 올바르게 막지만, 화면에는 "입력 내용을 확인해 주세요."만 뜬다.

## 재현
관리자 계정으로 자기 작품의 신고에 경고/정지를 건다.

## 기대 / 실제
- 기대: "자기 자신은 제재할 수 없어요" 계열의 전용 문구.
- 실제: `self_sanction_forbidden`이 `validation_failed`로 매핑되어(`lib/admin/actions.ts` 약 107행) 일반 문구가 표시된다.

## 원인
오류 코드 매핑 표에서 `self_sanction_forbidden`을 전용 코드 없이 `validation_failed`에 합쳤다.

## 수정 방향
- 전용 결과 코드(예: `self_sanction_forbidden`)를 두고 UI 문구를 추가한다. 정책 결정 불필요(서버 차단은 의도된 설계).

## 검증
- `self_sanction_forbidden`이 전용 코드로 매핑되는 단위 테스트, 해당 문구가 UI에 표시되는 컴포넌트 테스트 또는 수동 브라우저 확인.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 기존 수정 방향대로 DB의 자기 제재 차단을 유지하고, `self_sanction_forbidden`을 관리자 액션의 전용 결과 코드로 전달한다. 새 정책 결정은 필요하지 않다.
- `AdminErrorCode` 타입, RPC 오류 매핑, 폼의 `describeFailure()` 문구를 함께 바꾼다. 사용자 문구는 기존 기대에 맞춰 `자기 자신은 제재할 수 없어요.`로 둔다.
- 먼저 코드 전달 테스트를 실패시키고 고친 다음, 안내 문구 렌더링 테스트를 실패시키고 고친다. 성공 경로와 다른 검증 오류의 동작도 회귀 확인한다.
- 이 수정은 애플리케이션 코드와 테스트만 대상으로 한다. 신규 마이그레이션이 필요해지는 별도 작업은 Phase 6 BUG-01의 확정 번호(`0015` 유지, 결제 `0016`, 정산 `0017`, 신규 `0018`부터)를 따라야 한다.

### 변경 파일 목록

| 파일 | 예정 변경 |
|---|---|
| `lib/admin/types.ts` | `AdminErrorCode` 유니언에 `'self_sanction_forbidden'`을 추가한다. `AdminResult`는 이 타입을 그대로 사용한다. |
| `lib/admin/actions.ts` | `RPC_ERRORS`의 `self_sanction_forbidden` 항목을 전용 코드로 바꾼다. 원본 DB 메시지를 반환하는 새 경로는 만들지 않는다. |
| `components/admin/moderation-form.tsx` | `describeFailure()`에 전용 문구 분기를 추가한다. 안내 문구 테스트가 실제 `role="alert"` 출력까지 검증할 수 있도록 필요한 최소한의 함수 내보내기를 한다. |
| `tests/admin/moderation.test.ts` | 기존 DB 오류 매핑 표의 자기 제재 기대값을 전용 코드로 바꾸고, 다른 `validation_failed` 매핑은 유지한다. |
| `tests/admin/action-boundary.test.ts` | Server Action 경계에서 전용 코드가 변형 없이 반환되고, 실패 시 재검증이 호출되지 않으며, 원본 오류 문구가 결과에 노출되지 않는 케이스를 추가한다. |
| `tests/admin/moderation-form-message.test.ts` (신규) | 전용 코드가 안내 문구와 `role="alert"`로 표시되고, 일반 검증 실패는 기존 문구를 유지하는지 확인한다. |

### 작업 순서 (TDD)

1. **서버 오류 코드 전달 — 커밋 제안: `fix(admin): preserve self sanction error code`**
   - 먼저 실패하는 테스트: `tests/admin/moderation.test.ts`의 `self_sanction_forbidden` 기대 코드를 바꾸고, `tests/admin/action-boundary.test.ts`의 RPC 실패 표에 같은 오류를 추가한다. `npx vitest run tests/admin/moderation.test.ts tests/admin/action-boundary.test.ts`에서 새 기대값이 현재 `validation_failed` 때문에 실패하는지 확인한다.
   - 구현: `lib/admin/types.ts`에 전용 코드를 추가하고 `lib/admin/actions.ts`의 매핑 한 항목을 변경한다. DB 함수와 Server Action의 성공 경로는 건드리지 않는다.
   - 확인 명령: `npx vitest run tests/admin/moderation.test.ts tests/admin/action-boundary.test.ts`; `npx tsc --noEmit`. 두 테스트가 통과하고 기존 `report_target_mismatch` 등 일반 검증 오류가 그대로인지 확인한 뒤 한 커밋으로 묶는다.
2. **폼 안내 문구 — 커밋 제안: `fix(admin): explain blocked self sanction in form`**
   - 먼저 실패하는 테스트: `tests/admin/moderation-form-message.test.ts`를 만들고 전용 실패 결과를 `describeFailure()`에 넣어 `StatusMessage`를 정적 렌더링했을 때 `role="alert"`와 `자기 자신은 제재할 수 없어요.`가 나타나는지 확인한다. 현재 전용 분기가 없어 이 기대가 실패해야 한다. `validation_failed`는 기존 일반 문구를 기대한다.
   - 구현: `components/admin/moderation-form.tsx`의 `describeFailure()`에 전용 분기를 넣고 테스트에 필요한 함수만 내보낸다. `useCommand()`의 기존 상태 표시 경로를 그대로 이용한다.
   - 확인 명령: `npx vitest run tests/admin/moderation-form-message.test.ts tests/admin/moderation.test.ts tests/admin/action-boundary.test.ts`; `npx eslint components/admin/moderation-form.tsx lib/admin/types.ts lib/admin/actions.ts tests/admin/moderation-form-message.test.ts tests/admin/moderation.test.ts tests/admin/action-boundary.test.ts`; `npx tsc --noEmit`. 실제 브라우저에서 관리자가 자기 작품 신고에 경고 또는 정지를 시도해 안내 문구가 표시되는지도 확인한다.

### 테스트 계획

- 신규 `tests/admin/moderation-form-message.test.ts`: 전용 코드의 안내 문구와 `role="alert"` 출력, `validation_failed`의 기존 일반 문구, 다른 오류 코드의 기존 기본 문구를 검증한다. 현재 Vitest는 `tests/**/*.test.ts`를 Node 환경에서 실행하고, 저장소의 다른 UI 테스트는 `renderToStaticMarkup`을 사용한다. 폼의 비동기 제출과 브라우저 상호작용은 별도 수동 확인 대상으로 둔다.
- 기존 회귀 명령: `npx vitest run tests/admin/moderation.test.ts tests/admin/action-boundary.test.ts tests/admin/sanctions.test.ts`; DB 연결이 준비된 격리 테스트 환경에서는 `npx vitest run tests/admin/operations.database.test.ts tests/admin/sanctions.database.test.ts`로 기존 자기 제재 차단을 확인한다. DB 테스트가 환경 변수 부재로 건너뛰어지면 차단 규칙의 재검증으로 계산하지 않는다.
- 수동 브라우저 확인: 관리자 자신의 작품 신고에서 경고와 기간 또는 영구 정지를 각각 시도하고 전용 문구가 보이는지, 성공 알림과 대상 상태 변경이 없는지 확인한다. 다른 사람의 작품에 대한 정상 조치와 일반 입력 오류도 확인한다. 재현용 계정·신고 준비 가능 여부와 실제 브라우저 결과는 현재 **미확인**이다.
- 이 버그는 오류 코드와 UI 문구 전달 문제이며 DB 동시성 문제가 아니다. 독립 DB 연결을 이용한 동시 실행 케이스는 이 버그의 완료 기준에 포함하지 않는다.

### 위험과 롤백

- **데이터·배포:** DB 스키마와 저장 데이터는 변경하지 않는다. 배포 시 타입, 서버 매핑, 클라이언트 문구가 함께 반영되어야 한다. 구버전 클라이언트가 새 코드를 받으면 기본 문구를 표시할 수 있으므로 배포 후 브라우저 경로를 확인한다. 배포 방식과 구버전 클라이언트 공존 기간은 **미확인**이다.
- **다른 phase:** Phase 11 계획은 `0016_ai_usage.sql`을 언급하지만 Phase 6 BUG-01의 확정안은 신규 번호를 `0018`부터 사용하도록 한다. 이 버그는 SQL을 만들지 않으므로 직접 충돌하지 않는다. Phase 11 실행 전 해당 번호 조율은 BUG-01의 작업으로 남긴다.
- **롤백:** 배포 전에는 두 구현 커밋을 역순으로 되돌린다. 배포 후에도 같은 코드 변경을 되돌려 기존 일반 문구 동작으로 복귀할 수 있으며 데이터 복구나 역마이그레이션은 필요하지 않다. 실제 배포 및 롤백 절차는 **미확인**이다.

### 완료 조건

- 자기 제재 RPC 오류가 `AdminResult`에서 전용 코드로 유지되고, 원본 DB 오류 메시지는 클라이언트 결과에 포함되지 않는다. 일반 검증 오류와 권한·충돌 오류의 기존 코드가 유지된다.
- 관리자 자기 작품 신고에 경고·정지를 시도했을 때 전용 문구가 화면의 오류 알림으로 보이고, DB의 자기 제재 차단이 유지된다.
- 신규 UI 문구 테스트, 관리자 액션 단위·경계 회귀, 타입 검사와 해당 파일 린트가 통과한다. DB 통합 테스트와 수동 브라우저 확인의 실행 결과 또는 환경상 미실행 사유를 기록한 뒤 `bug-complete`로 넘긴다.

### 예상 규모

- 구현 약 5~15줄, 기존 테스트 수정·추가 약 5~15줄, 신규 UI 문구 테스트 약 25~50줄로 예상한다. DB·마이그레이션 변경은 0줄이다.
- 작업 2단계, 단계당 커밋 1개. 브라우저 확인에 필요한 테스트 데이터 준비 시간은 **미확인**이다.
