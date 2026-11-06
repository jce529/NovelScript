---
phase: 19-studio-workid-ui
plan: 02
requirements-completed: [WORKHOME-01, WORKHOME-02, WORKHOME-03, WORKHOME-05, WORKHOME-06, WORKHOME-07]
key-files:
  - app/studio/[workId]/page.tsx
  - components/studio/work-home-content.tsx
  - tests/works/work-home-page.test.ts
  - tests/world-tree/entrypoints.test.ts
status: implemented-verification-pending
---

# 19-02 실행 요약

## 변경 내용

- 작품 소유권을 `getWork(ownerId)`로 확인한 뒤에만 회차, 작품 설정 문서, 심사 상태를 조회한다. 접근할 수 없는 작품은 일반적인 없음 화면과 작품 목록 링크만 보여 준다.
- 회차와 설정 문서만 19-01의 투영 함수에 전달해 제목, 선택적 시놉시스, 3칸 현황, 4단계 가이드, 작업 화면 4개 카드를 서버에서 렌더한다. 가이드 진행 중 카드는 기본 닫힌 `details`에 두고, 완료 후 가이드를 없애고 카드를 펼쳐 보여 준다.
- 기존 심사 패널은 블라인드 상태 또는 열린 요청이 있는 경우에만 홈 맨 위에 유지한다. 심사 조회 실패는 홈 렌더링에 영향을 주지 않는다.
- 모바일 집필 탭 폭에서 현황을 2+1로, 카드를 세로 목록으로 배치했다. 단계 버튼의 터치 높이, 진행 막대 접근성 속성, 완료 음성 안내와 포커스 표시를 추가했다. 하단 탭과 트리 구조는 수정하지 않았다.
- 소유권 조회 순서, 빈 상태, 단계 진행, 완료 화면, 링크, 심사 패널 조건을 검사하는 회귀 테스트를 추가하고 기존 엔트리 테스트를 새 홈에 맞췄다.

## 검증

- `npm test -- tests/works/work-home-page.test.ts tests/world-tree/entrypoints.test.ts`: Vitest 설정 로드 중 Windows 샌드박스의 `spawn EPERM`으로 시작 실패. 계획 지시에 따라 재시도하지 않았다. 테스트 실행 결과는 오케스트레이터의 샌드박스 외부 재검증이 필요하다.
- `npx tsc --noEmit`: 통과, 오류 출력 없음.
- `npm run lint`: 실패. 저장소 전체 검사에 포함된 `.claude/worktrees`의 생성 파일 등 작업 범위 밖에서 1,896개 오류와 34,914개 경고가 나왔다.
- `npx eslint --max-warnings=0 'app/studio/[workId]/page.tsx' components/studio/work-home-content.tsx tests/works/work-home-page.test.ts tests/world-tree/entrypoints.test.ts`: 통과, 출력 없음.
- 수정한 추적 파일의 `git diff --check`: 통과. 줄바꿈 정규화 안내만 출력됐다.

## 계획 이탈 및 미결 항목

- `/world`에는 설정 문서 생성 UI가 없어 개정 2와 계획에 따라 2단계 버튼을 `세계관 보기`로 표시했다.
- 사용자 지시가 19-02 지정 파일과 이 요약 파일만 수정하도록 제한하므로, 다른 파일을 바꾸는 `graphify update .` 및 요구사항 연결 스크립트는 실행하지 않았다. 오케스트레이터가 병렬 계획을 합친 뒤 수행할 수 있다.
- 커밋과 상태/로드맵 갱신은 사용자 지시에 따라 오케스트레이터에 맡긴다.

## 오케스트레이터 재검증 (2026-11-01)

샌드박스 밖에서 관련 테스트 통과, `npx tsc --noEmit`·eslint 오류 없음. sonnet diff 리뷰 blocker 0건. 리뷰 warning 중 단계 `aria-current`와 접힘 문구 토글은 반영했다. `getWorkKbNodes`가 DB 오류 시 빈 배열을 돌려줘 2단계가 미완료로 보일 수 있는 점은 범위 밖 기존 동작이라 남겼다. 엔트리 테스트의 가지 치기 카드 문구 단언은 UI-SPEC 문구("이 세계관에서 새 작품")로 고쳤다.
