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
  - 구독제는 정기결제(빌링) 인프라 자체가 없어 v1엔 구현하지 않는다. 지금 당장 개발하지 않는 기능으로, `PROJECT.md` Out of Scope와 `REQUIREMENTS.md` v2 Requirements(**PAY-04**, 2026-09-08 추가)에 명시적으로 등재해 v1 핵심 루프 검증 이후 별도 마일스톤에서 재검토할 후보로 남긴다. (2026-09-08 amendment: 이전 버전은 "이미 명시했다"고 인용했으나, 실제로는 이번 phase 논의를 계기로 두 문서에 새로 등재한 것 — 아래 `<scope_note>` 참고.)

### 작가 정산 원장 기록
- **D-10 (amended 2026-09-08, 잠정 수치):** 독자가 회차를 언락하면, 지불한 토큰의 **90%**가 해당 회차를 쓴 작가의 wallet에 크레딧되고, 나머지 **10%**는 플랫폼 수수료로 남는다. 근거: 충전 시 이미 부여되는 대량구매 할인(Phase 5 D-01, 최대 10%)과 Toss PG 카드수수료(~3%대)로 인해 "구매→작가 크레딧"이라는 한 번의 환전 구간에서도 플랫폼 마진이 이미 깎여 있고, 크레딧된 토큰이 추후 Cash-out 등으로 재환전될 가능성까지 고려하면 소폭의 수수료를 두는 편이 지속가능하다는 사용자 판단. Patreon(~8%)/Gumroad(~10%) 등 유사 크리에이터 플랫폼 수수료율과 비슷한 수준으로 90/10을 채택.
  - **⚠️ 이 90/10 비율은 잠정(provisional) 수치다.** 실제 PG 수수료 확정치, 운영 데이터, 작가 반응 등을 반영해 언제든 재조정될 수 있으며, 확정된 최종값이 아니다. Planning/구현 시점에 이 비율이 바뀌어도 되도록 상수 하나(`AUTHOR_CREDIT_RATE` 등)로 격리해 구현할 것 — 하드코딩 다발 금지.
  - `apply_wallet_delta()`를 재사용해 원장에 두 건(독자 차감분 100%, 작가 크레딧분 90%)을 기록하는 방식을 전제로 한다. 나머지 10%는 별도 플랫폼 계정으로 크레딧할지, 단순히 미크레딧(수수료로 소멸)으로 처리할지는 research/planning에서 확정 (Claude's Discretion 참고).
- **D-11:** 이 크레딧은 순수 원장/잔액 기록일 뿐이다 — 현금화(Cash-out), 정산 UI, 출금 기능은 이번 phase에 포함되지 않는다. `PROJECT.md` Out of Scope의 "토큰 현금 환전(작가 정산)" 제외 결정과 충돌하지 않는다 (작가는 크레딧된 토큰을 Phase 4의 AI 생성 비용에 재사용할 수 있을 뿐, 인출은 불가). 이 원칙은 D-10의 잠정 비율이 나중에 조정되더라도 유지된다.

### Claude's Discretion
- 독자 차감 + 작가 크레딧을 하나의 원자적 트랜잭션으로 묶는 정확한 구현 방식 (새 RPC 필요 여부, `reference_type`/`reference_id` 설계) — research/planning에서 확정.
- "누가 어떤 회차를 언락했는지" 추적하는 신규 테이블(예: `chapter_unlocks`)의 정확한 스키마.
- 확인 모달의 정확한 카피/디자인 디테일.
- 더블클릭/재시도 시 멱등성 보장 방식 — 기존 `apply_wallet_delta`의 `unique(wallet_id, reference_type, reference_id)` 제약 재사용을 우선 검토.
- 작가 본인이 자신의 유료 회차를 열람할 때의 처리(무료 열람 허용 여부) — 이번 논의에서 다루지 않음, planner 판단.
- 비로그인 사용자가 잠긴 회차를 클릭했을 때의 처리(로그인 유도) — Phase 3 D-08/D-14/D-17의 로그인 게이팅 선례를 따를 것으로 예상되나 명시적으로 논의되지 않음.
- D-10의 미크레딧 10%를 어디로 보낼지(플랫폼 전용 wallet vs. 단순 미기록) — research/planning에서 확정.

### 로그인 후 복귀 (2026-09-08 추가)
- **D-12:** 비로그인 사용자가 잠긴(유료) 회차를 클릭했을 때, 로그인 유도 토스트만 띄우고 끝내지 않는다 — 이번 phase 범위에서 `/login`에 복귀(return-path) 파라미터를 추가해, 로그인 완료 후 원래 보려던 회차(또는 그 확인 모달)로 자동 복귀시킨다. (기존 06-RESEARCH.md는 "`/login`이 복귀 파라미터를 지원하지 않아 자동 복귀는 약속하지 않는다"고 현재 한계를 그대로 수용했으나, 사용자가 이번 phase에서 직접 해결하기로 확정함 — auth 쪽 변경이 포함되므로 research 갱신 필요.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 결제/언락 UX 비전
- `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md` §2 (장바구니 및 구매 액션 분리) — "바로 구매하기(1-Click Buy Now)" 대상에 "웹소설 뷰어에서의 유료 회차 열람"을 명시하고, 잔액 부족 시 토큰 충전소로 자동 라우팅을 언급한다. 이번 phase는 이를 부분 채택했다: 1-클릭 대신 확인 모달(D-01), 자동 라우팅 대신 버튼 클릭(D-05)으로 조정. 뷰어 하단 "[다음 화 보기 (10 토큰)]" CTA 카피 패턴은 D-02의 직접적 출발점.
- `docs/3. 비즈니스 모델 및 사용자 정책.md` §3.1 (로벅스형 단일 가상 경제) — "작가는 독자의 유료 열람...을 통해 토큰을 획득", "토큰이 순환되는 구간(결제→소비→재투자)엔 별도 환전 수수료가 붙지 않는다" — D-10의 "크레딧이 발생한다"는 방향성의 근거. 다만 D-10(amended)은 이 문서의 "수수료 없음" 원칙에서 한 걸음 벗어나 90/10 잠정 수수료를 두기로 했다 — 충전 시 이미 반영되는 대량구매 할인 및 PG 수수료를 고려한 사용자 판단이며, 이 doc과의 불일치는 의도된 것.

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

### ⚠️ Unresolved: 유료 본문 접근 제어 — 방향 미확정, 후속 리서치 필요 (2026-09-08 추가)

`06-RESEARCH.md`(2026-09-08, Codex 리서치)가 짚은 보안 갭: 현재 `chapters_public_read` RLS는 발행된 회차 **행 전체**(메타데이터+본문)를 `anon`/`authenticated`에 노출한다. `getPublicChapter()`가 앱 코드에서 `content: locked ? null : data.content`로 가리는 것은 UI 마스킹일 뿐, Supabase Data API를 직접 호출하면(공개된 anon key로 누구나 가능) 유료 본문을 그대로 읽을 수 있다 — 이미 라이브 상태인 문제다.

**목표(기능 자체):** "작가는 자기 회차 본문에 항상 무제한 접근, 독자는 무료 회차이거나 본인이 언락한 유료 회차만 본문 접근"을 DB 권한 수준에서 강제한다. 이 규칙은 반드시 **행(어느 회차) + 컬럼(content)이 동시에 조건부**여야 하는데, Postgres RLS는 행 단위(행이 보이면 모든 컬럼이 보임)만, 컬럼 GRANT/REVOKE는 역할 단위 전역(어느 행인지 구분 못함)만 가능해서 단순 조합으로는 안 풀린다.

**이번 대화에서 나온 후보 접근(우열 미정, 다음 리서치가 비교·검증할 것):**
- (A) 컬럼 GRANT 회수 + `SECURITY DEFINER` 조건부 read RPC(`get_public_chapter()` 등) — `06-RESEARCH.md`의 기존 제안. 단, 이 RPC는 발행된 회차만 대상으로 설계돼 있어 Studio 초안(미발행) 편집 읽기 경로(`app/studio/[workId]/chapters/[chapterId]/actions.ts:13-27`, `getChapterAction`)를 대체하지 못한다 — 이 경로에 대한 별도 owner-draft 읽기 설계가 빠져 있음.
- (B) `content`를 별도 테이블(예: `chapter_bodies`)로 분리하고 그 테이블에만 RLS를 걸어 "owner는 무제한, reader는 무료/언락 조건부"를 정책 하나로 표현 — RPC 없이 일반 SELECT로 작동하고 Studio 초안 읽기 문제도 자동 해결되지만, `content` 컬럼을 참조하는 기존 읽기/쓰기 경로 전부(`getChapterAction`, `saveChapterContentAction`, `createChapter`, `getPublicChapter`, `listPublicChapters` 등)를 join/별도 쿼리로 바꿔야 하는 더 큰 마이그레이션.
- (C) 그 외 대안(예: `security_invoker` 뷰로 컬럼 마스킹 등) — 아직 검증 안 됨.

**다음 리서치 pass가 답해야 할 것:**
1. Studio 초안(미발행) 읽기 경로를 정확히 어떻게 처리할지 (A/B/C 각각에서).
2. 세 접근의 마이그레이션 범위(손대는 파일 수), 기존 패턴과의 정합성(`increment_chapter_view` 같은 기존 SECURITY DEFINER 선례 등), 성능/유지보수성 비교.
3. D-12(로그인 후 복귀)가 이 문제와 별개로 `/login` 쪽에 미치는 영향 범위.

**사용자 지침 (2026-09-08):** 지금 이 방향을 확정하지 않는다 — 위 항목들을 목적(기능) 중심으로 리서치한 뒤, 그 결과를 보고 사용자가 직접 적용 방식을 선택한다. Planner는 이 섹션이 해소되기 전에는 접근 제어 마이그레이션을 임의로 확정하지 말 것.

</code_context>

<specifics>
## Specific Ideas

- 뷰어 하단 CTA 예시: "다음화 (30 토큰)" — 가격 라벨을 버튼 텍스트에 직접 포함.
- 잔액 부족 안내 문구 예: "10 토큰이 부족해요" + [충전하기] 버튼.
- 작가 크레딧은 독자 지불액의 90% (플랫폼 수수료 10%) — **잠정 수치, 확정 아님** (D-10 amended).

</specifics>

<deferred>
## Deferred Ideas

- **대여(시간제 언락)** — Phase 2가 이미 실행 완료한 회차당 단일 고정가 스키마의 재설계가 필요해 이번 phase 밖. 백로그 후보.
- **구독제(월정액 무제한 열람)** — 정기결제 인프라 자체가 없어 지금 당장 개발하지 않는다. `PROJECT.md` Out of Scope와 `REQUIREMENTS.md` **PAY-04**(v2 Requirements, 2026-09-08 신규 등재)에 "나중에 개발할 후보 기능"으로 명시적으로 기록됨. 백로그 후보.
- **결제내역/구매내역 페이지** — `05-CONTEXT.md`에서 이미 Claude's Discretion/미정으로 남겨진 항목이며, 이번 phase 논의에서도 다루지 않음.
- **작가 정산 현금화(Cash-out) UI** — `PROJECT.md` Out of Scope. D-10의 크레딧 자체는 포함되지만 인출 기능은 없음.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

<scope_note>
## Scope Note (2026-09-08 amendment, same-day follow-up)

이 CONTEXT.md를 다른 기획 SSOT(PROJECT.md/REQUIREMENTS.md/ROADMAP.md/Phase 2·3·5 CONTEXT.md)와 대조한 결과를 바탕으로 사용자가 두 가지를 재조정했다:

1. **D-10 작가 크레딧 비율 확정 (잠정 수치).** 최초 논의에서는 "전액 지급"으로 잠정 결정됐으나 사용자가 "전액인지는 아직 논의의 과정이 필요할 것 같다"며 일단 미정으로 되돌렸다. 이후 같은 날 재논의를 거쳐 **90%(작가) / 10%(플랫폼 수수료)** 로 확정했다 — 다만 사용자가 이 수치를 "임시 수치"라고 명시했으므로, D-10/REQUIREMENTS.md/ROADMAP.md 모두 90/10을 못박되 "잠정(provisional), 향후 재조정 가능"이라는 꼬리표를 함께 달아두었다. 구현 시 `AUTHOR_CREDIT_RATE` 같은 단일 상수로 격리해 나중에 값만 바꿔도 되게 할 것.
2. **구독제(월정액)를 "나중에 개발할 기능"으로 명시적으로 등재.** 기존 D-09는 "PROJECT.md/REQUIREMENTS.md가 이미 명시했다"고 인용했지만 실제로는 두 문서 어디에도 명시적 배제 항목으로 없었다(요구사항 부재로 인한 암묵적 배제였을 뿐). 이번에 `PROJECT.md` Out of Scope 표와 `REQUIREMENTS.md` v2 Requirements(신규 **PAY-04**)에 "지금은 개발하지 않고, v1 이후 재검토할 후보 기능"으로 명시적으로 추가해 인용을 실제와 일치시켰다.

**Cross-doc sync 완료 여부:**
- `REQUIREMENTS.md` — PAY-02 문구에 작가 크레딧 90/10(잠정) 반영, PAY-04(구독제) 신규 등재 ✓
- `PROJECT.md` — Out of Scope 표에 구독제 행 추가 ✓
- `ROADMAP.md` — Phase 6 Success Criteria에 작가 크레딧 90/10(잠정) 항목 반영 ✓
- `05-CONTEXT.md` — 수정하지 않음 (Phase 5 자체 결정에는 영향 없음; Phase 5 Deferred Ideas의 구독제 언급은 그대로 유효)

**2026-09-08 두 번째 후속 수정:** 위 1번 항목의 "비율 미정" 상태를 사용자가 다시 논의해 **90/10으로 확정**했다(같은 세션, 같은 날). 단, 사용자가 "해당 수치는 임시수치"라고 명시적으로 요청해 확정치가 아니라 "잠정 확정(provisional-but-current)" 상태로 문서화했다 — 즉 planner는 이 90/10을 실제 구현 기본값으로 써도 되지만, 상수로 격리해 나중에 값 하나만 바꿔도 되도록 구현해야 한다.
</scope_note>

---

*Phase: 06-paid-chapter-unlock*
*Context gathered: 2026-09-08*
*Amended: 2026-09-08 — D-10 (작가 크레딧 비율 미정으로 되돌림), D-09 (구독제 명시적 등재 반영)*
*Amended (2nd pass): 2026-09-08 — D-10 작가 크레딧 비율 90%/10%(플랫폼 수수료)로 확정, 단 잠정 수치로 표기 — see Scope Note above*
