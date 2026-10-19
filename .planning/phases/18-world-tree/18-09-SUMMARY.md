---
phase: 18-world-tree
plan: "09"
subsystem: world-tree
tags: [world-tree, branch-flow, state-machine, wizard, world-settings, eligibility-ui, tdd]
requires: ["18-02", "18-07", "18-13", "18-14"]
provides:
  - "lib/world-tree/branch-flow.ts: createBranchFlow / branchFlowReducer / canBegin / canOpenReview / canConfirm / confirmBlock / eligibilityGate / eligibilityRows / eligibilityUnmetMessage / diffGate / diffSignature / BRANCH_FLOW_COPY / BRANCH_FLOW_STEPS"
  - "components/world-tree/branch-wizard.tsx: BranchWizard, EligibilityPanel, eligibilityViewFromSection"
  - "components/world-tree/world-settings.tsx: WorldSettings({ ownerState, ownerTreeSlot?, resumeDraft?, timelineHref?, publishHref? })"
  - "components/world-tree/branch-stepper.tsx: BranchStepper({ current })"
affects: ["18-11", "18-12"]
tech-stack:
  added: []
  patterns:
    - "Pure reducer drives the 5-step flow; the client component only runs 18-07 Server Actions and dispatches results"
    - "Review token = diffSignature(server diff); an editor return or a changed refreshed diff voids the acknowledgement"
    - "Eligibility UI renders server summary only; per-row met/unmet comes from server unmetReasons, never count comparisons"
    - "One requestId per flow (begin retries recover the same draft); confirm is single-flight: recheck -> submit"
key-files:
  created:
    - lib/world-tree/branch-flow.ts
    - tests/world-tree/branch-flow.test.ts
    - components/world-tree/branch-wizard.tsx
    - components/world-tree/world-settings.tsx
    - components/world-tree/branch-stepper.tsx
  modified: []
requirements: [WTREE-03, WTREE-04, WTREE-05, WTREE-07, WTREE-10]
decisions:
  - "버튼 이름은 UI-SPEC §4를 따른다. 3단계 '가지 확정'은 경고 확인만 하고 4단계로 넘어가며, 서버 확정은 4단계 '작품 만들기'에서 한 번만 한다. PLAN의 '가지 확정하기'는 UI-SPEC의 '하기 없이 통일' 규칙과 어긋나서 쓰지 않았다."
  - "완료·정보 단계 공개 안내는 UI-SPEC §4 카피 '첫 회차를 발행하면 세계수에 보여요.'를 쓴다. PLAN 본문의 '작품을 발행하면 독자 세계수에 보여요.'는 PLAN이 함께 요구한 'UI-SPEC §4와 일치' 규칙에 따라 UI-SPEC 문구로 바꿨다."
  - "parent_not_visible이면 UI-SPEC의 공통 문구를 보여 주고, 그 아래에 isPublished=false면 '먼저 작품을 발행해 주세요.', isPublished=true면 '부모 작품이 독자에게 공개된 상태에서만 가지를 칠 수 있어요.'를 덧붙인다. 집계하지 않은 0은 숫자 행으로 표시하지 않는다."
  - "확정 직전 재검사에서 미충족이면 '조건이 달라졌어요. 부족한 항목을 채워 주세요.', DB가 branch_ineligible로 거부하면 '아직 가지 치기 조건을 채우지 못했어요.'를 보여 준다. 두 경우 모두 최신 서버 현황 패널을 다시 그리고 draft·제목·시점은 그대로 둔다."
  - "확정 시점(era) 후보는 원본 작품 자기 연표의 살아 있는 구간이다(0034 confirm은 부모 가지 줄의 era를 요구한다). begin의 forkEraId는 null로 보내고 시점은 확정 때 정한다."
  - "KB 편집은 기존 편집기(/studio/{draftWorkId}, /studio/{draftWorkId}/kb/{nodeId})를 새 탭으로 연다. 이 탭으로 돌아오면(focus/visibilitychange) EDITOR_RETURNED로 diff를 stale 처리하고 다시 받으며 경고 확인을 무효로 한다."
  - "begin이 성공하면 URL에 ?draft={draftWorkId}를 붙여(router.replace) 새로고침해도 같은 draft로 이어지게 한다. 이 query 검증과 page 조립은 18-11이 맡는다."
  - "WorldSettings의 시작 버튼도 서버 자격 게이트로 막는다(loading/error/미충족이면 비활성). 시작하면 같은 화면 안에서 BranchWizard를 연다."
  - "독자 보기는 열 때마다 getReaderPreviewAction으로 서버 독자 투영을 다시 받는다. 작가 보기는 ownerTreeSlot(18-10 WorldTreeView 주입용)이 있으면 그걸 쓰고, 없으면 owner projection 목록을 보여 준다. 칩은 가지 초안/초안(발행 전)/비공개(발행했지만 독자에게 안 보임)이다."
