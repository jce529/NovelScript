---
id: BUG-02
title: "@멘션 자동완성에서 Enter가 선택 대신 줄바꿈"
status: open
severity: medium
found: 2026-09-18
found_during: 08-09 체크포인트 (Chrome)
origin_phase: 04
phase8_regression: false
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/MentionAutocomplete.tsx
---

# BUG-02: @멘션 자동완성에서 Enter가 선택 대신 줄바꿈

## 증상

원고 편집기에서 `@오수`를 입력하면 자동완성 목록에 `오수진 / 인물`이 뜬다. 여기서 **Enter**를 누르면 멘션이 선택되지 않고 원고에 줄바꿈이 들어간다. 마우스로 클릭해야만 선택된다.

## 재현

1. 챕터 편집기 원고 textarea에 `비가 그친 뒤 @오수`를 입력한다.
2. 자동완성 목록(`role=option` "오수진")이 뜬 것을 확인한다.
3. Enter를 누른다.

## 기대 / 실제

- **기대:** 첫 번째 후보가 선택되어 `@오수` 트리거가 지워지고, "멘션된 문서"에 오수진이 추가된다.
- **실제:** textarea 값이 `"비가 그친 뒤 @오수\n"`이 되고 멘션 목록은 그대로다. "멘션된 문서"도 비어 있다.

## 원인 (추정)

`MentionAutocomplete`는 cmdk `Command`(`shouldFilter={false}`)를 Popover 안에 렌더한다. 그런데 포커스는 계속 원고 textarea에 있다. cmdk의 키보드 탐색(↑/↓/Enter)은 `Command` 루트가 포커스를 가졌을 때만 동작하므로, Enter는 textarea의 기본 동작(줄바꿈)으로 처리된다.

textarea의 `onKeyDown`에서 목록이 열려 있을 때 ↑/↓/Enter/Escape를 가로채 cmdk에 넘기는 연결이 없는 것으로 보인다. 수정 전에 코드로 확인해야 한다.

## 수정 방향

- 목록이 열려 있는 동안 textarea `onKeyDown`에서 ↑/↓로 강조 항목을 옮기고, Enter/Tab이면 `preventDefault()` 후 강조된 후보를 선택하고, Escape면 목록을 닫는다.
- 방법은 두 가지 중 하나를 고른다.
  - cmdk의 `value`/`onValueChange`를 제어 모드로 쓴다.
  - 자체 `activeIndex` 상태를 둔다.
- 한국어 IME 조합 중(`e.nativeEvent.isComposing`)의 Enter는 무시해야 한다. 그렇지 않으면 조합 확정 Enter가 선택으로 처리된다.

## 검증

- 키 처리 로직을 순수 함수로 분리해 단위 테스트한다.
- 브라우저에서 위 재현 절차로 Enter 선택, ↑/↓ 이동, Escape 닫기를 확인하고, 한글 조합 중 Enter가 선택되지 않는지도 확인한다.

## 비고

같은 파일에 기존 eslint 오류(`react-hooks/set-state-in-effect`)가 있다(deferred-items.md). 함께 정리하면 좋다.
