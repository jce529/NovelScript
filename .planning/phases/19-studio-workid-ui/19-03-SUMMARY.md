---
phase: 19-studio-workid-ui
plan: 19-03
requirements-completed: [WORKHOME-04, WORKHOME-05, WORKHOME-07]
key-files:
  - app/studio/[workId]/layout.tsx
  - lib/kb/sidebar-sections.ts
  - tests/studio/sidebar-empty-copy.test.ts
  - tests/studio/sidebar-tree.test.ts
status: complete
---

## 변경 내용

- 회차 루트가 비었을 때 기존의 `첫 회차를 써볼까요?` 텍스트 링크를 클릭 불가 안내문 `아직 회차가 없어요`로 교체했다. 회차 루트의 `KbTreeActions` 새 회차 만들기 진입점은 그대로 유지했다.
- 설정 그룹은 `sections.myFolders`의 모든 깊이를 순회해 실제 설정 문서가 없을 때만 `아직 설정 문서가 없어요`를 표시한다. 판정은 19-01의 `isSettingDocument`를 재사용하며 템플릿·회차 파일과 빈 폴더는 문서로 세지 않는다.
- 트리 순서, 작품/계정 분리, 드래그 공급자, 기존 폴더 생성 버튼과 모바일 셸이 유지되는지 확인하는 테스트 기대값을 갱신하고, 빈 상태 판정의 단위 테스트를 추가했다.

## 검증 결과

- `npm test -- tests/studio/sidebar-empty-copy.test.ts tests/studio/sidebar-tree.test.ts tests/studio/mobile-workspace-wiring.test.ts`: 실패. 테스트 실행 전 Vitest/Vite 설정 로딩 과정에서 Windows 샌드박스의 `spawn EPERM`이 발생했다. 계획의 환경 예외에 따라 재시도하지 않았다.
- `npx tsc --noEmit`: 통과 (출력 없음, 종료 코드 0).
- 변경한 TS/TSX 파일의 TypeScript 파싱: 통과.
- `graphify update .`: Windows 접근 거부(`WinError 5`)로 재구축하지 못했다. 이어서 `scripts/graph-link-requirements.py`를 실행했으며 종료 코드 0이었다.

## 편차

- 자동 테스트의 실패는 코드·테스트 실행 전의 샌드박스 프로세스 생성 제한으로 확인되어, 계획 지침에 따라 TypeScript 검사와 소스 검토로 대체했다.

## 열린 항목

- 오케스트레이터가 샌드박스 밖에서 지정된 Vitest 3개 파일을 다시 실행해야 한다.
- Graphify 갱신은 Windows 접근 권한이 있는 환경에서 다시 실행해야 한다.

## 오케스트레이터 재검증 (2026-11-01)

샌드박스 밖에서 관련 테스트 통과, `npx tsc --noEmit`·eslint 오류 없음. diff 확인 결과 트리 구조 변경 없이 빈 문구만 추가됐다.