metrics:
  duration: "~25m"
  completed: "2026-10-19"
  tasks: 2
  files: 5
---

# Phase 18 Plan 09: 5단계 셀프 가지 흐름·최소 세계관 공개 설정 Summary

셀프 가지 흐름(source → editing → review → info → complete)을 순수 상태 기계로 만들었다. 이 상태 기계는 서버 자격 현황을 fail-closed로만 읽고, diff 서명에 묶인 경고 확인을 거쳐 4단계에서 서버 확정을 단 한 번 부른다. 그 위에 BranchWizard·BranchStepper·WorldSettings 클라이언트 컴포넌트를 올리고 18-07 Server Action과 연결했다. 공개 상태는 기존 발행 설정 링크로만 다루고 삭제 제한도 넣었다.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (RED) | 5단계 흐름 실패 테스트 | c178986 | tests/world-tree/branch-flow.test.ts |
| 1 (GREEN) | branch-flow 상태 기계 구현 | 7abc140 | lib/world-tree/branch-flow.ts |
| 2 | wizard·stepper·world settings | b6b9286 | components/world-tree/branch-wizard.tsx, world-settings.tsx, branch-stepper.tsx |

REFACTOR 단계는 따로 바꿀 것이 없어 커밋하지 않았다.

## What was built

- **branch-flow.ts (pure, server-only import 없음)**
  - `eligibilityGate`는 loading, error, readerVisible=false, eligible=false, eligible=true인데 unmetReasons가 남은 모순 상태를 모두 막는다. 사유는 `loading | error | parent_unpublished | parent_not_visible | unmet`이다.
  - `eligibilityRows`는 서버 숫자·분모와 서버 unmetReasons로만 행을 만든다. 집계하지 않은 상태(parent_not_visible)면 null을 돌려준다.
  - `diffGate`: If는 변경 0건이면 막고, 확장은 추가 0건이거나 상속 문서를 수정·삭제했으면 막는다. 0034와 같은 규칙이다.
  - reducer의 막는 조건과 처리:
    - begin: pending 중 중복 요청을 막고, 실패 후 재시도에도 같은 requestId를 쓴다.
    - 가지 유형: draft가 생긴 뒤에는 바꿀 수 없다. purchase 시작 위치는 비활성 자리만 있다.
    - 리뷰: 3단계 경고 확인은 diff 서명을 저장할 뿐 확정하지 않는다. 편집기에서 돌아오거나 다른 내용의 diff를 받으면 확인을 무효로 하고 review로 돌아간다. title/era 입력값은 유지한다.
    - 확정: 4단계에서 제목, 시점(eraOptions 안의 값), 서버 자격, 최신 diff, 확인 서명이 모두 맞아야 한다. 그다음 rechecking → submitting 순서로 진행하며 중복 요청은 무시한다. complete 이후의 응답은 기존 완료 상태를 그대로 쓴다.
    - 확정 실패:
      - branch_ineligible: 최신 현황으로 갱신한다.
      - zero_changes/zero_additions/inherited_mutation: diff를 stale로 두고 review로 돌린다.
      - transient 오류: info에 머물고 재시도할 수 있다.
      - not_found/forbidden/request_conflict/confirmed_immutable: 재시도를 막는다.
- **BranchWizard**
  - 18-07 action(getBranchEligibility, beginBranch, getBranchDiff, confirmBranch)을 부른다.
  - 1단계에는 시작 위치(내 작품만 활성), If/확장 설명, 서버 자격 패널, 복제 범위 안내가 있다. 시작 버튼은 막힌 이유를 옆에 보여 준다.
  - 2단계는 diff 목록과 기존 KB 편집 링크를 보여 준다.
  - 3단계는 건수·목록·스냅샷 경고와 '가지 확정' 버튼이다.
  - 4단계는 제목·시점 select·발행 안내·최신 자격 패널과 '작품 만들기' 버튼이다.
  - 5단계는 '세계수에서 보기'·'에디터로 가서 연재 시작' 링크다.
