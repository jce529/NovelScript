---
phase: 06
slug: paid-chapter-unlock
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-15
---

# Phase 6 — Validation Strategy

## Test Infrastructure
| Property | Value |
|---|---|
| Framework | Vitest 4, PostgreSQL integration |
| Config | vitest.config.ts |
| Quick run | npx vitest run tests/commerce/actions.test.ts |
| DB run | npx vitest run tests/commerce/database.test.ts |
| Regression | npx vitest run tests/commerce tests/viewer tests/reader tests/chapters |
| Static | npx tsc --noEmit |
| Environment | SUPABASE_DB_URL, Supabase test credentials, Phase 5 environment for real top-up |

## Sampling Rate
후속 코드 수정 시 해당 단위 테스트와 TypeScript 검사.
phase 종료 전 실제 SQL/RLS·동시성·브라우저 구매 검증.
이번 문서 변경에서는 기존 앱 검사를 재실행하지 않는다.

## Verification Map
개별 GSD 실행 계획은 아직 없다. 아래는 최신 구현의 검증 대상이며 완료된 task 목록이 아니다.

| Target | Requirement | Test | Current Evidence |
|---|---|---|---|
| 입력·오류·권한 서비스 | PAY-02 | tests/commerce/actions.test.ts | 이전 11개 통과 |
| sparse/free/snapshot/multi-item | PAY-02 | tests/commerce/database.test.ts | 작성됨, 미실행 |
| 멱등성·권한 INSERT 실패 rollback | PAY-02 | tests/commerce/database.test.ts | 작성됨, 미실행 |
| 타인 권한·본문 직접 조회·지갑 위조 | PAY-02 | tests/commerce/database.test.ts | 작성됨, 미실행 |
| 기간·회수·작품 범위·작가 초안 | PAY-02 | tests/commerce/database.test.ts | 작성됨, 미실행 |
| 여러 실제 연결의 경쟁 구매 | PAY-02 | 향후 동시성 테스트 | 미작성 |
| 작가 90/10 원자적 정산 | PAY-02 | 후속 정산 구현 시 추가 | 기능 미구현 |

## Wave 0 Requirements
- [ ] 사용자가 테스트 실행을 재개할 때 테스트 DB와 인증 환경 준비.
- [ ] 공유 실제 데이터를 건드리지 않는 동시성 fixture 준비.
- [ ] 기존 DB 테스트는 순차 경쟁 주문 검사이므로 별도 연결 동시성 검사를 추가.
- [ ] 정산 구현 전 작성할 테스트 범위: 수취 작가·비율·금액 snapshot, 재지급 방지, 실패 시 전체 rollback.

## Manual-Only Verifications
| Behavior | Requirement | Steps |
|---|---|---|
| 소장·본문 표시 | PAY-02 | 유료 회차에서 소장 버튼 → 본문 확인 → 재방문 추가 차감 없음 |
| 잔액 부족 | PAY-02 | 부족한 지갑으로 구매 → 오류·무차감·재시도 |
| 공개/무료/작가 경로 | PAY-02 | 무료 회차·비공개 회차·자기 작품 편집 확인 |
| 실충전 구매 | PAY-02 | Phase 5 완료 후 검증된 잔액 증가 → 구매 확인 |
| 정산 | PAY-02 | 후속 구현 후 독자/작가 원장과 fee 대조 |

## Validation Sign-Off
- [ ] SQL/RLS 실제 통과.
- [ ] 실제 다중 연결 동시성 통과.
- [ ] 현재 UI/E2E 검증.
- [ ] 정산 구현 및 검증.
- [ ] Phase 5 연결 검증.
- [ ] skip과 성공을 분리해 VERIFICATION 갱신.

Approval: pending
