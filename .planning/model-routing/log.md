# 라우팅 로그 (관측값만)

`날짜 | phase-plan-task | 복잡도/위험도 | 티어 | 모델 | 1차 통과 | 에스컬레이션 횟수 | 검증자 지적 수 | routing_miss | 비고`
2026-10-19 | 99-01-1 | trivial/low | T1 | haiku (claude) | 통과 | 0 | 검증 없음 | - | 스모크 테스트. P1=0.83(uncertain)이라 Claude 채널
2026-10-19 | 99-01-2 | routine/low | T3 | sonnet (claude) | 통과 | 0 | 검증 없음 | - | 스모크. P1=0.23 uncertain → Claude 채널 (GPT 후보였으나 규칙상 Claude)
2026-10-19 | 99-01-3 | multi_file→architectural(review)/high | T4 | opus (claude) | 테스트 통과, 교차검증 ISSUES | 0 | 4 (gpt-6-sol) | - | 스모크. 다중 인스턴스 경쟁·키-유저 미결합·금액 불일치 미처리 지적
2026-10-19 | 99-01-4 | trivial→routine(review)/medium | T3 | sonnet (claude) | 미실행 | - | - | - | 결정만 확인(브라우저·대화문맥 task)
2026-10-19 | 99-02-1 | trivial/low | T1 | gpt-6-luna (codex, low) | 통과 | 0 | 검증 없음 | - | 규칙 개정 후. P1=0.68 P2=0.06 → codex. unelevated 플래그, env오류 0
2026-10-19 | 99-02-2 | routine/low | T2 | gpt-5.6-terra (codex, medium) | 통과(4/4) | 0 | 검증 없음 | - | 규칙 개정 후. P1=0.71 P2=0.05 → codex. 99-01에서는 sonnet(claude)으로 갔던 task
2026-10-19 | 99-02-3,4 | - | T4,T3 | opus,sonnet (claude) | 미실행 | - | - | - | 개정 규칙에서도 Claude 채널(P1=0.37 / P1=0.05,P2=0.89). 결정만 확인
2026-10-23 | 12-research | role-default | T3 | sonnet (claude) | 통과 | 0 | 검증 없음 | - | classifier: role-default. 웹 검색 필요로 Terra 대신 Claude. RESEARCH.md 산출, 확신도 MEDIUM
2026-10-23 | 12-plan | architectural/high | T3 | gpt-6-sol (codex, medium) | 통과(checker PASSED, 경고4) | 0 | 4(경고) | - | planner=model_overrides, checker=sonnet. PLAN 6개
2026-10-25 | 12-02-1,2 | multi_file(review)/high | T4 | gpt-6.1-sol (codex, high) | 미실행 | - | - | - | 결정만 기록. jev-1.14.0 jev_choice/jev_noul 대체(jev_classify 도구 없음). P1=0.61 P2=0.12 P3=0.71 P4=0.89, 검증자 sonnet
2026-10-25 | 12-02-1,2 | multi_file(review)/high | T4→T3(gpt-6.1-sol 미지원 계정) | gpt-6-sol (codex, high) | 통과(검증 WARNING 1건: 테스트 무효, 오케스트레이터 수정) | 0 | 1 (sonnet) | routing_miss: gpt-6.1-sol은 ChatGPT 계정에서 model_not_found | 비고: 첫 호출 즉시 실패 후 사용자 승인으로 gpt-6-sol 대체. models.md의 6.1 Sol 표시 갱신 필요
2026-10-25 | 12-03-1,2,3 | multi_file/high (3 review 포함) | T4 | opus (claude) | 미실행 | - | - | - | 결정만 기록. jev-1.14.0. P1=0.79 P2=0.67 P3=0.94 P4=0.68 -> P2>0.3 Claude 채널(패키지 설치 네트워크). 위험도 task3은 low0.54/high0.36 conf0.31 review 규칙으로 high. 검증자 gpt-6-sol(codex)
2026-10-25 | 12-03-1,2,3 | multi_file/high | T4 | opus (claude) | 통과(검증 WARNING 3건: proxy matcher 하위 경로 과제외 등, 오케스트레이터 수정) | 0 | 3 (gpt-6-sol) | - | 비고: 검증자 Codex는 샌드박스 EPERM으로 vitest 실행 불가, 오케스트레이터가 직접 실행(39 passed). BLOCKER 0
2026-10-25 | 12-04-1,2 | multi_file/high | T4->gpt-6-sol 대체 | gpt-6-sol (codex, high) | 미실행 | - | - | - | 결정만 기록. jev-1.14.0. P1=0.65 P2=0.10 P3=0.57 P4=0.87. 검증자 sonnet
2026-10-25 | 12-05-1 | multi_file(review)/high | T4->gpt-6-sol 대체 | gpt-6-sol (codex, high) | 미실행 | - | - | - | 결정만 기록. P1=0.65 P2=0.14 P3=0.69 P4=0.11. 검증자 sonnet
2026-10-25 | 12-05-2 | multi_file/low | T2 | gpt-5.6-terra (codex, medium) | 미실행 | - | - | - | 결정만 기록. risk low 0.93 + P3 true -> -1. terra 지원 확인됨
