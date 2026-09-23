---
id: BUG-03
title: 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생
status: open
severity: low
found: 2026-09-18
found_during: 08-09 체크포인트 (Chrome, viewport 958×910)
origin_phase: 04 (`1b36bdc` — AiPanel에 `w-96 shrink-0` 고정폭 도입)
files:
  - app/studio/[workId]/chapters/[chapterId]/page.tsx
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
---

# BUG-03: 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생

## 증상

Chrome 창 폭이 약 958px일 때 챕터 편집기 페이지 하단에 가로 스크롤바가 생긴다.
- 오른쪽 AI 패널(폭 384px)이 화면 밖으로 일부 잘린다.
- 왼쪽 사이드바([workId]/layout.tsx의 작품 트리, 폭 256px) 제목도 잘려 보인다.

창 폭 1568px에서는 같은 화면에 가로 스크롤이 없었다.

## 재현

1. 브라우저 창 폭을 약 958px로 줄인다.
2. `/studio/{workId}/chapters/{chapterId}`를 연다.
3. 페이지 하단에 가로 스크롤바가 생기고, 사이드바/AI 패널이 잘리는지 확인한다.

## 기대 / 실제

- **기대:** 좁은 폭에서는 버튼이 줄바꿈되거나 AI 패널 폭이 줄어들어 가로 스크롤이 생기지 않는다.
- **실제:** 사이드바(256px) + 본문 padding(64px, `p-8`) + 컬럼 gap(32px, `gap-8`) + AI 패널(384px, 고정)을 뺀 나머지가 좁아지는데, 원고 컬럼과 버튼 행이 그 폭 밑으로 줄어들지 못해 페이지 전체가 가로로 넘친다.

## 원인

1. `AiPanel.tsx:254`의 `<aside className="sticky top-8 flex h-[calc(100vh-4rem)] w-96 shrink-0 ...">` — AI 패널이 항상 고정 384px, 뷰포트가 좁아져도 줄어들지 않는다. (Phase 04, 커밋 `1b36bdc`에서 도입)
2. `page.tsx:101`의 원고 컬럼(`<div className="flex flex-1 flex-col gap-4">`)에 `min-w-0`이 없다 — flex item의 기본 `min-width: auto` 때문에 내부 콘텐츠의 최소 폭 아래로 줄어들지 못한다.
3. `page.tsx:110`의 버튼 행(`<div className="flex items-center gap-3">`, 저장/무료·유료/가격 Select/발행 버튼)에 `flex-wrap`이 없어 줄바꿈되지 않고, 이 행의 min-content 폭이 약 550~600px로 추정된다.

세 조건이 겹치면서: 958px(창) - 256px(사이드바) - 64px(`p-8`) - 32px(`gap-8`) - 384px(AI 패널) = 222px만 원고 컬럼에 남는데, 버튼 행이 550~600px 아래로 줄어들지 못해 페이지 전체가 가로로 넘친다. Phase 04에서 AI 패널이 고정폭으로 도입되기 전에는 원고 컬럼이 쓸 수 있는 폭이 훨씬 넓어 같은 버튼 행도 문제되지 않았을 것으로 보인다 — 즉 이 레이아웃은 Phase 04 이전부터 잠재적으로 취약했지만, 실제로 넘치게 만든 것은 Phase 04의 고정폭 AI 패널 도입이다.

## 수정 방향 (사용자 확정: 둘 다 적용)

1. **버튼 행 wrap**: `page.tsx:110`의 버튼 행 컨테이너에 `flex-wrap`(+필요시 `gap-y` 보정)을 추가하고, `page.tsx:101`의 원고 컬럼에 `min-w-0`을 추가해 좁은 폭에서 버튼이 자연스럽게 2줄로 내려가게 한다.
2. **AI 패널 반응형화**: `AiPanel.tsx:254`의 `w-96 shrink-0`을 뷰포트가 좁을 때 폭이 줄어들도록 바꾼다(예: `w-96` 대신 `w-full max-w-96 lg:w-96` 계열 반응형 클래스, 또는 좁은 폭에서 패널을 접는 토글). 정확한 브레이크포인트/접힘 UX는 실행 단계에서 기존 Tailwind 브레이크포인트 관례를 따라 정한다.

## 실제 적용한 변경 (2026-09-23)

- [`page.tsx`](../../../../app/studio/%5BworkId%5D/chapters/%5BchapterId%5D/page.tsx): 최상위 컨테이너를 `flex gap-8` → `flex flex-col gap-8 lg:flex-row`로 바꿔 `lg`(1024px) 미만에서는 원고와 AI 패널이 세로로 쌓이도록 했다. 원고 컬럼에 `min-w-0`을 추가하고, 저장/무료·유료/가격/발행 버튼 행에 `flex-wrap`을 추가했다.
- [`AiPanel.tsx:254`](../../../../app/studio/%5BworkId%5D/chapters/%5BchapterId%5D/ai-panel/AiPanel.tsx#L254): `aside`의 폭을 `w-96 shrink-0` → `w-full flex-col ... lg:w-96 lg:shrink-0`으로 바꿔, `lg` 이상에서는 기존과 동일하게 고정 384px 사이드 패널로 보이고, 그 미만에서는 원고 아래에 전체 폭으로 쌓이게 했다.
- 브레이크포인트로 `lg`(1024px)를 택해 958px는 세로 스택 레이아웃이 되고, 1568px는 기존과 동일한 좌우 배치를 유지한다.

## 검증

- 실제 앱 코드와 동일한 Tailwind 클래스 구조로 격리된 재현 페이지를 만들어(임시로 `public/`에 두고 dev 서버로 서빙, 검증 후 삭제) 브라우저에서 확인:
  - 958×910: `scrollWidth(943) <= innerWidth(958)` — 오버플로 없음.
  - 1568×910: `scrollWidth(1568) == innerWidth(1568)`, AI 패널 폭 384px 그대로 — 회귀 없음.
  - 모바일 폭(375 방출, 실측 981까지 축소): 오버플로 없음.
- `npx tsc --noEmit` 통과, 변경 파일 `npx eslint` 통과.
- 실제 로그인 세션을 통한 `/studio/{workId}/chapters/{chapterId}` 라이브 스크린샷 확인은 인증이 필요해 이번 세션에서는 생략했다 — `/bug-complete` 전에 실제 화면에서 한 번 더 눈으로 확인 권장.
