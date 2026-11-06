---
id: BUG-05
title: 공용 Select 팝업이 스크롤·드래그 때 트리거를 따라오지 않고 화면에 떠 있음
status: open
severity: medium
found: 2026-11-03
found_during: 사용자 직접 사용 중 제보 (AI 패널 모델 선택 드롭다운, 3100 일회용 DB 서버)
origin_phase: 02 (d3a24c2 feat(02-01) — shadcn Select 설치, alignItemWithTrigger 기본값 true). 증상은 Phase 10 ModelPicker(bb266ac)에서 드러남
files:
  - components/ui/select.tsx
  - components/ai/model-picker.tsx
---

# BUG-05: 공용 Select 팝업이 스크롤·드래그 때 트리거를 따라오지 않고 화면에 떠 있음

## 증상

AI 패널의 모델 선택 드롭다운을 연 채 패널을 스크롤하거나 드래그하면, 목록이 트리거에서 떨어져 AI 패널과 별개로 화면 위에 고정된다. 패널 폭 밖에 떠서 아래 입력 필드(장르·AI 지시 프리셋)를 가린다.

## 재현

1. 3100 서버에서 회차 편집기를 열고 AI 패널의 모델 선택(`#ai-model-select`)을 연다.
2. 패널 스크롤 컨테이너를 스크롤한다.
3. 실측: 트리거 y 368 → 248로 이동했지만 팝업 y는 346에 그대로 남았다. 팝업 positioner 스타일은 `position: fixed; top: 336px` 고정값이다.

## 기대 / 실제

- 기대: 팝업이 트리거 아래에 붙어 따라가거나, 스크롤하면 닫힌다.
- 실제: 열릴 때의 좌표에 고정되어 떠 있다.

## 원인

- `components/ui/select.tsx`의 `SelectContent`가 `alignItemWithTrigger = true`를 기본값으로 넘긴다.
- base-ui 1.7.0 `SelectPositioner`는 마우스·키보드로 열릴 때(`openMethod !== 'touch'`) 이 값이 켜지면 `positionerStyles = FIXED`로 두고 `disableAnchorTracking: alignItemWithTriggerActive`로 앵커 추적을 끈다. 그래서 열린 뒤 트리거가 움직여도 위치를 다시 계산하지 않는다.
- 같은 컴포넌트에서 `side="bottom"`, `sideOffset` 기본값을 주었으므로 의도는 "트리거 아래 드롭다운"인데, 선택 항목을 트리거에 겹치는 macOS 방식이 기본으로 켜져 있어 충돌한다.
- 모델 피커는 패널이 스크롤 컨테이너 안이고 목록이 길어서 가장 눈에 띈다. 같은 공용 Select를 쓰는 다른 화면도 같은 구조다.

## 수정 방향

- `SelectContent`의 `alignItemWithTrigger` 기본값을 `false`로 바꿔 앵커 추적(스크롤·리사이즈 시 위치 재계산)을 켠다. 화면별로 겹침 정렬이 필요하면 prop으로 다시 켤 수 있다.
- 정책 결정이 필요한 옵션이 아니라서 사용자 확인 없이 확정한다 (공용 기본값 vs 모델 피커만 변경 중 공용 기본값 선택: 같은 결함을 한 번에 없앤다).
- 데이터 속성 `data-align-trigger={alignItemWithTrigger}`는 그대로 유지한다.

## 검증

- 단위 테스트: 기본값이 `false`임을 확인하고, 명시적으로 `true`를 주면 전달되는지 확인.
- 브라우저(데스크탑 1440px·모바일 375px): 열린 상태에서 패널을 스크롤했을 때 팝업이 트리거와 함께 움직이는지(또는 닫히는지) 확인.
- 회귀: 템플릿 만들기 대화창의 영역·카테고리 선택, 업로드 대화창 Select가 정상 열리고 선택되는지 확인.
