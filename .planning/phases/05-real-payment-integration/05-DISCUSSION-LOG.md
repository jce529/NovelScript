# Phase 5: Real Payment Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 05-real-payment-integration
**Areas discussed:** 토큰 충전 상품 구성, 충전 진입 및 결제중 UX, 결제 실패·취소·미확정 처리

---

## 논의 영역 선택

사용자에게 제시된 4개 후보 중 3개 선택: 토큰 충전 상품 구성 / 충전 진입 및 결제중 UX / 결제 실패·취소·미확정 처리.
**선택되지 않음:** Toss 연동 환경/자격 증명 (STATE.md Blockers에 이미 기록된 이슈 — CONTEXT.md canonical_refs에 미해결 리스크로 별도 플래그).

---

## 토큰 충전 상품 구성

| Option | Description | Selected |
|--------|-------------|----------|
| 기획서 예시 2단계 (100/1,000원, 550/5,000원) | 가장 빠른 구현 | |
| 3~4단계로 확장 (예: 100/300/550/1,000토큰) | 가격대를 더 넓게 커버 | ✓ |
| 직접 지정 | 자유 입력 | |

**User's choice:** 3~4단계로 확장

| Option | Description | Selected |
|--------|-------------|----------|
| 100/300/550/1,000토큰 → 1,000/2,850/5,000/9,000원 | 기준가 10원/토큰에서 시작해 단계별 5%→9.1%→10% 할인 | ✓ |
| 100/300/550/1,000토큰 → 990/2,900/4,900/8,900원 (심리적 가격) | 990/900 끝자리 관습 | |
| 직접 지정 | | |

**User's choice:** 100/300/550/1,000토큰 → 1,000/2,850/5,000/9,000원

| Option | Description | Selected |
|--------|-------------|----------|
| 고정 4팩만 제공 | 복잡도 최소, 가격 정책 일관 | ✓ |
| 고정 4팩 + 자유금액 입력 허용 | 유연하지만 할인율 규칙 추가 필요 | |

**User's choice:** 고정 4팩만 제공 (자유금액 없음)

**Notes:** 다음 영역으로 진행 결정.

---

## 충전 진입 및 결제중 UX

| Option | Description | Selected |
|--------|-------------|----------|
| AccountPanel 토큰 영역에 '+' 버튼 → 모달 오픈 | 기획서 GNB 패턴과 일치 | ✓ |
| 별도 페이지(/account/charge)로 이동 | 구현 단순, 모바일 안정적 | |

**User's choice:** AccountPanel '+' 버튼 → 모달 오픈

| Option | Description | Selected |
|--------|-------------|----------|
| Toss 결제창 팝업/리다이렉트 (requestPayment) | 구현 간단, PROJECT.md 기존 결정과 일치 | ✓ |
| 결제 위젯을 모달 안에 인라인 임베드 | 페이지 이동 없음, 구현 복잡도 높음 | |

**User's choice:** Toss 결제창 팝업/리다이렉트 (requestPayment)

| Option | Description | Selected |
|--------|-------------|----------|
| 모달에 스피너 + 자동 폴링으로 잔액 갱신 대기, 완료 시 자동 닫힘 | 대부분 수 초 내 웹훅 도착 | ✓ |
| 모달 즉시 닫고 토스트만, 다음 페이지 로드 시 자연히 갱신 | 구현 가장 간단 | |

**User's choice:** 모달에 스피너 + 자동 폴링, 완료 시 자동 닫힘

| Option | Description | Selected |
|--------|-------------|----------|
| 약 15초 후 안내 문구로 전환 후 모달 닫기 허용 | 무한 대기 방지 | |
| 타임아웃 없이 직접 닫기 버튼만 제공 (무제한 대기) | 단순하지만 오래 열어둘 수 있음 | ✓ |

**User's choice:** 타임아웃 없이 직접 닫기 버튼만 제공

**Notes:** 다음 영역으로 진행 결정.

---

## 결제 실패·취소·미확정 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 모달이 티어 선택 화면으로 되돌아가고 "결제가 취소되었어요" 토스트 | 재시도 쉬움 | ✓ |
| 모달이 닫히고 아무 안내 없음 | 가장 간단하지만 혼란 가능 | |

**User's choice:** 모달이 티어 선택 화면으로 되돌아가고 토스트

| Option | Description | Selected |
|--------|-------------|----------|
| 서버측 로깅/알림만 (관리자 수동 확인 후 보상), 사용자 화면엔 노출 안함 | 베타 규모에 적합, 돈은 이미 안전(Toss 결제 성공) | ✓ |
| 자동 재시도/보상 파이프라인을 이번 phase에 구축 | 더 견고하지만 범위 확대 | |

**User's choice:** 서버측 로깅/알림만, 사용자 화면 노출 안함

**Notes:** 충분히 논의됨 — CONTEXT.md 작성으로 진행.

---

## Claude's Discretion

- Toss `orderId` 생성 규칙 / `ledger_entries.reference_type`·`reference_id` 매핑
- 폴링 간격 및 폴링 대상 엔드포인트
- Toss 결제 승인 API 서버측 검증 절차(승인 confirm 호출, 웹훅 서명 검증 방식)
- 결제내역(구매내역) 페이지 노출 여부

## Deferred Ideas

- 웹훅 실패 시 자동 재시도/보상 파이프라인
- 월정액 구독제(정기결제) 토큰 상품 (docs/5-4, v1 범위 밖)
- 결제내역(구매내역) 페이지
