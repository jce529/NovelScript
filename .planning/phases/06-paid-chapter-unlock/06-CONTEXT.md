# Phase 6: Paid Chapter Unlock - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Users spend real, purchased tokens to unlock a paid chapter and immediately view its content, combining the proven wallet (Phase 1), paid-chapter metadata (Phase 2), and real payments (Phase 5). Balance is deducted atomically at unlock time, with no double-charge on retry or double-click (PAY-02).

Explicitly NOT in this phase: 대여(시간제 언락), 구독제(월정액 무제한 열람), 결제내역/구매내역 페이지, 작가 정산 현금화(Cash-out) UI. See `<deferred>`.

**Note for planner/researcher:** As of this discussion, Phase 5 (Real Payment Integration) has only a CONTEXT.md/RESEARCH.md/UI-SPEC.md — it has not been executed (0 plans complete per `.planning/STATE.md`). Phase 6 depends on Phase 5's wallet top-up flow and top-up modal actually existing in code before Phase 6 can be planned/executed for real (D-06 below explicitly chains into that modal).

</domain>

<decisions>
## Implementation Decisions

### 언락 트리거 & UX 흐름
- **D-01:** 언락은 1-클릭 즉시차감이 아니라 확인 모달을 한 번 거친다 (예: "30 토큰을 사용해 이 화를 여시겠어요?"). docs/5-4의 "1-Click Buy Now" 권장안 대신, 실수 클릭 방지를 우선한 사용자 선택.
- **D-02:** 유료 회차로 이어지는 CTA(뷰어 하단 "다음화" 버튼, TOC/회차 목록의 잠금 항목)에는 가격을 라벨에 함께 표시한다 — 예: "다음화 (30 토큰)". docs/5-4 §2의 "[다음 화 보기 (10 토큰)]" 패턴을 그대로 채택.
- **D-03:** TOC나 작품 상세의 회차 목록에서 잠긴 회차를 클릭하면, 그 목록 화면을 벗어나지 않고 바로 확인 모달 → 언락까지 마친 뒤에 뷰어로 이동한다 (뷰어에 먼저 진입해서 그 안에서 확인 모달을 띄우는 방식이 아님).
- **D-04:** 언락 성공 시 페이지 리프레시/재요청 없이 같은 화면에서 클라이언트 상태만 갱신해 즉시 본문을 렌더링한다 — docs/5-4의 "흐름이 끊기지 않도록 즉각적으로 렌더링" 요건과 일치.

### 잔액 부족 처리
- **D-05:** 확인 모달에서 잔액이 회차 가격보다 부족하면, 자동으로 Phase 5의 충전 모달을 띄우지 않는다 — 부족 안내 문구와 "충전하기" 버튼을 보여주고, 사용자가 그 버튼을 직접 클릭해야 충전 모달이 열린다. (docs/5-4는 "자동 라우팅"을 언급하지만, 이번 phase는 명시적 클릭 한 단계를 더 두는 쪽을 선택했다.)
- **D-06:** 충전 모달에서 결제가 완료되고 잔액이 크레딧되면(Phase 5의 웹훅 확인 후), 원래 열려고 했던 회차의 확인 모달로 자동으로 돌아와 바로 언락을 이어서 진행할 수 있다 — 사용자가 충전 후 다시 언락 버튼을 찾아 누를 필요 없음.
- **D-07:** 잔액 부족 안내 문구에는 구체적인 부족 토큰 수치를 표시한다 — 예: "10 토큰이 부족해요".

### 소장 모델 (대여/구독 제외)
- **D-08:** Phase 6는 영구 소장 모델만 구현한다 — 한 번 언락한 회차는 시간 제한 없이 해당 계정에 영구히 귀속되고, 언제든 다시 무료로 열람 가능하다.
- **D-09:** 대여(시간제 언락)와 구독제(월정액 무제한 열람)는 이번 phase 범위 밖이다 — 백로그로 이관한다.
  - 대여는 Phase 2가 이미 실행 완료한 "회차당 단일 고정가" 스키마(`chapters.price_tier`, D-20)와 충돌하며, 이를 바꾸려면 이미 커밋된 Phase 2 작업을 다시 열어야 한다.
  - 구독제는 `PROJECT.md`/`REQUIREMENTS.md`가 이미 v1 범위 밖으로 명시했고, `05-CONTEXT.md`에서도 동일하게 제외된 항목이다. 정기결제 인프라 자체가 없다.

