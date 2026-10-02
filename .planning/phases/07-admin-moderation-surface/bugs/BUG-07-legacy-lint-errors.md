---
id: BUG-07
title: Phase 7 이전 파일에 기존 lint 오류가 누적되어 있다
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 검증 (todo 기록: "기존 lint 오류 23건")
origin_phase: 07 (기록 시점 기준; 대상 파일은 Phase 7 이전 코드)
files:
  - app/studio/[workId]/chapters/[chapterId]/actions.ts
  - components/reader/like-button.tsx
  - components/reader/report-dialog.tsx
  - components/reader/work-header-actions.tsx
  - lib/ai/providers/byok-validate.ts
  - lib/ai/providers/byok.ts
---

# BUG-07: 기존 lint 오류

## 증상
`npm run lint`에 Phase 7 이전 파일 기준으로 23건의 오류가 있다고 기록돼 있다. 변경 파일만 lint하는 방식으로 우회 중이라 신규 회귀를 구분하기 어렵다.

## 재현
`npm run lint` 실행. (2026-09-17 기록 수치이며 이후 Phase 8~15 변경으로 달라졌을 수 있다.)

**2026-10-02 재측정:** `npm run lint`는 종료 코드 0, 오류 0건·경고 7건이다. Phase 7 당시 `23 errors and 6 warnings`는 `07-07-SUMMARY.md`의 역사적 기록이며 현재 오류는 재현되지 않는다. 경고는 `@typescript-eslint/no-unused-vars` 4건(위 `actions.ts` 2건, 두 BYOK 파일 각 1건)과 `@next/next/no-location-assign-relative-destination` 3건(위 독자 컴포넌트 각 1건)이다.

## 기대 / 실제
- 기대: 전체 lint 0건, CI 게이트로 사용 가능.
- 실제: 기존 오류가 있어 전체 lint를 게이트로 쓰지 못한다.

**2026-10-02 재측정:** 현재 오류는 0건이지만 경고 7건이 남고, `package.json`의 `lint`는 단순 `eslint`라 경고가 있어도 성공한다.

## 원인
초기 phase에서 lint 규칙을 전체에 적용하지 않고 진행했다. 정확한 파일·규칙 분포는 재측정 전에는 알 수 없다.

## 수정 방향
- 먼저 `npm run lint`로 현재 오류를 재측정해 이 문서에 파일·규칙별로 기록한다.
- 기계적으로 고칠 수 있는 것은 수정하고, 의도적 예외는 규칙 단위로 문서화한다. 정책 결정 불필요(단 규칙 비활성화가 필요하면 사용자 확인).

## 검증
- `npm run lint` 0건, `npx tsc --noEmit`·관련 테스트 회귀 통과.

## 수정 계획 (gpt-6-sol, 2026-10-02)

### 접근 요약

- 2026-10-02 재측정 결과 오류 0건·경고 7건이다. 과거 오류 23건을 다시 고치는 작업으로 간주하지 않고, 현재 남은 경고를 0건으로 만든다.
- 확정된 방향대로 미사용 선언은 제거하고, 독자 화면의 로그인 이동은 설치된 Next.js 16.3.2 문서가 안내하는 Client Component 이벤트 핸들러의 `useRouter().push('/login')`로 바꾼다. 규칙 비활성화나 예외 추가는 계획하지 않는다.
- 마지막에 `lint` 스크립트를 `eslint --max-warnings=0`으로 바꿔 전체 lint가 새 경고에도 실패하도록 한다. 경고별 명령을 먼저 실패시키고 각 커밋에서 녹색으로 만든다.
- 이 버그에는 SQL·데이터 변경이 없다. Phase 6 BUG-01의 확정 번호(`0015` 유지, payments `0016`, settlement `0017`, 신규 `0018`부터)는 그대로 따른다.

### 변경 파일 목록

| 파일 | 예정 변경 |
|---|---|
| `app/studio/[workId]/chapters/[chapterId]/actions.ts` | 사용하지 않는 `ModelTier` 타입 import와 `FOLDER_COPY_FALLBACK` 상수만 제거한다. |
| `lib/ai/providers/byok-validate.ts` | `anthropicModels`에서 사용하지 않는 `signal` 구조 분해를 제거한다. 모델 조회·타임아웃 동작은 유지한다. |
| `lib/ai/providers/byok.ts` | 사용하지 않는 `ByokFailureReason` 타입 import를 제거한다. |
| `components/reader/like-button.tsx` | 비로그인 좋아요의 토스트 로그인 동작에서 `window.location.href = '/login'`을 `useRouter().push('/login')`로 교체한다. |
| `components/reader/report-dialog.tsx` | 비로그인 신고 진입의 같은 이동을 교체한다. |
| `components/reader/work-header-actions.tsx` | 비로그인 구독·북마크 공통 로그인 동작의 같은 이동을 교체한다. |
| `package.json` | `lint` 스크립트에 `--max-warnings=0`을 추가한다. 잠금 파일 변경은 예상하지 않는다. |

### 작업 순서 (TDD)

1. **미사용 선언 4건 — 커밋 제안: `fix(lint): remove unused studio and byok declarations`**
   - 먼저 실패하는 테스트: `npx eslint 'app/studio/[workId]/chapters/[chapterId]/actions.ts' 'lib/ai/providers/byok-validate.ts' 'lib/ai/providers/byok.ts' --max-warnings=0`이 현재 경고 4건으로 실패하는 것을 확인한다.
   - 구현: 위 세 파일의 미사용 import·상수·구조 분해만 정리한다. `anthropicModels`는 호출자가 넘기는 두 번째 인자를 사용하지 않아도 기존 `ListModelIds` 호출 형태와 맞는지 타입 검사한다.
   - 확인 명령: 같은 `npx eslint ... --max-warnings=0`; `npx vitest run tests/ai/byok-validation.test.ts tests/ai/byok-actions.test.ts tests/ai/chat-action.test.ts`; `npx tsc --noEmit`; `git diff --check`.
