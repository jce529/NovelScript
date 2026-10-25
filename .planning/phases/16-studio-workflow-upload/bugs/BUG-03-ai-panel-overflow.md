---
id: BUG-03
title: AI 패널 카드가 고정 높이인데 내용이 넘쳐 입력창이 카드 밖으로 튀어나옴
status: open (수정 방향 확정, Phase 17에서 수정)
severity: low (레이아웃, 기능 영향 없음)
found: 2026-10-25
found_during: Phase 17 수동 UAT 중 사용자 보고(스크린샷)
origin_phase: 16 (커밋 2535ead 스튜디오 작업 흐름 확장 — 설정 문서 AI·파일 업로드·모바일)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
  - tests/ai/ai-panel-layout.test.ts
---

# BUG-03: AI 패널 하단이 카드 밖으로 넘침

## 증상

창 높이가 낮거나 설정 영역(모델·프리셋·알림 등)이 길어지면, AI 어시스턴트 카드의 테두리는 중간에서 끝나는데 보유 토큰 막대와 메시지 입력창이 카드 아래로 튀어나온다.

## 원인

`AiPanel.tsx`의 `<aside>`가 `h-[85vh]`(큰 화면 `lg:h-[calc(100vh-4rem)]`)로 높이를 고정하고 `overflow`가 없다(기본 visible). 안의 채팅 로그는 `min-h-0 flex-1 overflow-y-auto`라 공간이 모자라면 높이 0으로 줄고, 나머지 요소(h2, 설정, 알림, 토큰 막대, 입력창)는 줄지 않아 합이 카드보다 길어지면 아래로 넘친다. 측정(1024×560): 카드 496px, 내용 860px.

## 수정 방향

- `<aside>`는 높이 고정 + `overflow-hidden`, 패딩은 안쪽 영역으로 옮긴다.
- 설정·채팅 영역은 카드 안에서 `overflow-y-auto`로 스크롤.
- 알림·토큰 막대·입력창은 카드 하단에 고정(스크롤 영역 밖)해서 항상 카드 안에 보이게 한다.
- 채팅 로그는 최소 높이(`min-h-48`)를 줘서 0으로 줄지 않게 한다. 채팅 자동 스크롤(`chatLogRef`)은 그대로 유지.
- 동작·문구는 건드리지 않는다.

## 검증

- 단위: 소스 레이아웃 불변식 테스트(`tests/ai/ai-panel-layout.test.ts`).
- 브라우저: 1024×560 및 모바일 폭에서 카드 안에 입력창이 보이고 설정 영역이 스크롤되는지 확인.
