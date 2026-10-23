# 수동 검증 게이트 결과 (2026-10-23)

대상: 03-19 · 07-15 · 18-12 · 04-12 · 16-03 · 05-07 · (10-10 · 11-08 · 11-12는 미실행). 환경: 일회용 Supabase(`env.disposable`, ref `anzafnzv…`, 공유 프로젝트 ref `ymudwgso…`와 다름 확인) + `scripts/dev-disposable.mjs`로 고정한 dev 서버(3100). 계정은 `uat-*@novelscript.test`를 admin API로 만들고 세션 쿠키를 주입했다(OAuth 우회).
**이 문서는 에이전트가 수행한 기능 점검의 증거이며 사람 승인(approved)이 아니다. 글자 잘림·디자인·접근성·실기기는 사용자 확인 몫이고, pending 항목은 완료로 보지 않는다.**

## 07-15 관리자 (기능)
PASS: 빈 값 제출 시 첫 입력 포커스 / 블라인드 확인 대화상자 Esc 취소 시 입력 유지 / 확인 버튼 연속 2회 클릭에도 `chapter_blind` 감사 행 1건 / 작가 재검토 요청(`open`) → 관리자 해제(`unblinded`) / 선호작 독자(fan)에게만 `publication_notifications` 1건, 구독만 한 독자는 0건 / fan 화면에 알림 표시, 내부 사유 문자열은 DOM에 없음, 확인 후 `acknowledged_at` 기록과 새로고침 후 유지 / 상태 필터 `?status=all`이 상세 링크·돌아가기 링크에 보존.
관찰: 다른 관리자가 먼저 처리한 신고를 제출하면 화면은 "미처리 신고가 없습니다"로 갱신된다(중복 처리 없음). 전용 stale 안내문을 봤는지는 확인하지 못함 → 문구는 사용자 확인.
PENDING: 1440/390 light/dark·키보드·200% zoom, 이미 구매한 블라인드 회차 재결제 없이 열람(DB suite 범위).

## 03-19 독자 (기능)
PASS: 마지막 화 "다음화" → "마지막 화예요" 다이얼로그, 알림 켜기 → `work_subscriptions` 반영, 이미 구독 시 "알림을 받고 있어요"만 표시하고 해제하지 않음 / 게스트는 진도 저장 호출 없음(`trackChapterOpenAction`만) / 끝까지 스크롤 후 `completed_at` 기록(end_visible_ms 33s) / 설정 5항목(글꼴·모드·크기·여백·줄간격) 쿠키 `ns_viewer` 저장·새로고침 유지, 홈 화면은 영향 없음 / 소장 잔액 부족 시 충전소 모달 1개, 헤더 `+`도 같은 모달, 닫은 뒤 entitlement·주문 0건, 요금제가 0027 시드(100/1000·300/2850·550/5000·1000/9000)와 일치.
관찰: 마지막 화 "다음화"를 좌표로 실제 클릭했을 때 첫 시도에서 다이얼로그가 뜨지 않았고(하단 바가 화면 밖으로 전환 중이었음), JS 클릭은 정상 → 사용자가 실제 마우스·터치로 확인.
PENDING: credit 후 refresh 잔액(결제 필요, 05-07 대기), 드래그·선택 토글, 팝오버 포커스 복귀, 회차 A→B→back·여백 복원, hidden 120초·blind 저장 0, pagehide keepalive, 실제 touch 기기.

## 18-12 세계수 (기능)
PASS: 49/50화 미충족(`발행 49/50화`)·문서 19/20(인물 4/5) 미충족 시 사유 표시 + 가지 치기 버튼 비활성 / 세계수 만들기 → 확장 가지 마법사(0건이면 확정 불가) → 복제 설정의 수정·삭제·이름 변경은 DB가 `world_branch_inherited_immutable`로 거부, 새 설정 추가 후 확정(`world_branches.kind=expand`, `confirmed`), 확정 직후 404 없음 / 자식 재분기도 50화·20문서 동일 조건(자격을 채운 자식에서 `begin_world_branch`·`confirm_world_branch` 성공) / 원본 설정 수정 → `world_branch_notices` 1건, 자식 스냅샷 불변 / 하위 있는 가지 삭제 `world_branch_has_children` 거부 / 비공개 root(S1)·중간(S2)·연속(S3) 부모: 독자 화면은 "부러진 가지·비공개된 본작 자리"로 표시되고 비공개 작품 제목 노출 없음, 발행된 자식은 정상 표시, 작가 화면은 전체(제목·"미발행") / 연표: 연도·메모·새 구간·버튼 이동 저장이 DB에 반영, 이어받은 구간 입력 잠금.
관찰: ① 관리자(비소유자)가 공개 세계수 화면을 열어도 부러진 가지로 보인다(관리자 전체 보기 경로 미확인). ② 작품 소프트 삭제는 `works` 직접 UPDATE가 RLS로 막히고 RPC `soft_delete_world_branch`만 하위 보호를 검사한다. ③ 스튜디오 세계관 설정 화면에서 React 경고 "Each child in a list should have a unique key" 1건(`components/world-tree/world-settings.tsx`, `WorldSettings`).
PENDING: drag, 첫 concurrent 거부, 부모 비발행 시 발행 자식 URL/피드 노출, 375/768/dark·접근성, 300/1000 노드 성능(목표 100ms).

