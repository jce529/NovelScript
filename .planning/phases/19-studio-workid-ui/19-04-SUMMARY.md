---
phase: 19
plan: 04
requirements-completed: [WORKHOME-01, WORKHOME-02, WORKHOME-03, WORKHOME-04, WORKHOME-05, WORKHOME-06, WORKHOME-07]
status: complete
executor: claude (orchestrator, sonnet tier) — 브라우저 확인이 필요한 plan이라 Codex 대신 직접 수행
---

# 19-04 요약 — 회귀와 실화면 검증

## 자동 검증 (샌드박스 밖)

- `npm test -- tests/works tests/studio/sidebar-empty-copy.test.ts tests/studio/sidebar-tree.test.ts tests/studio/mobile-workspace.test.ts tests/studio/studio-shell-layout.test.ts tests/kb/sidebar-sections.test.ts tests/world-tree/entrypoints.test.ts` → 9개 파일 81개 통과.
- 플랜 verify 명령(`tests/works/work-home-page.test.ts tests/world-tree/entrypoints.test.ts`) 45개 통과.
- `npx tsc --noEmit` 오류 없음. 변경 파일 eslint 오류 없음(`npm run lint` 전체는 `.claude/worktrees/` 안 사본 때문에 수천 건 실패하므로 변경 파일 단위로 돌렸다).
- 기존 DB 테스트 `tests/studio/schema-smoke.test.ts` 7건이 실패한다. 이번 변경과 무관한 기존 문제로, 메모리에 기록된 "잠금 노드 삭제 충돌 7건"과 같다.

## 실화면 확인 (일회용 DB + `next-dev-disposable` 3100, 테스트 계정·테스트 작품 3개)

시드: 새 작품(회차·설정 0), `달빛 아래의 서재`(설정 1·회차 1 미공개), 긴 제목 작품(설정 1·회차 3 중 공개 2).

| viewport | 상태 | 결과 |
|---|---|---|
| 데스크톱(pane 폭, 약 800px) | 가이드 진행 중 3/4 | 현황 3칸, 4단계 중 4단계 강조 + "열기 →", 작업 화면 4개 접힘. 목업 1과 일치 |
| 데스크톱 | 새 작품 | 현황 숨김, 가이드 1/4에서 2단계 "세계관 보기" 강조, 사이드바 "아직 회차가 없어요"·"아직 설정 문서가 없어요" 표시. 목업 3과 일치(시놉시스 링크 없음) |
| 데스크톱 | 가이드 완료 + 긴 제목·긴 시놉시스 | 현황 3칸, 카드 4개(3열 + 1개), 시놉시스 2줄 말줄임 |
| 375×812 | 가이드 완료 | 현황 2+1, 작업 화면 세로 행 4개(44px 이상), 가로 스크롤 없음(`scrollWidth` 375 = 뷰포트) |
| 375×812 | 새 작품 | 전체 폭 "세계관 보기" 버튼, 44px 미만 링크·버튼 0개, 가로 넘침 요소 0개 |
| 375×812 | `설정집·회차` 탭으로 갔다가 `집필` 탭으로 복귀 | 이동 중에는 트리가 보이고 가이드가 사라지며, 복귀하면 가이드("1 / 4 완료")가 그대로 복원 |

스크린샷은 세션 임시 폴더에만 있고 저장소에는 넣지 않았다.

## 남은 것

- 사용자의 최종 눈 확인(UAT)은 하지 않았다.
- 가이드 4단계의 "열기 →"가 실제로 첫 회차 편집 화면으로 가는지, "세계관 보기"가 `/world`에서 새 문서 생성이 안 되는 점은 사용자 판단 대기.
- 테스트 계정·작품은 일회용 DB에 남아 있다(프로젝트 삭제 시 함께 사라짐).
