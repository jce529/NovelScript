---
phase: 07-admin-moderation-surface
verified: 2026-09-17T00:00:00Z
documented: 2026-10-04
status: passed_with_deferred
score: 4/4 success criteria verified (실DB + 동시성 + 브라우저 UAT 22/22), 단 사용자 쪽 화면 2건 미관찰
residual:
  - item: "경고 확인이 새로고침 후에도 유지되는지 (브라우저)"
    status: "미관찰 — 자동 테스트만 통과. 제재 대상 계정으로 로그인해야 하는데 관리자 단일 계정은 자기 제재 불가(설계)"
    tracked_in: ".planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md"
  - item: "정지된 사용자 본인 화면 (저장·좋아요·신고·구매 차단 문구, 구매 회차·잔액 유지, 만료 후 복구)"
    status: "미관찰 — 위와 동일"
    tracked_in: ".planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md"
source: "07-07-SUMMARY.md, 07-UAT.md, 07-VALIDATION.md, fixed/07-03~07-07을 근거로 2026-10-04에 정리했다. 이 정리 시점에 테스트를 다시 실행하지는 않았다."
---

# Phase 7 검증 보고서

**목표:** 관리자가 신고된 콘텐츠를 검토하고 조치해, Phase 3 독자 신고와 Phase 4 안전 장치가 연 루프를 닫는다.
**상태:** passed_with_deferred — 성공 기준 4개 모두 충족. 완료 처리는 사용자 결정(2026-09-17)이며, 사용자 쪽 화면 2건은 todo로 추적 중이다.

## 자동·DB 검증 (07-07, 2026-09-17)
| 검증 | 결과 |
|---|---|
| 실DB 4개 admin 스위트 (테스트 Supabase, PostgreSQL 17.6) | 44/44, skipped 0 |
| `concurrency.database.test.ts` (2세션 경쟁 8케이스) ×3회 | 매회 8/8. 구매 함수의 블라인드 체크를 제거한 변이 검사가 실패를 잡음 |
| `npx vitest run tests/admin` | 11 files, 275 passed |
| `npx vitest run --no-file-parallelism` | 52 files, 483 passed, skipped 0 |
| `npx tsc --noEmit` | 통과 |
| 마이그레이션 0006~0009 | 이미 테스트 DB에 적용돼 있어 재적용 대신 라이브 권한·RESTRICTIVE 정책·컬럼 권한을 읽기 전용 점검 |

경쟁 케이스: 동시 처리 경쟁, 늦은 신고, 중복 재시도, 홀더 롤백, 경고/정지 순서 양방향, 결제 후 블라인드, 블라인드 후 결제.

## 브라우저 UAT (07-UAT.md, 22/22 관찰)
1440x900·390x844, 라이트·다크. 관리자 계정은 사용자 본인의 Kakao 계정.

| 영역 | 결과 |
|---|---|
| 접근 차단 (UAT 1~3) | 비로그인·비관리자·없는 신고 모두 404, 응답 HTML에 픽스처·내부 사유 없음 |
| 신고 큐·상세 (4~7) | 대상별 그룹(3건·신고자 3명 등), 오래된 순, 모바일 `dl` 행 렌더링, 상태 필터, 상세에 신고자·작성자 과거 신고·조치 이력 |
| 조치 폼·확인 (8~9) | 사유 비면 제출 차단, 확인 다이얼로그 초기 포커스 취소·Esc로 변경 없이 닫힘 |
| 블라인드·정지·경고 (10~13) | 구매 회차 블라인드(독자에게 본문 DOM·응답 모두 없음), KST 입력 7일 정지가 UTC로 정확히 저장, 정지 중 경고도 기록 |
| 충돌·자기 제재 (14~15) | stale 충돌 안내와 새로고침, 자기 제재는 서버가 거부(문구는 이후 수정) |
| 작가 재검토 (16~18) | 작가 알림→재검토 요청→관리자 해제 흐름 |
| 구매 복원 (19~20) | 직접 해제 후 구매한 독자가 재결제 없이 열람, 지갑·원장·주문·권한 정합 |
| 다크·피드 (21~22) | 다크 모드 가독성, 홈 피드 hydration 불일치 수정 |

## Success Criteria
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | 열린 신고 큐(신고자·대상·사유·시각·상태) | VERIFIED | UAT 4~7, DB 스위트 |
| 2 | 특정 회차 비공개/블라인드 | VERIFIED | UAT 10~11·19~20, blinding DB 스위트, 결제-블라인드 경쟁 |
| 3 | 계정 경고·정지·영구 정지(사유 기록)와 과거 신고·조치 조회 | VERIFIED (관리자 측) | UAT 7·12·13, 감사 기록. ※ 정지·경고를 **받은 사용자 쪽 화면은 미관찰** (residual) |
| 4 | 신고 처리 완료·기각과 메모 | VERIFIED | UAT 6(처리 완료 목록)·14(기각), operations DB 스위트 |

## 요구사항
ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04: 충족 (ADMIN-03의 사용자 쪽 표시는 residual).

## 발견 후 해결된 이슈
| 이슈 | 해결 |
|---|---|
| F-1 "이 회차은" 조사 오류 | `e605d3a` |
| 홈 피드 trending 배지 hydration 불일치 | `23ffc54` |
| `/admin` 빌드 프리렌더 실패 | `fixed/07-03` |
| F-2 자기 제재 안내 문구 | `fixed/07-04` |
| F-3 신고 테스트 잔여물 | `fixed/07-05` |
| 병렬 테스트 DB 타임아웃 | `fixed/07-06` |
| 기존 lint 정리·로그인 이동 | `fixed/07-07` (lint 게이트 `--max-warnings=0`) |

## 알려진 한계
- 테스트 DB에는 UAT 픽스처(`uat-0707-*@novelscript.test`)와 `UAT_GRANT` 50토큰, 사용자 계정의 활성 관리자 권한이 남아 있다 (07-07 Deviations).
- `next build`는 07-07 시점에 돌리지 않았다 (이후 `fixed/07-03`에서 빌드 실패 원인 수정).

## 후속
- residual 2건: 두 번째 OAuth 계정으로 경고·정지를 걸어 확인 → 결과를 `07-UAT.md` §4에 기록하고 이 문서의 `residual`을 지운다.
