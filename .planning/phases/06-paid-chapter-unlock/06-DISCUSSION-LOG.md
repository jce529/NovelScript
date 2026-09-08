# Phase 6: Paid Chapter Unlock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08
**Phase:** 06-paid-chapter-unlock
**Areas discussed:** 언락 트리거 & 흐름, 잔액 부족 처리, 소장 vs 대여(영구성), 작가 정산 원장 기록

---

## 언락 트리거 & 흐름

| Option | Description | Selected |
|--------|-------------|----------|
| 1-클릭 즉시 차감 | docs/5-4 §2 "바로 구매하기" 그대로 | |
| 확인 모달 1회 거침 | "30 토큰을 사용해 이 화를 여시겠어요?" 확인 후 차감 | ✓ |
| You decide | Claude 판단 | |

**User's choice:** 확인 모달 1회 거침
**Notes:** 실수 클릭 방지 우선.

| Option | Description | Selected |
|--------|-------------|----------|
| 가격을 버튼 라벨에 함께 표시 | "다음화 (30 토큰)" | ✓ |
| "다음화"로 동일하게 표시 | 가격은 확인 모달에서만 표시 | |

**User's choice:** 가격을 버튼 라벨에 함께 표시
**Notes:** docs/5-4의 "[다음 화 보기 (10 토큰)]" 패턴 채택.

| Option | Description | Selected |
|--------|-------------|----------|
| 뷰어로 이동 후, 뷰어 안에서 확인 모달 → 언락 | 뷰어 진입 → 잠금 자리에서 확인 모달 → 언락 성공 시 그 화면에서 본문 노출 | ✓ |
| TOC/목록에서 바로 확인 모달 → 언락 → 그 다음 뷰어로 이동 | 목차를 벗어나기 전에 결제부터 끝냄 | |
| You decide | Claude 판단 | |

**User's choice:** TOC/목록에서 바로 확인 모달 → 언락 → 그 다음 뷰어로 이동
**Notes:** 최종 선택은 두 번째 옵션(질문 제시 순서와 반대로 응답됨) — CONTEXT.md D-03에 반영.

| Option | Description | Selected |
|--------|-------------|----------|
| 같은 화면에서 클라이언트 상태만 갱신 | 새로고침/재이동 없이 즉시 본문 렌더링 | ✓ |
| 서버 재검증을 위해 페이지 리프레시/재요청 | router.refresh 등으로 서버 상태 재확인 | |
| You decide | Claude 판단 | |

**User's choice:** 같은 화면에서 클라이언트 상태만 갱신
**Notes:** docs/5-4의 "흐름이 끊기지 않도록 즉각 렌더링" 요건과 일치.

---

## 잔액 부족 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 자동으로 충전 모달을 바로 띄우기 | docs/5-4 §2 "자동 라우팅" | |
| 부족 안내 문구 + "충전하기" 버튼 클릭 시만 충전 모달 열림 | 명시적 클릭 한 단계 추가 | ✓ |

**User's choice:** 부족 안내 문구 + "충전하기" 버튼
**Notes:** 사용자의 명시적 클릭을 거치는 쪽 선택.

| Option | Description | Selected |
|--------|-------------|----------|
| 충전 완료되면 원래 확인 모달로 돌아와 바로 언락 진행 가능 | 충전→언락 한 흐름으로 이어짐 | ✓ |
| 충전만 끝내고 사용자가 다시 언락 버튼을 눌러야 함 | 두 단계로 분리 | |

**User's choice:** 충전 완료되면 원래 확인 모달로 복귀해 이어서 진행
**Notes:** 사용자가 다시 클릭할 필요 없게.

| Option | Description | Selected |
|--------|-------------|----------|
| 구체 부족 수치 표시 | "10토큰이 부족해요" | ✓ |
| 단순히 "토큰이 부족해요"만 | 구현 단순화 | |
| You decide | Claude 판단 | |

**User's choice:** 구체 부족 수치 표시

---

## 소장 vs 대여(영구성)