- **EligibilityPanel**
  - 작품 발행 상태, `발행 {n}/{기준}화`, `설정 문서 {n}/{기준}개`, 인물·장소·사건 행을 아이콘과 '충족/미충족' 텍스트로 함께 보여 준다.
  - 도움말은 `본문 {thresholds.minDocumentChars}자 이상인 설정 문서만 세어요.`와 문서 제외 안내다.
  - 조회에 실패하면 실패 카피와 '다시 불러오기' 버튼을 보여 준다.
  - 컴포넌트 안에 기준 숫자를 하드코딩하지 않았다.
- **WorldSettings**
  - 공개 상태 안내와 '발행 설정으로 이동' 링크(기존 /studio/{id}/chapters)
  - 가지 치기 자격 요약과 게이트된 시작 버튼. 시작하면 같은 화면에서 wizard가 열린다.
  - draft 작품에서는 '가지 치기 이어서 하기'
  - 연표 편집 링크(/studio/{id}/world/timeline, 18-08)
  - 스냅샷 고정 칩과 안내
  - 원본 변경 알림. 읽음 처리는 별도 action이고, 실패하면 안 읽음 상태를 유지하고 오류를 보여 준다.
  - 작가/관리자 보기와 독자 보기 전환(서버 재투영, 부러진 가지는 '비공개된 본작 자리'로 표시하고 ID를 넣지 않음)
  - 삭제: DB child count에 따라 비활성이 되고 '하위 가지를 먼저 정리해 주세요.'를 보여 준다. 하위가 없으면 Dialog로 확인한 뒤 deleteBranchAction을 부른다.

## Verification

- `npx vitest run --project unit tests/world-tree/branch-flow.test.ts`: 30/30 passed. RED 단계에서는 모듈이 없어서 실패하는 것을 먼저 확인했다.
- `npx tsc --noEmit`: 통과(오류 0)
- 이번 plan의 5개 파일에 `npx eslint`: 통과
- DB 테스트(`--project db`, `*.database.test.ts`)는 지침대로 실행하지 않았다.

## Deviations from Plan

### Auto-fixed Issues

None. PLAN의 행동 요구는 모두 구현했다. 카피 두 곳은 PLAN 자체 규칙("상황별 카피는 UI-SPEC §4와 일치")에 따라 UI-SPEC 문구를 썼다. 버튼 이름 '작품 만들기'·'가지 확정'과 완료 안내 '첫 회차를 발행하면 세계수에 보여요.'다. 자세한 내용은 frontmatter decisions에 있다.

### Scope notes

- 이 plan의 컴포넌트는 아직 어떤 route에도 붙어 있지 않다. `/studio/[workId]/world/page.tsx` 조립, `?draft=` 검증·resumeDraft 전달, 작품 홈 진입 링크는 18-11 소유다.
- 18-10 WorldTreeView는 동시에 진행 중이라 import하지 않았다. 대신 `ownerTreeSlot` prop으로 주입할 수 있게 했다.
- WTREE-09 진도/잠금, READ-06 문서별 공개, 연결 공개 토글, 구매 시작은 만들지 않았다(구매는 비활성 자리만 있음).

## Known Stubs

- `components/world-tree/branch-wizard.tsx` 시작 위치 '구매한 세계관' 라디오는 의도적으로 비활성이고 '아직 준비 중이에요' 안내만 있다. WTREE-11~13 스토어 범위다.
- `components/world-tree/world-settings.tsx` OwnerView는 `ownerTreeSlot`이 없으면 단순 목록으로 대신 보여 준다. 시각 트리는 18-10·18-11이 주입한다.

## Gaps (gate 18-12 / browser)

- 브라우저 검증은 하지 않았다. 아래는 18-12에서 확인해야 한다.
  - KB 편집기를 새 탭으로 열고 돌아올 때 diff가 다시 로드되는지
  - `?draft=` 새로고침 복구(18-11 연결 뒤)
  - Dialog 삭제 흐름
  - 독자 미리보기 전환과 부러진 가지 표시
  - 다크 모드 대비, 44px 터치 영역
- 실DB 검증도 하지 않았다. 아래는 18-12 몫이다.
  - begin/confirm RPC 원자성·멱등
  - 블라인드 부모 parent_not_visible 거부
  - 상속 문서 DB guard

## Self-Check: PASSED

- FOUND: lib/world-tree/branch-flow.ts, tests/world-tree/branch-flow.test.ts, components/world-tree/branch-wizard.tsx, components/world-tree/world-settings.tsx, components/world-tree/branch-stepper.tsx
- FOUND commits: c178986, 7abc140, b6b9286
