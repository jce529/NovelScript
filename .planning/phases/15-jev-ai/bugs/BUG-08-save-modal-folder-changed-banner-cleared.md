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

## 원인 확정 (2026-10-09, 리서치 gpt-6-luna + 브라우저 로그 추적)
- 리서치(Codex `gpt-6-luna`, medium, read-only): Base UI `Select`는 제어 값/항목 목록 변경만으로 `onValueChange`를 부르지 않는다고 소스(`SelectRoot.js:256-262, 310-315, 405-436`)로 정리했고, 호출 주체는 실행 중 추적으로 확인하라고 제안했다.
- 임시 로그(`setBanner` 호출 스택, 두 `Select`의 `onValueChange` 값/`reason`)로 race를 재현한 결과:
  1. 사용자가 폴더 선택 → `onValueChange` `reason: "item-press"` (정상)
  2. 저장 → `doSave` 시작부 `setBanner(null)` → `folder_changed` 분기 → `setBanner("저장 위치가 변경되었어요…")` → 목록 재조회(`refreshed ok`)
  3. **목록/선택값 갱신 직후 폴더 `Select`의 `onValueChange`가 다시 호출됨: `reason: "none"`, `value`가 방금 설정한 `selectedFolderId`와 동일**, 호출 경로는 `SelectRoot.setValue` → 우리 콜백의 `setBanner(null)`. 이것이 배너를 지운다.
- 즉 Base UI가 프로그램으로 값이 바뀐 뒤 같은 값으로 한 번 더 콜백을 호출하고, 우리 핸들러가 값이 바뀌었는지 확인하지 않고 무조건 배너를 지웠다.

## 적용한 수정 (2026-10-09, `/bug-execute`)
- `lib/kb/select-change.ts`(신규) `isSelectionChange(next, current)`: 값이 달라졌을 때만 선택 변경으로 본다.
- `SaveDocumentPlanModal.tsx`: 폴더·템플릿 `Select`의 `onValueChange` 첫머리에서 같은 값이면 즉시 반환(배너·`regenerated` 상태를 건드리지 않음). 사용자의 실제 선택은 값이 달라서 그대로 처리된다. 템플릿 `Select`는 같은 증상이 관찰되지는 않았지만 같은 패턴이라 함께 방어했다.
- `eventDetails.reason`으로 구분하는 안은 쓰지 않았다(닫힌 상태 타이핑 탐색도 `none`이고 값이 바뀌므로 `reason`만으로는 구분이 안 됨).
- 테스트: `tests/kb/select-change.test.ts`. 모달 자체의 `Select`·`useEffect` 상호작용은 기존 SSR 목 테스트로 재현할 수 없어 브라우저로 검증했다.
- 검증: `tsc --noEmit`·eslint 클린, `select-change`·`save-document-plan-modal` 테스트 7건 통과. 브라우저(같은 race 재현): 배너 "저장 위치가 변경되었어요. 다시 선택해주세요."가 폴더가 `인물 (최상위)`로 재설정된 뒤에도 유지됨, 사용자가 폴더를 직접 `조연`으로 바꾸면 배너가 지워짐.