| Option | Description | Selected |
|--------|-------------|----------|
| 영구 소장 | 계정에 영구 귀속, 기간 만료 없음 | |
| 기간제 대여 (예: 72시간) | 만료 후 재구매 필요 | |
| 소장+대여 둘 다 제공 (가격 차등) | 카카오페이지/네이버시리즈식 이원화 | |
| **(Other, 자유 응답)** 소장/대여/구독제(구독제 경우 구독기간 동안 무제한 열람) | 세 가지 모델을 모두 포함하자는 제안 | |

**User's initial free-text answer:** "소장/대여/구독제(구독제에 경우 구독기간동안 무제한 열람)"

**Scope creep flagged by Claude:**
- 구독제(월정액)는 `PROJECT.md`/`REQUIREMENTS.md`가 v1 범위 밖으로 이미 명시했고, `05-CONTEXT.md`에서도 동일하게 제외된 항목. 정기결제 인프라 자체가 없음.
- 대여(시간제)는 Phase 2가 이미 실행 완료한 "회차당 단일 고정가" 스키마(`chapters.price_tier`)와 충돌 — 재설계 시 이미 커밋된 Phase 2 작업을 다시 열어야 함.
- 둘 다 백로그로 이관 제안, Phase 6는 영구 소장으로 좁히자고 재확인 요청.

**Follow-up question:**

| Option | Description | Selected |
|--------|-------------|----------|
| 예, Phase 6는 영구 소장만. 대여/구독제는 백로그로 | 원래 phase 범위(PAY-02)로 좁힘 | ✓ |
| 아니오, 대여(시간제)는 Phase 6에 포함하고 싶음 | Phase 2 가격 스키마 변경 필요, 범위 확대 | |

**User's final choice:** 예, Phase 6는 영구 소장만. 대여/구독제는 백로그로.

---

## 작가 정산 원장 기록

| Option | Description | Selected |
|--------|-------------|----------|
| 예, 작가 지갑에도 크레딧 | 독자 차감분만큼 작가 wallet에도 `apply_wallet_delta`로 크레딧 | ✓ |
| 아니오, 독자 지갑만 차감하고 작가 정산은 이번 phase에서 다루지 않음 | 가장 단순한 최소 범위 해석 | |

**User's choice:** 예, 작가 지갑에도 크레딧
**Notes:** 정산/현금화 UI 자체는 v1 범위 밖이라는 점은 유지.

| Option | Description | Selected |
|--------|-------------|----------|
| 전액 그대로 작가에게 | docs/3.1의 "토큰↔토큰 재투자 구간엔 수수료 없음" 원칙과 일치 | ✓ |
| 플랫폼 수수료를 뗀 일부만 지급 | 수수료율을 새로 정해야 함, docs에 명시된 수치 없음 | |

**User's choice:** 전액 그대로 작가에게

---

## Claude's Discretion

- 독자 차감 + 작가 크레딧을 하나의 원자적 트랜잭션으로 묶는 정확한 구현 방식(새 RPC 필요 여부, `reference_type`/`reference_id` 설계)
- "누가 어떤 회차를 언락했는지" 추적하는 신규 테이블(예: `chapter_unlocks`)의 정확한 스키마
- 확인 모달의 정확한 카피/디자인 디테일
- 더블클릭/재시도 시 멱등성 보장 방식 (기존 `apply_wallet_delta`의 unique 제약 재사용 우선 검토)
- 작가 본인이 자신의 유료 회차를 열람할 때의 처리 (무료 열람 허용 여부) — 논의에서 다루지 않음
- 비로그인 사용자가 잠긴 회차를 클릭했을 때의 처리 (로그인 유도) — 논의에서 다루지 않음, Phase 3 선례를 따를 것으로 예상

## Deferred Ideas

- 대여(시간제 언락) — Phase 2 가격 스키마 재설계 필요, 백로그 후보
- 구독제(월정액 무제한 열람) — v1 범위 밖, 정기결제 인프라 없음, 백로그 후보
- 결제내역/구매내역 페이지 — Phase 5에서도 미정으로 남겨짐, 이번 phase도 다루지 않음
- 작가 정산 현금화(Cash-out) UI — PROJECT.md Out of Scope
