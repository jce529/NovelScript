---
id: BUG-02
title: "@멘션 자동완성에서 Enter가 선택 대신 줄바꿈"
status: open
severity: medium
found: 2026-09-18
found_during: 08-09 체크포인트 (Chrome)
origin_phase: 04
phase8_regression: false
implemented: 2026-09-22
verification: pending_browser
files:
  - lib/ai/mention-keyboard.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/MentionAutocomplete.tsx
  - tests/ai/mention-keyboard.test.ts
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
- **수정 전 실제:** textarea 값이 `"비가 그친 뒤 @오수\n"`이 되고 멘션 목록은 그대로다. "멘션된 문서"도 비어 있다.

## 원인

`MentionAutocomplete`는 cmdk `Command`(`shouldFilter={false}`)를 Popover 안에 렌더하지만 포커스는 계속 원고 textarea에 있다. cmdk의 키보드 탐색은 `Command`가 키 입력을 받을 때만 동작하며, textarea와 자동완성 목록 사이에 키보드 연결이 없어서 Enter가 textarea의 기본 줄바꿈으로 처리됐다.

## 구현 내용

- 자동완성이 열려 있는 동안 textarea의 `keydown`을 받아 위·아래 방향키로 후보를 순환한다.
- Enter/Tab은 활성 후보를 선택하고 Escape는 목록을 닫는다.
- 후보가 없을 때 Enter는 textarea의 기본 줄바꿈을 유지한다.
- cmdk의 선택값을 후보 ID로 제어해 키보드 이동과 화면의 강조 항목을 일치시킨다.
- 한글 IME 조합 중인 Enter와 `keyCode 229`는 가로채지 않는다.
- 키 판정 로직을 `lib/ai/mention-keyboard.ts`의 순수 함수로 분리했다.

## 자동 검증

- `tests/ai/mention-keyboard.test.ts`: 9개 테스트 통과.
- `npx tsc --noEmit` 통과.
- BUG-02 관련 컴포넌트·키 처리 모듈·테스트의 범위 지정 eslint 검사 통과.
- `npm run lint` 전체 검사는 BUG-02 범위 밖의 기존 오류(`QuickAddDialog.tsx`, KB 편집 페이지, 인증/지갑 테스트, `mcpres/` 등)로 실패했다. BUG-02 변경 파일에서는 오류가 발생하지 않았다.
- `npx vitest run tests/ai --no-file-parallelism`: 11개 파일·183개 테스트 통과. Supabase 환경값이 없는 현재 셸에서는 DB 연동 스위트 3개가 `supabaseUrl is required`로 시작 전에 중단됐다.

## 다른 디바이스 브라우저 검증 대기

아래 항목을 다른 디바이스의 실제 브라우저에서 확인한 뒤에만 완료 처리하고 `.planning/fixed/`로 옮긴다.

- `@오수` 입력 후 Enter로 첫 후보가 선택되고 줄바꿈이 생기지 않는다.
- 아래/위 방향키로 강조 후보가 이동하고 끝에서 순환한다.
- Tab으로 활성 후보를 선택할 수 있다.
- Escape로 목록이 닫히며 원고 내용은 바뀌지 않는다.
- 한글 조합 확정 Enter가 후보 선택으로 오인되지 않는다.
- 후보가 없을 때 Enter는 정상적으로 줄바꿈을 입력한다.

## 비고

구현과 자동 검증은 끝났지만 사용자 브라우저 확인 전이므로 `verification_pending` 상태로 유지한다. 브라우저 확인이 끝나기 전에는 완료 문서나 완료 커밋을 만들지 않는다.
