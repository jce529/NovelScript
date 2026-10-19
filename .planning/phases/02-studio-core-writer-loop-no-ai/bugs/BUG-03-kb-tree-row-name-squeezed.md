---
id: BUG-03
title: KB 트리 행에서 숨은 액션 버튼이 폭을 차지해 문서·템플릿 이름이 1~4글자로 잘린다
status: open
severity: medium
found: 2026-10-19
found_during: 02-13 Task 3 브라우저 게이트(사용자 반응형 뷰포트 확인, 스크린샷 제공)
origin_phase: 02 (eaa5639 feat(02-05) KB tree sidebar에서 `ml-auto opacity-0 group-hover` 패턴 도입, 31ce0da feat(02-10)에서 템플릿 행·배지로 확장)
files:
  - components/studio/kb-tree.tsx
  - components/studio/studio-panel-shell.tsx
---

# BUG-03: KB 트리 행에서 이름이 잘린다

## 증상
태블릿~좁은 데스크톱 폭에서 왼쪽 문서 트리(`내 템플릿`, `내 폴더`)의 행이 다음처럼 보인다(사용자 스크린샷).

- 내 템플릿 이름이 거의 보이지 않고 `이 작품`/`계정` 범위 배지만 보인다(예: "범위시험"이 "범"으로, "게이트 인물 양식"이 한두 글자로 잘림).
- 기본 템플릿·폴더 행도 같은 구조다.

사용자 표현은 "옆의 파일 에디터 부분이 잘린다"이며, 스크린샷과 측정 결과로 볼 때 **왼쪽 문서 트리(사이드바)** 를 가리키는 것으로 해석했다. 본문 에디터 영역의 잘림은 800px 측정에서 발견되지 않았다(아래).

## 재현
1. 1회용 DB worktree에서 `next dev -p 3100`을 띄우고 뷰포트를 800x1000으로 둔 뒤 내 템플릿 화면을 연다(사이드바는 `md` 이상에서 `w-64` = 256px 고정).
2. 사이드바 `내 템플릿` 행을 DOM으로 측정한다(2026-10-19, 행 폭 255px 기준):

| 행 | 이름 렌더 폭 | 이름 실제 필요 폭 | 투명 액션 영역 폭 |
|---|---|---|---|
| 인물/장소/사건/세력 (기본, 잠금) | 26px | 26px | 52px |
| 게이트 인물 양식 (내 템플릿) | 6px | 102px | 136px |
| 게이트 양식 이름변경됨 | 5px | 137px | 136px |
| 범위시험 (작품) | 15px | 52px | 136px |
| 범위시험 (계정) | 4px | 52px | 136px |

3. 액션 영역(`opacity: 0`)이 사라진 것이 아니라 레이아웃 폭을 계속 차지하고 있다. 본문 영역(`main`)은 폭 529px에 `scrollWidth` 529px로 넘치지 않는다.

## 기대 / 실제
- 기대: 행 폭 안에서 이름이 가능한 한 길게 보이고(넘치면 말줄임), 액션은 hover/포커스/롱프레스 때만 나타난다.
- 실제: 액션 버튼들이 보이지 않아도 폭을 차지해, 이름이 남는 몇 px로 줄어든 채 말줄임조차 의미가 없다. 내 템플릿 행은 액션이 5개 안팎(사본, 새 문서, 카테고리 이동, 이름 변경, 삭제)이라 136px를 차지한다.

## 원인
`components/studio/kb-tree.tsx` 행 마크업(`KbNodeRow` 약 57행, `TemplateEntryRow` 약 218~239행).

- 행: `group flex items-center gap-1 h-8 px-2 text-sm`.
- 이름 `Link`/`span`: `truncate`만 있고 `min-w-0 flex-1`이 없다.
- 범위 배지(`Badge`): `shrink-0`·`whitespace-nowrap`이 없다.
- 액션 래퍼 `<span className="ml-auto opacity-0 group-hover:opacity-100">`: `opacity`만 바꾸므로 숨겨졌을 때도 레이아웃 폭을 그대로 차지한다. 폭이 고정된 `w-64` 사이드바(`studio-panel-shell.tsx` 142행)에서 이 폭이 이름을 밀어낸다.
- 터치 환경에는 hover가 없어 액션이 보이지도 않는데 폭만 차지한다(롱프레스 메뉴가 있어 기능은 접근 가능).

## 수정 방향
레이아웃 수정이며 정책 결정은 필요 없다. 액션 표시 방식만 다음 중 고른다(기본 권장은 A).

- **A (권장)**: 액션 래퍼를 레이아웃에서 빼서 행 오른쪽에 겹쳐 띄운다(`absolute inset-y-0 right-1 hidden items-center bg-… group-hover:flex group-focus-within:flex`). 이름은 `min-w-0 flex-1 truncate`로 전체 폭을 쓰고, 행은 `relative`. 키보드 포커스는 `focus-within`으로 보장하고 터치는 기존 롱프레스 메뉴를 쓴다.
- B: 액션을 hover 때만 렌더링(`hidden group-hover:flex`)해 평소 폭을 0으로 만든다. 단 hover 순간 이름이 다시 줄어드는 레이아웃 흔들림이 있다.
- C: 액션을 행에서 제거하고 롱프레스/우클릭 메뉴로만 제공한다. 액션 접근 방식 자체를 바꾸는 결정이라 02-10 UI-SPEC 변경이 필요하다.

공통: 이름 `min-w-0 flex-1 truncate`, 배지 `shrink-0 whitespace-nowrap`(또는 이름이 우선하도록 배지를 말줄임 대상으로), 잠금 아이콘 `shrink-0`. 같은 규칙을 `KbNodeRow`(일반 문서·폴더)와 `TemplateEntryRow`, 챕터 행에 일관되게 적용한다.

## 검증
- 단위: `tests/kb/template-tree-ui.test.ts` 등 정적 소스 검사로 이름 `min-w-0`/`flex-1`, 액션 래퍼가 평소 폭을 차지하지 않는 클래스(A: `absolute`, B: `hidden`)인지, 배지 `shrink-0` 회귀 테스트를 추가한다.
- 브라우저(1회용 DB, `--env-file` 고정 실행): 800px/1024px/1440px에서 위 표와 같은 측정을 반복해 모든 행의 이름 렌더 폭이 필요 폭 또는 행 폭 한도에 도달하는지, hover/포커스 시 액션이 보이고 클릭되는지, 사이드바에서 `scrollWidth`가 넘치지 않는지 확인한다.
- 접기/펼치기, 우클릭·롱프레스 메뉴 동작이 그대로인지 회귀 확인한다(02-13 게이트 항목).
