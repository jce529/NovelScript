---
id: BUG-02
title: 좁은 폭에서 템플릿 에디터 툴바가 깨진다 (이름 폭 0, "내 템플릿" 칩 세로 찌그러짐, 버튼 겹침·잘림)
status: open
severity: medium
found: 2026-10-19
found_during: 02-13 Task 3 브라우저 게이트(사용자 모바일 폭 확인, 스크린샷 제공)
origin_phase: 02 (1bf3980 feat(02-09) template copy/create dialogs and template editor toolbar)
files:
  - components/studio/template-editor-toolbar.tsx
  - app/studio/[workId]/kb/[nodeId]/page.tsx
  - components/studio/save-status-chip.tsx
---

# BUG-02: 좁은 폭에서 템플릿 에디터 툴바가 깨진다

## 증상
모바일 폭(약 375~450px)에서 내 템플릿을 열면 상단 툴바가 다음처럼 깨진다(사용자 스크린샷).

- 템플릿 이름이 보이지 않는다.
- "내 템플릿" 칩이 한 글자씩 세로로 쌓인다.
- "이름 변경" / "문서 저장" / "이 템플릿으로 새 문서" 버튼이 한 줄에 억지로 놓여 오른쪽 끝에서 잘리고, 오른쪽 저장 상태 칩(`문서 …`)과 겹쳐 서로 가려진다.

## 재현
1. 1회용 DB worktree(`NovelScript-p2-gate`, 브랜치 `phase2/db-browser-gate`)에서 `next dev -p 3100`을 띄운다.
2. 뷰포트를 390x844로 두고 내 템플릿(예: `/studio/<workId>/kb/<내 템플릿 id>`)을 연다.
3. DOM 측정(2026-10-19, 390px): 툴바 `[data-template-mode]` 폭 300px, 템플릿 이름 `<span>` 폭 **0px**, "내 템플릿" 칩 폭 **11px × 높이 64px**, "이 템플릿으로 새 문서" 버튼 오른쪽 끝 354px로 툴바 오른쪽(316px)을 **38px 초과**.
4. 데스크톱 폭에서는 정상이다.

## 기대 / 실제
- 기대: 좁은 폭에서도 이름(말줄임 허용)·칩·버튼이 겹치지 않고 모두 조작 가능하다. 공간이 모자라면 버튼이 다음 줄로 내려간다.
- 실제: 한 줄 `flex` 안에서 이름·칩이 먼저 0폭 근처까지 줄어들고, 버튼 그룹은 줄어들지 못해 컨테이너 밖으로 넘친다.

## 원인
`components/studio/template-editor-toolbar.tsx`의 루트가 줄바꿈 없는 한 줄 flex다.

- `className="flex items-center gap-2 border-b px-3 py-2"` — `flex-wrap`이 없다.
- 이름 `<span className="truncate ...">`에 `min-w-0`/`flex-1`/최소 폭 보장이 없어 flex-shrink로 0px까지 줄어든다.
- "내 템플릿"/읽기 전용 안내 `<span>`에 `shrink-0`·`whitespace-nowrap`이 없어 글자 단위로 줄바꿈된다.
- 버튼 그룹 `ml-auto flex items-center gap-2`는 줄바꿈도 `shrink-0`도 없어 버튼 3개(이름 변경, `saveSlot`, 이 템플릿으로 새 문서) 폭 합이 남는 폭보다 크면 넘친다. `saveSlot`(저장 버튼+상태 칩)은 페이지가 주입해 폭이 더 커진다.
- 기본 템플릿(읽기 전용 안내 문구가 긴 경우)도 같은 구조라 좁은 폭에서 같은 위험이 있다.

모바일 하단 탭은 Phase 16 범위지만, 이 툴바는 Phase 02가 만든 화면이라 Phase 02 버그로 본다(02-13의 모바일 제외 범위는 "하단 탭"뿐이다).

## 수정 방향
정책 결정이 필요 없는 레이아웃 수정이다.

1. 루트에 `flex-wrap`과 `gap-y-1`을 둔다 (`flex flex-wrap items-center gap-x-2 gap-y-1 ...`).
2. 이름은 `min-w-0 max-w-full truncate`로 두되 한 줄을 통째로 차지할 수 있게 하고(예: 좁은 폭에서 `basis-full`, `sm:basis-auto sm:flex-1`) 0폭이 되지 않게 한다.
3. 칩/안내 문구는 `shrink-0 whitespace-nowrap`(기본 템플릿 안내는 줄바꿈 허용하되 `min-w-0`).
4. 버튼 그룹은 `ml-auto flex flex-wrap items-center justify-end gap-2`로 하고 각 버튼은 `whitespace-nowrap`. 좁은 폭에서는 그룹이 다음 줄로 내려가도록 `w-full sm:w-auto`를 고려한다.
5. 페이지(`kb/[nodeId]/page.tsx`)가 주입하는 `saveSlot`도 같은 규칙(`flex-wrap`, 칩 `shrink-0`)을 따르는지 확인한다.

## 검증
- 단위: `tests/kb/template-tree-ui.test.ts` 등 정적 소스 검사 스타일로 툴바 루트에 `flex-wrap`, 이름/칩/버튼의 shrink 규칙이 있는지 회귀 테스트를 추가한다(기존 UI suite 패턴을 따른다).
- 브라우저(1회용 DB, `--env-file` 고정 실행): 390px / 768px / 1280px에서 템플릿 이름 폭 > 0, 칩이 가로 한 줄, 툴바 자식 사각형이 서로 겹치지 않고 모두 툴바 오른쪽 안쪽에 들어오는지 DOM 측정으로 확인한다. 기본 템플릿(읽기 전용)과 내 템플릿 둘 다 확인한다.
- 사용자 모바일 스크린샷과 같은 화면에서 눈으로 재확인을 요청한다.