## 04-12 / 16-03 AI 패널 (기능)
PASS: 프리셋 자유형 ↔ 중급자(커스텀 입력 표시/숨김/값 복원) / 작품 시스템 지시 ⚙: 기본 지시 읽기 전용, 추가 지시 저장(`work_ai_instructions`), 다른 회차에서 같은 값, 취소 시 DB 불변, 다른 작품 행 없음 / 서비스 모델 실호출(Gemini 3.5 Flash 서버 키): 응답 수신, 지갑 2000→1999, 원장 `ai_generation` −1(reason `chapter:<id>`), `ai_usage` 1454/12/thoughts 211 토큰, 게이지 "보유 1,999·최근 차감 1"이 DB와 일치 / 설정 문서 대화: 문서 사실(라펠·세레논) 반영 응답, 원장 reason `kb:<nodeId>` / 모바일 폭 360·375·390·768·1023px에서 탭 3개 표시·가로 넘침 없음, 1024·1280px에서 탭 숨김 / 탭 전환(설정집↔집필↔AI 반복)에서 본문 textarea가 같은 노드로 유지되고 미저장 문장·선택 영역 유지, 전환만으로 `ai_usage`·원장 증가 없음 / Jev 자동 분류(실호출, 합성 파일): 카엘→인물, 붉은 항구→장소, 대침몰 사건→사건 제안, 승인 전·취소 후 `kb_nodes` 변화 0, 승인 시 3개가 올바른 폴더·본문으로 저장.
PENDING: BYOK 선택 시 게이지 문구(BYOK 키 필요), 잔액 0·조회 실패 게이지, 초안 삽입 커서 범위·문서 제안 저장의 같은 이름 충돌, 업로드 저장/첨부 모드 DB 대조, 미분류 승인 차단·실제 마우스 DnD, 응답 대기 중 탭 이동, iOS Safari·Android Chrome 실기기.

## 05-07 Toss — 차단
`createTopupOrderAction`이 주문(`ns_…`, 1,000원/100토큰)을 만든 뒤 결제창 호출에서 "결제창을 열지 못했어요" 토스트가 뜬다. 원인: `.env.local`의 `NEXT_PUBLIC_TOSS_CLIENT_KEY`가 결제위젯용 `test_gck_…`인데 `components/payment/use-topup-flow.ts`는 결제창용 `payment()`를 쓰고, Toss SDK는 이 키에 `NOT_SUPPORTED_WIDGET_KEY`("test_ck, live_ck로 시작하는 API 개별 연동 키를 쓰세요")를 반환한다. `TOSS_SECRET_KEY`도 `test_gsk_…`(위젯용)이라 같은 계열이다. → 키 종류를 정해야 한다(API 개별 연동 `test_ck/test_sk` 발급 vs 코드를 결제위젯으로 전환). 결제 입력은 진행하지 않음.

## 미실행
10-10(BYOK 실DB/Vault + UAT 10·11), 11-08 Task 2·11-12 Task 2(BYOK 키 등록이 필요한 UAT): 사용자의 실제 API 키 입력이 필요해 에이전트가 수행하지 않음. 03-20은 문서 재판정(브라우저 게이트 아님).

## 환경 메모
- 계정 전환 도우미: 스크래치패드의 로컬 서버(3199)가 쿠키를 심고 3100으로 리다이렉트한다(쿠키는 포트와 무관하게 localhost 공유).
- 일회용 DB에 `uat-*` 계정·작품, 이전 실패 테스트가 남긴 `테스트 작품`/`cleanup fixture` 신고가 남아 있다(정리: `scripts/cleanup-uat-accounts.mjs`).
- `env.disposable`(점 없음)이 `.gitignore`의 `.env*`에 걸리지 않는다 — 커밋 금지.

## 후속 (2026-10-23 오후)
- Toss 키: 필요한 것은 API 개별 연동 키 한 쌍(`test_ck_` 클라이언트 + `test_sk_` 시크릿)이다. 시크릿 키 옆의 "보안 키"와 머트(상점 ID)는 현재 코드가 쓰지 않는다(`lib/payments/toss.ts`는 시크릿 키 `Basic` 인증만 사용). 사용자가 새 키를 받았다고 했으나 확인 시점의 `.env.local`(마지막 수정 13:28)은 여전히 `test_gck_`/`test_gsk_`였다 → 저장 후 3100 서버 재시작과 앞 8글자·길이 재확인 필요. 3100 서버는 `.env.disposable`이 `.env.local`보다 우선하지만 두 일회용 파일에는 Toss 키가 없다.
- 테스트 수정(미커밋): `tests/world-tree/schema-source.test.ts`(CRLF), `tests/ai/provider-fixture.test.ts`(`next/server` mock), `tests/kb/tree-query.test.ts`(예약어 이름), `tests/payments/payment-flow.database.test.ts`(목 READY 복원). 해당 4개 파일 57개 통과.
- 남은 실패 8건(정리 스크립트 vs 0023 잠금 트리거 7, 0022 번호 중복 1)은 결정 대기 — STATE.md 참조.
