# 라우팅 로그 (관측값만)

`날짜 | phase-plan-task | 복잡도/위험도 | 티어 | 모델 | 1차 통과 | 에스컬레이션 횟수 | 검증자 지적 수 | routing_miss | 비고`
2026-10-19 | 99-01-1 | trivial/low | T1 | haiku (claude) | 통과 | 0 | 검증 없음 | - | 스모크 테스트. P1=0.83(uncertain)이라 Claude 채널
2026-10-19 | 99-01-2 | routine/low | T3 | sonnet (claude) | 통과 | 0 | 검증 없음 | - | 스모크. P1=0.23 uncertain → Claude 채널 (GPT 후보였으나 규칙상 Claude)
2026-10-19 | 99-01-3 | multi_file→architectural(review)/high | T4 | opus (claude) | 테스트 통과, 교차검증 ISSUES | 0 | 4 (gpt-6-sol) | - | 스모크. 다중 인스턴스 경쟁·키-유저 미결합·금액 불일치 미처리 지적
2026-10-19 | 99-01-4 | trivial→routine(review)/medium | T3 | sonnet (claude) | 미실행 | - | - | - | 결정만 확인(브라우저·대화문맥 task)
2026-10-19 | 99-02-1 | trivial/low | T1 | gpt-6-luna (codex, low) | 통과 | 0 | 검증 없음 | - | 규칙 개정 후. P1=0.68 P2=0.06 → codex. unelevated 플래그, env오류 0
2026-10-19 | 99-02-2 | routine/low | T2 | gpt-5.6-terra (codex, medium) | 통과(4/4) | 0 | 검증 없음 | - | 규칙 개정 후. P1=0.71 P2=0.05 → codex. 99-01에서는 sonnet(claude)으로 갔던 task
2026-10-19 | 99-02-3,4 | - | T4,T3 | opus,sonnet (claude) | 미실행 | - | - | - | 개정 규칙에서도 Claude 채널(P1=0.37 / P1=0.05,P2=0.89). 결정만 확인