### 작가 정산 원장 기록
- **D-10:** 독자가 회차를 언락하면, 지불한 토큰 전액이 그대로 해당 회차를 쓴 작가의 wallet에도 크레딧된다 — 플랫폼 수수료 차감 없이 전액 지급. `apply_wallet_delta()`를 재사용해 원장에 두 건(독자 차감분, 작가 크레딧분)을 기록하는 방식을 전제로 한다.
- **D-11:** 이 크레딧은 순수 원장/잔액 기록일 뿐이다 — 현금화(Cash-out), 정산 UI, 출금 기능은 이번 phase에 포함되지 않는다. `PROJECT.md` Out of Scope의 "토큰 현금 환전(작가 정산)" 제외 결정과 충돌하지 않는다 (작가는 크레딧된 토큰을 Phase 4의 AI 생성 비용에 재사용할 수 있을 뿐, 인출은 불가).

### Claude's Discretion
- 독자 차감 + 작가 크레딧을 하나의 원자적 트랜잭션으로 묶는 정확한 구현 방식 (새 RPC 필요 여부, `reference_type`/`reference_id` 설계) — research/planning에서 확정.
- "누가 어떤 회차를 언락했는지" 추적하는 신규 테이블(예: `chapter_unlocks`)의 정확한 스키마.
- 확인 모달의 정확한 카피/디자인 디테일.
- 더블클릭/재시도 시 멱등성 보장 방식 — 기존 `apply_wallet_delta`의 `unique(wallet_id, reference_type, reference_id)` 제약 재사용을 우선 검토.
- 작가 본인이 자신의 유료 회차를 열람할 때의 처리(무료 열람 허용 여부) — 이번 논의에서 다루지 않음, planner 판단.
- 비로그인 사용자가 잠긴 회차를 클릭했을 때의 처리(로그인 유도) — Phase 3 D-08/D-14/D-17의 로그인 게이팅 선례를 따를 것으로 예상되나 명시적으로 논의되지 않음.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 결제/언락 UX 비전
- `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md` §2 (장바구니 및 구매 액션 분리) — "바로 구매하기(1-Click Buy Now)" 대상에 "웹소설 뷰어에서의 유료 회차 열람"을 명시하고, 잔액 부족 시 토큰 충전소로 자동 라우팅을 언급한다. 이번 phase는 이를 부분 채택했다: 1-클릭 대신 확인 모달(D-01), 자동 라우팅 대신 버튼 클릭(D-05)으로 조정. 뷰어 하단 "[다음 화 보기 (10 토큰)]" CTA 카피 패턴은 D-02의 직접적 출발점.
- `docs/3. 비즈니스 모델 및 사용자 정책.md` §3.1 (로벅스형 단일 가상 경제) — "작가는 독자의 유료 열람...을 통해 토큰을 획득", "토큰이 순환되는 구간(결제→소비→재투자)엔 별도 환전 수수료가 붙지 않는다" — D-10의 전액 크레딧 결정의 직접적 근거.

### 프로젝트 결정 / 요구사항
- `.planning/PROJECT.md` Out of Scope 표 — "토큰 현금 환전(Cash-out, 작가 정산)"은 v1 범위 밖. D-11이 왜 크레딧은 되지만 인출 UI는 없는지 설명하는 근거.
- `.planning/REQUIREMENTS.md` — PAY-02 (이 phase의 리터럴 요구사항). Out of Scope 표의 "PortOne 등 PG 추상화 레이어 제외" 결정은 Phase 5와 동일하게 이 phase에도 적용(직접 Toss 연동만 사용).

### 기존 코드 / 스키마
- `supabase/migrations/0001_init.sql` — `wallets`/`ledger_entries` 테이블과 `apply_wallet_delta()` 함수(`FOR UPDATE` 락 + `unique(wallet_id, reference_type, reference_id)` 멱등성). 언락 시 독자 차감과 작가 크레딧 모두 이 함수를 재사용해야 한다.
- `lib/chapters/actions.ts` — `getPublicChapter`/`listPublicChapters`의 현재 `locked` 판정이 `price_tier !== null`뿐인 전역(사용자 무관) 잠금이라는 점, `PublicChapter`/`PublicChapterListItem` 인터페이스. Phase 6는 이 로직에 "현재 사용자가 이미 언락했는지" 조건을 추가해야 한다.
- `components/reader/viewer-shell.tsx` — 현재 "결제 기능 준비중" 플레이스홀더가 있는 정확한 위치(잠금 렌더링 블록, 73-81행), 하단 이전화/다음화 버튼 위치(D-02 가격 표시가 들어갈 자리, 85-103행).
- `lib/ai/cost.ts` — `KRW_PER_WALLET_TOKEN` 등 기존 토큰 경제 상수 (참고용, 직접 쓰이진 않지만 일관성 확인용).

