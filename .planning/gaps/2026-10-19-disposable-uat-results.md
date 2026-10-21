# 일회용 DB UAT 결과 (2026-10-19)

대상: 03-19 · 07-15 · 18-12. 환경: 일회용 Supabase(`.env.disposable`, ref `anzafnzv…`, 공유 프로젝트와 다름 확인) + `scripts/dev-disposable.mjs`로 고정한 dev 서버(3100). 계정은 `@novelscript.test` 테스트 계정을 admin API로 만들고 세션 쿠키를 주입했다(OAuth 우회).
**이 문서는 에이전트가 수행한 범위의 증거이며 사람 승인(approved)이 아니다. pending 항목은 완료로 보지 않는다.**

## 실DB suite (skipped 0)
- 0024~0036을 일회용 DB에 적용, 03-19 · 07-15 · 18-12 DB suite 전부 통과 (`READING_STATE_DB_TEST=1 COMPLETION_DB_TEST=1 WTREE_BRANCH_RACE_SCHEMA_COMMIT=1`).
- 테스트 결함 수정: timeline 픽스처 uuid 추론·`::text::jsonb`·단일 트랜잭션 deferred 복원, branching 상속 구간 위치·소유자 롤 soft delete.

## 브라우저에서 발견·수정한 실제 결함
| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| 1 | 375px에서 홈이 1152px로 렌더링(가로 3배), 작품 상세는 `main` 302px로 줄어듦 | `body`가 flex-col인데 `main`이 `mx-auto`만 있어 stretch 안 됨 → fit-content가 슬라이더 min-content로 커짐 | `app/page.tsx`, `app/works/[workId]/page.tsx`(2곳), `…/world-tree/page.tsx`에 `w-full` |
| 2 | 어떤 회차도 완독 처리 안 됨 (`end_visible_ms`=0) | 끝 센티넬이 하단 56px 안전 영역 안에서 완전히 보여야 하는데 `main` 하단 패딩이 `py-8`(32px) | `components/reader/viewer-shell.tsx` `pb-24`. 수정 후 센티넬 35s 가시, `completed_at` 최소 시간(30s)에 한 번만 기록 |
| 3 | 가지 확정 성공 직후 화면이 404 | 확정 액션이 `?draft=` URL을 revalidate → 이미 확정된 draft를 `invalid`로 보고 `notFound()` | `app/studio/[workId]/world/page.tsx`: 자기 월드의 확정 자식은 `resumeDraft=null`로 렌더. `entrypoints.test.ts` 계약 갱신(타 월드 확정 가지는 계속 404) |

위 3건은 아직 `bugs/` 문서(bug-plan/complete)로 정식화하지 않았다.

## 03-19 브라우저
PASS: 홈 헤더 2단+서브행, 4구역 순서(이어읽기·주간랭킹·루키 쿼터존·명예의 전당) / 상세 4탭·"집계 중" 2개·상단 신고·모바일 전역 헤더 숨김·10개 페이지네이션 / 뷰어 본문 우선·메뉴(홈·목차·보기 설정·댓글 준비 중 비활성·다음화) / 진도 5초 POST·스크롤 비율 저장·재접속 복원(0.534) / 잠긴 회차 저장 0 / 소장 부족 → 한 모달(충전소), 닫은 뒤 자동 구매 없음.
PENDING: 헤더 `+` 모달 경로, 설정 5항목·쿠키·OS 다크 전환, 드래그·선택 토글, 팝오버/ESC/focus 복귀, 회차 A→B→back·목차 이동·여백 복원, guest/hidden 120초/blind 저장 0, pagehide keepalive, 마지막 화 다이얼로그·구독, credit 후 refresh 잔액, 실제 touch 기기.

## 07-15 브라우저
PASS: 관리자 3탭(신고/작가 재검토/제재 이력)·상태 필터 / 비관리자 `/admin`·상세 404 / 기간 정지 프리셋 1·7·30일, 종료 시각 시간대+ISO 표기가 DB 값과 일치 / 확인 대화상자(구매 콘텐츠 유지 안내) / 30→1일 단축·1→7일 연장·해제가 lift+suspension 이력(seq 1~6)·프로필 캐시·감사 action과 일치 / 정지 중 쓰기 RLS 차단, 해제 후 복구 / 빈 값 제출 시 첫 입력 포커스.
PENDING: 선호작 독자 공개 알림 브라우저 확인(DB suite는 통과), 블라인드/재검토 흐름, 작품·회차 필터 혼합·URL 보존, Esc 취소·pending 중복 차단·stale 안내, 1440/390 light/dark·키보드·200% zoom.

## 18-12 브라우저
PASS: 작품 상세 세계관 탭 통합(트리/목록·크게 보기·스튜디오 진입) / 자격 현황 서버 기준 표시(발행 50/50·문서 20/20·인물 5/5·장소 3/3·사건 3/3) / 세계수 만들기 → 본가지·첫 시대 구간·원작 열매 / If 가지 마법사: 변경 0건이면 확정 차단, 수정 1건 인식 → 변경 확인 → 제목·시점 → 확정(시대 구간 3개) / 부모 비발행 시 독자에게 "부러진 가지·비공개된 본작 자리"(부모 제목 없음), 발행 자식 정상·스냅샷 고정 표시, 재발행 시 복원.
PENDING: 49/50화·문서 부족 상태 화면, 블라인드 부모 카피, expand 가지·자식 재분기, 연표 편집(drag·버튼·memo·inherited 잠금), 원본 수정 후 notice, 삭제 금지 UI, 비공개 root/중간/연속 부모, 375/768/desktop·dark 접근성, 300/1000 노드 성능 측정. (KB 문서 수정은 편집기 UI 대신 작가 권한 DB 갱신으로 대체했다.)

## 자동 게이트
단위 2,517개(161 파일) 통과, `tsc --noEmit` 오류 0. `npm run lint`의 오류 6건은 모두 `.claude/worktrees/*` 아래 기존 파일. `npm run build`는 실행 중인 dev 서버와 `.next`를 공유해 실행하지 않음.

## 환경 참고
- 브라우저 패널이 가려지면 `requestAnimationFrame`이 멈춰 복원·애니메이션 관련 UI가 오동작한 것처럼 보임(진도 비율 0 등). 이동 직후 스크린샷으로 깨운 뒤 측정함.
- 일회용 DB에 테스트 계정·작품이 남아 있음(정리: `scripts/cleanup-uat-accounts.mjs`).
