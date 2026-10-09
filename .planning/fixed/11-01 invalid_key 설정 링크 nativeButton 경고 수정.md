---
id: 11-01
title: invalid_key 카드의 설정 링크가 Button(nativeButton)에 `<a>`로 렌더링되어 콘솔 경고
fixed: 2026-10-09
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice.tsx
---

# 11-01: invalid_key 설정 링크 nativeButton 경고 수정

## 증상

invalid_key 실패 카드가 뜨면 콘솔에 "Base UI: A component that acts as a button expected a native <button> because the `nativeButton` prop is true" 오류가 찍혔다. 링크는 동작했지만 버튼 시맨틱·접근성 경고였다(Phase 11 UAT-3 중 발견).

## 원인

`AiPanelNotice.tsx`의 `<Button render={<Link …/>}>`가 기본값 `nativeButton=true`인 채 `<a>`를 렌더링했다.

## 수정

해당 Button에 `nativeButton={false}` 추가(한 줄).

## 검증

- `ai-panel-notice` 테스트 9건, `tsc --noEmit`, eslint 통과.
- 브라우저: 수정 후 페이지를 새로 열어 invalid_key 카드를 두 번 띄웠으나 콘솔에 새 경고가 추가되지 않았다(콘솔 버퍼가 페이지 이동 사이에 유지돼 기존 1건만 남음). 카드·"설정에서 키 확인" 링크(`<a>`)는 정상 표시.

## 커밋

- `d5319c8` fix(11): BUG-01 invalid_key 설정 링크 nativeButton 경고 수정