### 이전 phase 의존성
- `.planning/phases/03-reader-core-reading-loop-no-payment/03-CONTEXT.md` D-06 — "결제 기능 준비중" 잠금 문구는 "Phase 6가 실제 언락 흐름으로 교체할 자리"라고 명시적으로 인계된 지점.
- `.planning/phases/05-real-payment-integration/05-CONTEXT.md` — 충전 모달의 정확한 UX(D-03 진입점, D-04 결제창 방식, D-05 폴링/자동닫힘, D-06 무제한 대기+직접닫기), `apply_wallet_delta` 재사용 패턴. D-06(이 문서)의 "충전 후 원래 언락 모달로 복귀" 흐름은 이 모달을 그대로 재사용/체이닝하는 것을 전제로 한다.
- `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md` D-20 — 고정 가격 티어(10/30/50/100 토큰) 구조. 이번 phase의 "소장 단일가" 결정(D-08/D-09)이 유지해야 할 기존 스키마.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apply_wallet_delta()` RPC — 동시성 안전 + 멱등 차감/크레딧을 이미 보장. 언락 시 독자 차감 + 작가 크레딧 두 건 모두 이 함수를 호출하면 된다.
- Phase 5가 구현할 충전 모달 컴포넌트 — D-06의 "충전 후 원래 언락으로 복귀" 흐름이 이 모달과 언락 확인 모달을 체이닝해야 한다 (Phase 5 실행 완료가 선행 조건).
- `components/reader/viewer-shell.tsx`의 잠금 렌더링 블록, TOC/회차 목록의 잠금 배지 — 확인 모달을 붙일 정확한 지점들이 이미 존재.

### Established Patterns
- `lib/*/actions.ts` Server Actions + `createAdminClient()`로 wallet RLS를 우회하는 패턴(`lib/ai/generate.ts` 선례) — 언락 Server Action도 동일 패턴을 따를 것.
- ownership-scoped 함수 + zod 검증 레이어 패턴(chapters/kb actions에서 반복) — 언락 관련 서버 로직도 이 컨벤션을 따를 것.

### Integration Points
- `lib/chapters/actions.ts`의 `getPublicChapter`/`listPublicChapters` — locked 판정 로직에 "현재 사용자가 이미 언락했는지" 조건 추가 필요 (신규 언락 추적 테이블과 join).
- `components/reader/viewer-shell.tsx` 잠금 블록 → 확인 모달 + 언락 Server Action 연결.
- 회차 목록/TOC 컴포넌트 → 동일한 확인 모달을 재사용, D-03 순서(모달 먼저, 뷰어 이동은 그 다음)로 배치.
- Phase 5가 구현할 충전 모달 → D-06의 체이닝 대상.

</code_context>

<specifics>
## Specific Ideas

- 뷰어 하단 CTA 예시: "다음화 (30 토큰)" — 가격 라벨을 버튼 텍스트에 직접 포함.
- 잔액 부족 안내 문구 예: "10 토큰이 부족해요" + [충전하기] 버튼.
- 작가 크레딧은 독자 지불액 전액, 플랫폼 수수료 없음.

</specifics>

<deferred>
## Deferred Ideas

- **대여(시간제 언락)** — Phase 2가 이미 실행 완료한 회차당 단일 고정가 스키마의 재설계가 필요해 이번 phase 밖. 백로그 후보.
- **구독제(월정액 무제한 열람)** — `PROJECT.md`/`REQUIREMENTS.md`가 이미 v1 범위 밖으로 명시, `05-CONTEXT.md`에서도 동일하게 제외됨. 정기결제 인프라 자체가 없음. 백로그 후보.
- **결제내역/구매내역 페이지** — `05-CONTEXT.md`에서 이미 Claude's Discretion/미정으로 남겨진 항목이며, 이번 phase 논의에서도 다루지 않음.
- **작가 정산 현금화(Cash-out) UI** — `PROJECT.md` Out of Scope. D-10의 크레딧 자체는 포함되지만 인출 기능은 없음.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 06-paid-chapter-unlock*
*Context gathered: 2026-09-08*
