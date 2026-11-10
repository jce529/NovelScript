# Phase 14 실행 모델 배정 (jev-model-routing, 2026-11-04)

Jev 분류(jev-1.14.0, task=plan 단위) → 고정 표. 모든 plan이 P1(자족성) < 0.5 또는 일회용 DB·브라우저 필요(P2)로 Claude 채널이다. 사용자 지정 없음, `model_overrides`의 executor 값 없음.

| plan | 복잡도 / 위험도 | 티어 | 모델 | 검증자 |
|---|---|---|---|---|
| 14-01 | multi_file(.59, 상위 후보 architectural .35) / high | T4 | opus | codex gpt-6-sol |
| 14-02 | multi_file / high | T4 | opus | codex gpt-6-sol |
| 14-03 | multi_file / low, P3 참 | T3 | sonnet | 테스트 + diff 확인 |
| 14-04 | architectural(.54) / high | T4 | opus | codex gpt-6-sol |
| 14-05 | multi_file / high | T4 | opus | codex gpt-6-sol |
| 14-06 | multi_file / medium, P3 거짓 | T4 | opus | codex gpt-6-sol |
| 14-07 | routine / low | T3 (Claude는 T2 칸 없음) | sonnet | 테스트 + diff 확인 |
| 14-08 | multi_file / medium, P3 불확실 | T4 | opus | codex gpt-6-sol |
| 14-09 | 수동 인수 | — | 사람 | — |

## 2026-11-10 병합 세션(14-10 ~ 14-12)

| plan | 한 곳 | 모델 | 검증자 |
|---|---|---|---|
| 14-10 | 병합 세션이 직접 구현(Sonnet 5.5). Jev 분류·외부 AI 호출 없음 | sonnet | 일회용 DB 스위트 직접 재실행. Codex `gpt-6-sol`(high, 읽기 전용) 사후 검토: 블로커 0 / 경고 5, 3건 수정 |
| 14-11 | 같은 세션이 직접 구현 | sonnet | 단위·eslint·tsc 직접 재실행. 화면 확인은 14-09 |
| 14-12 | 같은 세션 | sonnet | 위와 같음 |
| 14-13 (PLAN만) | planner Codex `gpt-6-sol` medium(2회: 최초 + checker 이슈 반영), checker Claude `sonnet`(2회: ISSUES FOUND → VERIFICATION PASSED) | codex / sonnet | — |
