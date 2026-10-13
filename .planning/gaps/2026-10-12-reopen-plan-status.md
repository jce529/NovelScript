# 재개 phase 보완 plan 진행 현황 (2026-10-12)

planner = Codex `gpt-6.1-sol`(medium), researcher = Haiku, checker = Sonnet. 마이그레이션 예약: P2 0022–23 / P3 0024–25 / P4 0026 / P5 0027–28 / P7 0029 / P11 0030 / P16 0031 / P18 0032–35 / P10 0036 (현재 마지막 0021). 커밋은 하지 않았다.

| Phase | plan | Sonnet 판정 | 비고 |
|---|---|---|---|
| 2 | 02-07~13 | ISSUES (blocker 0, warning 9) | verify 누락, 02-10/12 wave 4 순서(provider 선행), 순수 controller 분리 명시, graphify 단계 |
| 4 | 04-07~12 | ISSUES (blocker 2, warning 6) | `lib/ai/chat.ts`·`tests/ai/chat.test.ts` 소유권이 Phase 4↔11 상호 모순 |
| 5 | 05-03~07 수정 + 05-08 신규 | PASSED (warning 2) | 05-08 Task1/2 사이 tsc 깨짐 가능, 기존 untracked 테스트 3개와 겹침 |
| 7 | 07-08~15 | PASSED (warning 4) | 0029 SQL 자동 검증 부족, 07-11 과대 |
| 10 | 10-07~10 | ISSUES (blocker 2, warning 6) | `tests/ai/ai-panel-model.test.ts` 소유권 10↔04 충돌, 10-09 depends_on에 04-10 누락 |
| 11 | 11-09~12 | 미검증 | Codex 한도로 중단, 종료 마커 없음 — 완결 여부 확인 필요 |
| 16 | 16-01~03 | 미검증 | 동일 |
| 3 | 없음 | — | 리서치 `03-RESEARCH-REOPEN.md` 완료, planner 한도로 중단 |
| 18 | 없음 | — | 리서치 `18-RESEARCH.md` 완료, planner 한도로 중단 |

## 다음 단계 (Codex 한도 해제 18:23 이후)
1. Phase 3·18 planner를 `gpt-6.1-sol`로 재실행(프롬프트는 이전 세션 scratchpad의 p03/p18 — 없으면 재작성).
2. 11·16 PLAN 완결 여부 확인 후 필요하면 마무리.
3. 파일 소유권 정리(단일 소유자 결정): `chat.ts`/`chat.test.ts`(P4 vs P11), `ai-panel-model.test.ts`(P4 04-10 vs P10 10-09), `AiPanel.tsx`(P4 04-10/11 vs P11-06). 권장: AiPanel·피커 연결은 Phase 4가 소유, chat.ts 계약 변경은 Phase 11이 소유하고 04-09는 11-05에 의존.
4. 전체 Sonnet 재검증, 열린 결정(P3 5건, P18 3건) 사용자 확인.

## 갱신 (2026-10-13) — 전 phase plan 작성·검증 완료
Codex 한도 해제 후 Phase 3·18 planner 실행, 11·16 마무리, 2·4·5·7·10 수정 패스와 소유권 정리를 마쳤고 9개 phase를 Sonnet으로 재검증했다. 커밋은 하지 않았다.

| Phase | plan | 최종 판정 |
|---|---|---|
| 2 | 02-07~13 | PASSED (경고: 02-13 실DB·브라우저 게이트에 DB 환경 필요) |
| 3 | 03-08~20 (13개) | PASSED |
| 4 | 04-07~12 | PASSED (실행 순서 11-11 → 04-10 지켜야 함) |
| 5 | 05-03~07 수정, 05-08 | PASSED |
| 7 | 07-08~15 | PASSED |
| 10 | 10-07~10 | 경고 2 해소(04-12 서버 키 계약 반영) |
| 11 | 11-09~13 (11-13 신규, 11-11 분리) | 순서 경고 해소, UAT 서버 키 선행 조건 추가 |
| 16 | 16-01~03 | PASSED (02-11 슬롯 export 확인 필요) |
| 18 | 18-01~12 | PASSED (차단 2건 해소) |

실행 순서 핵심: 11-10 → 11-11 → 04-09 → 04-10 → 04-11 → 11-13 → 11-12, Phase 3 03-08(4탭 셸) → Phase 18, Phase 2 02-11(슬롯) → Phase 16, 05-05 → 03-17/18.
사용자 확인이 필요한 열린 결정: Phase 3 문서 충돌 5건(설정 저장 cookie, 세피아 제거, 뷰어 바, 랭킹 배지, 더보기·루키), Phase 18 3건(연결 공개 토글 단위, 숨긴 가지의 하위 가지, 숨긴 가지 작품의 피드·URL).
