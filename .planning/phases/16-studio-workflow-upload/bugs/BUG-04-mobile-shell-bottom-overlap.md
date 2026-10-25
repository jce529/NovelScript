---
id: BUG-04
title: 모바일·태블릿 스튜디오 하단 탭 바가 화면 밖으로 밀리거나 긴 화면 내용과 겹침
status: fixed-pending-device-check (Phase 17에서 수정, 사용자 브라우저 확인 대기)
severity: low (레이아웃, 기능 영향 없음)
found: 2026-10-25
found_during: Phase 17 수동 UAT 중 사용자 보고(세계관 가지 치기 하단 스크린샷)
origin_phase: 16 (STUDIO-04 모바일 탭 셸, 커밋 2535ead)
files:
  - app/studio/[workId]/layout.tsx
  - components/studio/workspace/StudioStage.tsx
  - tests/studio/studio-shell-layout.test.ts
---

# BUG-04: 하단 탭 바 겹침

## 증상

lg(1024px) 미만에서 세계관 같은 긴 화면을 열면 하단 탭 바(설정집·회차 / 집필 / AI)가 본문 중간에 걸려 내용과 겹치고, 탭 바 아래로도 내용이 이어진다.

## 원인 (375×812에서 측정)

1. 셸이 `h-dvh`인데 위에 56px 사이트 헤더가 있어 셸 하단(탭 바 808~868)이 화면(812) 아래로 밀렸다.
2. `StudioStage` 래퍼가 flex 컨테이너가 아닌 부모 안에서 `flex-1`만 써서 높이가 정해지지 않아, `<main>`의 `h-full`이 auto로 풀렸다(main 1146px). 스크롤이 main이 아니라 문서에서 생겼다.
3. 숨겨진(invisible) 탭의 본문이 셸 밖으로 넘쳐 "설정집·회차" 탭에서 문서 높이가 1448px로 늘었다.

## 수정

- 셸: `h-dvh` → `h-[calc(100dvh-3.5rem)]`, `max-lg:overflow-hidden` 추가(lg 이상은 기존 `lg:h-auto`).
- `StudioStage` 래퍼에 `max-lg:h-full`.

## 검증

- `tests/studio/studio-shell-layout.test.ts` 2건.
- 브라우저 측정(일회용 DB·fixture 서버): 375×812 세계관·회차·설정집 페이지와 집필/설정집·회차/AI 탭 모두 탭 바 752~812(화면 안), 문서 높이 812, 본문은 안에서 스크롤. 768×1024도 정상. 1280 데스크톱은 탭 바 숨김, 문서 정상 스크롤.
- 남은 확인: 사용자 브라우저 확인 후 `bug-complete`.

## 참고(범위 밖 관찰)

모바일 AI 탭에서 패널 카드가 화면보다 길어(1023px) 본문 영역 안에서 스크롤해야 입력창에 닿는다. 동작은 정상이라 이번에는 건드리지 않았다.
