# Phase 19: 작가용 작품 홈 디자인 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-01
**Phase:** 19-studio-workid-ui
**Areas discussed:** 현황 요약 범위, 다음 할 일 제안, 이동 구조·사이드바 관계, 빈 상태·모바일·범위

---

## 현황 요약 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 회차·공개·심사 | 전체 회차, 공개/미공개 수, 심사 상태. 기존 데이터만 사용 | ✓ |
| 위 항목 + 설정·토큰 잔액 | 설정 문서 수와 토큰 잔액 추가 | |
| 위 항목 + 독자 지표 | 조회수·구독자 추가, 별도 phase 성격 | |

**User's choice:** 회차·공개·심사
**Notes:** 없음.

---

## 다음 할 일 제안

| Option | Description | Selected |
|--------|-------------|----------|
| 상태 기반 카드 1~2개 | 작품 상태에 맞는 일을 1~2개 제안 | |
| 고정 바로가기 모음 | 작업 화면 링크를 항상 같은 자리에 | |
| 체크리스트형 시작 가이드 | 단계 목록과 진행도 | |

**User's choice:** 글 선택 대신 목업 요청. 시안 A(상태 기반)·B(고정 바로가기)·C(체크리스트)를 만들어 비교한 뒤 "첫 연재 기준 체크리스트 이후 고정 바로가기가 더 깔끔해 보인다"고 답했다. → C를 첫 연재까지, 이후 B로 전환.
**Notes:** 사용자가 "디자인은 확정하기 전에 목업을 먼저 띄우는 것을 잊지 말라"고 지시했다(피드백 메모리 저장).

---

## 이동 구조 · 사이드바 관계

| Option | Description | Selected |
|--------|-------------|----------|
| 홈=개요, 트리=탐색 | 홈은 큰 작업 화면만, 트리는 개별 문서 이동 | ✓ (시안 D) |
| 홈에 최근 작업 목록 추가 | D + 최근 수정한 회차·문서 3~5개 | |
| 홈이 사이드바를 대체 | 홈에서 모든 이동 처리 | |

**User's choice:** 세 가지를 목업으로 보고 D 선택.
**Notes:** E는 최근 수정 기록 조회가 새로 필요해 보류, F는 17-07 트리와 충돌.

---

## 빈 상태 · 모바일 · 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 디자인 + 구현 | UI-SPEC·목업에 이어 실제 화면까지 | ✓ |
| 디자인만 | UI-SPEC·목업까지, 구현은 별도 phase | |

**User's choice:** 디자인 + 구현
**Notes:** 빈 상태(시안 G)와 모바일(시안 H·I)은 사용자가 시안을 확인한 뒤 범위 질문에 답했고 수정 요청은 없었다.

---

## Claude's Discretion

- 가이드 완료 기준, 단계 완료 판정 방식, `ReviewRequestPanel` 배치, 세부 문구·색·간격, 좁은 폭에서의 카드 열 수.

## Deferred Ideas

- 최근 작업 목록(시안 E), 홈이 사이드바 대체(시안 F), 독자 지표·토큰 잔액 표시, 상태 기반 추천 카드(시안 A).