2. **독자 로그인 이동 3건과 lint 게이트 — 커밋 제안: `fix(lint): use router navigation and fail on warnings`**
   - 먼저 실패하는 테스트: `npx eslint components/reader/like-button.tsx components/reader/report-dialog.tsx components/reader/work-header-actions.tsx --max-warnings=0`이 현재 경고 3건으로 실패하는 것을 확인한다. 1단계 완료 후 전체 `npm run lint -- --max-warnings=0`도 남은 경고 3건 때문에 실패하는 기준선을 기록한다.
   - 구현: 세 Client Component에서 `useRouter`를 `next/navigation`에서 가져오고 컴포넌트 내부에서 얻은 `router.push('/login')`을 기존 토스트 콜백에 연결한다. 토스트 문구와 비로그인 가드는 유지한다. 이후 `package.json`의 lint 스크립트에 `--max-warnings=0`을 붙인다.
   - 확인 명령: 같은 파일별 `npx eslint ... --max-warnings=0`; `npm run lint`; `npx tsc --noEmit`; `npx vitest run tests/reader tests/ai/byok-validation.test.ts tests/ai/byok-actions.test.ts tests/ai/chat-action.test.ts`; `git diff --check`. 독자 DB 테스트는 DB 환경을 갖춘 격리 환경에서 실행·skip 수를 기록한다.

### 테스트 계획

- **신규 테스트 파일: 없음.** 실패 재현은 ESLint의 `--max-warnings=0`을 사용한다. 각 케이스는 미사용 항목 4건과 상대 경로 `window.location.href` 3건이며, 정적 규칙이 실제 문제를 직접 검출한다. 동작을 그대로 두는 import·상수 제거에 구현을 되풀이하는 단위 테스트는 추가하지 않는다.
- 기존 회귀: `npx vitest run tests/ai/byok-validation.test.ts tests/ai/byok-actions.test.ts tests/ai/chat-action.test.ts`로 BYOK 검증·등록 및 studio action을 확인한다. `npx vitest run tests/reader`는 독자 데이터 동작을 확인하며, DB 환경이 없거나 건너뛴 케이스는 통과로 계산하지 않는다.
- 브라우저 확인: 비로그인 상태에서 좋아요, 신고, 구독, 북마크를 각각 누르고 기존 토스트의 로그인 버튼이 `/login`으로 이동하는지 확인한다. `useRouter().push`는 전체 페이지 새로고침 대신 클라이언트 이동이므로 이 UX 차이도 확인한다.
- 최종 게이트는 `npm run lint`의 오류 0건·경고 0건·종료 코드 0, `npx tsc --noEmit`, 위 관련 회귀의 통과다. 이 버그는 동시성 버그가 아니므로 독립 DB 연결로 재현할 경쟁 조건은 없다.

### 위험과 롤백

- **동작:** `window.location.href`에서 `router.push`로 바뀌면 로그인 이동이 전체 새로고침에서 클라이언트 이동으로 바뀐다. 세 화면의 비로그인 토스트 동작을 브라우저에서 확인한다. 로그인 후 돌아가기나 검색 파라미터를 보존하는 동작은 현재 코드에 없으며 이 버그에서 새로 정의하지 않는다.
- **데이터·배포:** SQL·마이그레이션·데이터 수정은 없다. lint 스크립트를 엄격하게 만들면 이후 새 경고가 빌드·CI 명령을 실패시킬 수 있다. 현재 저장소에서 별도 CI 워크플로 존재는 확인되지 않았으므로 CI 연결 상태는 **미확인**이다.
- **다른 phase:** 두 BYOK 파일은 Phase 11 작업 영역과 겹친다. 실행 전 최신 변경을 확인하고 Phase 11의 동시 편집과 충돌하면 미사용 선언 제거만 재적용한다. Phase 11의 `0016_ai_usage.sql` 계획은 Phase 6 BUG-01에서 확정한 `0018`부터의 번호 조율 대상으로, 여기서 마이그레이션 파일이나 계획을 고치지 않는다.
- **롤백:** 배포 전후 모두 두 커밋을 역순으로 되돌려 이전 코드와 lint 스크립트로 복구한다. DB 롤백은 필요 없다. 롤백하면 경고 7건과 경고 허용 게이트가 되살아난다.

### 완료 조건

- 전체 `npm run lint`가 오류·경고 모두 0건으로 종료되고, 재실행해도 같은 결과다. 규칙 비활성화나 파일 무시는 추가되지 않는다.
- `npx tsc --noEmit`와 BYOK·studio·reader 관련 회귀가 통과하며 DB 테스트의 실행·skip 수가 기록된다. 네 비로그인 진입점의 `/login` 이동이 브라우저에서 확인된다.
- 위 검증과 두 커밋의 변경 범위를 기록한 뒤 `bug-complete`로 넘긴다. Phase 6의 마이그레이션 번호 확정안 및 Phase 11 계획 충돌은 별도 BUG-01에서 관리한다.

### 예상 규모

- 구현 변경 약 20~35줄(삭제·추가 합계), 신규 테스트 파일 0개, 마이그레이션 0개. 실제 차이는 실행 시점의 Phase 11 편집 상태에 따라 달라질 수 있다.
- 작업 2단계·커밋 2개, 추가 브라우저 확인 1회. Phase 11과 동시 편집 충돌 해결 소요는 **미확인**이다.
