---
id: BUG-04
title: 미분류 템플릿의 툴팁("카테고리 미지정 · 카테고리 폴더로 이동해 주세요")이 사이드바에서 나타나지 않음
status: open (수정 방향 결정 대기)
severity: low (안내 문구 누락, 기능 영향 없음)
found: 2026-10-25
found_during: Phase 17 UAT C5 (Phase 15 BUG-03의 "미분류 표시와 툴팁" 검증 항목)
origin_phase: 02 (02-10 사이드바 행 메뉴·접이식 폴더 개편, 커밋 31ce0da)
files:
  - components/studio/kb-tree.tsx
  - lib/kb/sidebar-sections.ts
---

# BUG-04: 미분류 툴팁 도달 불가

## 증상

루트 직속에 남은 커스텀 이름 템플릿(카테고리 폴더 밖)은 사이드바 "내 템플릿" 아래 **"미분류" 그룹 제목**으로만 표시된다. Phase 15 UAT가 기대한 행 단위 "미분류" 표시와 툴팁("카테고리 미지정 · 카테고리 폴더로 이동해 주세요")은 어디서도 보이지 않는다.

## 원인 (코드·브라우저 확인)

- 툴팁은 `kb-tree.tsx`의 `TreeRow`(`isUncategorizedTemplate`)에만 있다.
- 사이드바는 02-10 개편 이후 `KbTemplateSection`(그룹 제목 + `TemplateEntryRow`)으로 템플릿을 그려 `TreeRow`로 템플릿 루트를 렌더하지 않는다. `TemplateEntryRow`에는 "미분류" 라벨도 툴팁도 없다.
- 즉 `TreeRow`의 미분류 라벨·툴팁은 현재 화면에서 도달할 수 없는 코드다. 단위 테스트(`tests/kb/template-tree-ui.test.ts`)는 `TreeRow`를 직접 렌더해 통과한다.

## 재현

일회용 DB: 작품 `UAT17 레거시 템플릿`(27bd0e55-402e-4711-8fa7-eb55d71119b1)의 템플릿 루트 직속에 파일 `UAT루트커스텀`. 사이드바 "내 템플릿 > 미분류 > UAT루트커스텀 [이 작품]"만 보이고 툴팁 없음.

## 수정 방향 후보 (사용자 결정 필요)

1. "미분류" 그룹 제목 또는 그룹 안 행에 같은 툴팁/안내를 붙인다(`KbTemplateSection`).
2. 그룹 제목 "미분류"만으로 충분하다고 보고, 도달 불가한 `TreeRow` 코드와 테스트를 정리한다.
