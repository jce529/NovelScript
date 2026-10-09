---
id: BUG-08
title: 저장 모달에서 폴더 이동/삭제 race 시 "저장 위치가 변경되었어요" 배너가 곧바로 사라짐
status: open
severity: low
found: 2026-10-09
found_during: Phase 15 15-09 Task 2 브라우저 UAT (시나리오 6, 이동/삭제 race)
origin_phase: 15 (SaveDocumentPlanModal, 15-09)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
  - lib/kb/folder-copy.ts
---

# BUG-08: folder_changed 배너가 사라짐

## 증상
모달에서 폴더를 고른 뒤 다른 탭에서 그 폴더를 삭제하고 "이 위치에 저장하기"를 누르면, 저장은 막히고 폴더 선택이 최상위로 재충전되지만 안내 배너("저장 위치가 변경되었어요. 다시 선택해주세요.")가 잠깐 보였다가 사라진다. 사용자는 선택한 폴더가 왜 바뀌었는지 알 수 없다.

## 재현
1. 채팅으로 인물 문서 제안 → "문서로 저장하기".
2. 모달에서 방금 만든 빈 폴더(`임시`)를 저장 폴더로 선택.
3. 다른 탭에서 그 폴더를 삭제.
4. 첫 탭에서 "이 위치에 저장하기".
5. DOM 변화를 기록하면 `role=alert` 배너가 나타난 직후 사라지고 폴더 표시가 "인물 (최상위)"로 바뀐다(2회 재현).

## 기대 / 실제
기대: 배너가 남아 사용자가 다시 선택하도록 안내한다(UI-SPEC: "모달 유지, 폴더 선택 최상위로 재충전" + 배너). 실제: 폴더만 조용히 최상위로 바뀐다. 문서 미생성·모달 유지는 정상이다.

## 원인
미확정(가설). `doSave`가 `folder_changed`에서 `setBanner(FOLDER_COPY.folder_changed)` 후 `loadSavePlanAction`으로 목록을 새로 받아 `setSelectedFolderId`를 갱신하는데, 이 갱신과 같은 시점에 `setBanner(null)`을 호출하는 경로가 실행되는 것으로 보인다. 후보는 폴더 `Select`의 `onValueChange`(`SaveDocumentPlanModal.tsx` 약 235-241행, 여기서 `setBanner(null)` 호출)가 제어 값 변경이나 목록 교체 시 불리는 경우. Base UI `SelectRoot`는 숨은 input autofill 경로에서 `setValue`를 호출하는 코드가 있어 확정하려면 실행 중 추적이 필요하다.

## 수정 방향
(정책 결정 없음) 먼저 `setBanner(null)`을 호출하는 주체를 실행 중 추적(핸들러에 임시 로그)으로 확정한다. 이후 사용자 조작(`onValueChange`로 값이 실제로 바뀐 경우)에서만 배너를 지우고, 프로그램이 값을 갱신할 때는 지우지 않게 한다(예: 같은 값이면 무시, 또는 배너 설정을 목록 갱신 이후로 이동). 회귀 방지로 폴더 변경 실패 시 배너가 유지되는지 확인하는 테스트를 추가한다.

## 검증
- 위 재현 절차에서 배너가 남는다(브라우저).
- 사용자가 직접 폴더/템플릿을 바꿀 때는 이전 배너가 지워진다.
- `tests/`에 SaveDocumentPlanModal 상태 전이 테스트(또는 순수 함수로 분리한 reducer 테스트) 추가, tsc·eslint.
