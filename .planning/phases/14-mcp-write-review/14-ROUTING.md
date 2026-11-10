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

## 2026-11-10 14-13 패치 형식 구현 (세션 `claude/phase14-patch`)

Jev 분류(jev-1.14.0, `jev_ask` task 단위 3회) → 고정 표. 세 task 모두 P1(자족성) < 0.5 또는 일회용 DB·네트워크 필요(P2)로 Claude 채널. 사용자 지정 모델 없음, `model_overrides`의 executor 값 없음.

| task | 복잡도 / 위험도 (Jev) | 보정 | 티어 | 모델 | 검증 |
|---|---|---|---|---|---|
| 1 `contentHash` 읽기 | multi_file(.82) / low(.81), P3 참(.94) | T3 −1(P3 참 + low) = T2 → Claude는 T2 칸 없음 → 한 칸 위 | T3 | sonnet | 위험도 low + P3 참이라 별도 모델 검증 없이 테스트 + 총괄 diff·재실행 |
| 2 입력·오류 계약 | multi_file(.68) vs architectural(.32), 신뢰도 낮음(review) / medium(.71), P3 참(.90) | review → 상위 두 후보 중 높은 쪽 architectural | T4 | opus | Codex `gpt-6-sol` |
| 3 0044 RPC + DB 테스트 | architectural(.54) vs multi_file(.44) (review) / high(.97), P2 참(.93) | architectural T4, 위험도 high +1 → T4로 클램프 | T4 | opus | Codex `gpt-6-sol`(high, 읽기 전용) |

- 실행: task 1·2는 파일이 겹치지 않아 병렬, task 3은 그 뒤. 에이전트는 Agent 도구에 `model`을 명시(sonnet / opus / opus).
- task 3 에이전트는 600초 무응답으로 한 번 중단(산출물 없음) → 같은 에이전트 재개(파일 먼저 저장, DB 명령은 백그라운드, 막히면 보고). 이후 Codex 지적 수정도 같은 에이전트가 수행.
- Codex 교차 검증: `gpt-6-sol`, 추론 `high`, `workspace-write` + 프롬프트에서 수정 금지(log 첫머리 `model:` 줄 확인). 첫 호출은 출력이 36줄에서 끊겨 검증으로 세지 않고 재시도, 두 번째가 정상: 블로커 1 / 경고 2, 모두 반영.
- 에스컬레이션 0회(task 단위). 분류가 `review`로 나온 task 2·3은 규칙대로 높은 쪽을 썼다.
