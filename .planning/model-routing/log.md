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
2026-10-25 | 12-04-1,2 | multi_file/high | T4->gpt-6-sol 대체 | gpt-6-sol (codex, high) | 1차 BLOCKER 1(비로그인이 로그인 화면 미도달) → 수정 루프 1회 후 통과 | 1 | 1 BLOCKER+2 WARNING (sonnet) | routing_miss: 아님. UI-SPEC 판정 순서 자체가 결함 | 비고: 동시 실행 12-05와 파일 겹침 없음. 사용자 확인 대기: 비로그인 화면 중립 문구(UI-SPEC 갱신)
2026-10-25 | 12-05-1 | multi_file(review)/high | T4->gpt-6-sol | gpt-6-sol (codex, high) | 통과(검증 BLOCKER 0, 서버 로직 PASS) | 0 | 0 (sonnet) | - | 비고: Task1 지적 없음
2026-10-25 | 12-05-2 | multi_file/low | T2 | gpt-5.6-terra (codex, medium) | 1차 WARNING 5건(포커스·dl·색 등) → 수정 1회 | 1 | 6 WARNING (sonnet) | - | 비고: 수정 중 ChatGPT 사용 한도 초과(10:08 PM 재시도 가능)로 SUMMARY 기록 직전 중단, 코드는 적용 확인 후 오케스트레이터가 마무리
2026-10-25 | 12-06-1(수정) | routine/medium | T3 | sonnet (claude, 폴백) | 통과(사용자 DB 실행 22 passed, skipped 0) | 0 | - | - | 비고: grants/sensitive-rls 토큰 빈틈 수정. Codex 한도 초과(10:08 PM)로 Claude 폴백. 사용자가 DB 테스트 직접 실행
2026-11-02 | 13-plan,13-01~13-05 | multi_file~architectural/high | T3~T4 | planner gpt-6-sol (medium); 13-01·13-01b·13-05 opus (claude); 13-02·13-03·13-04 gpt-6.1-sol (codex, high) | 통과(교차 리뷰·직접 재실행, 경고 반영) | 0 | 교차 리뷰 경고 다수·치명 0 | - | classifier: fallback(Jev jev_ask 호출 형식 실수, 도구는 정상). criteria를 [{id,description}] 배열로 넘겨 desc.trim is not a function 발생, {id: 설명} 맵으로 바꾸면 정상(jev-1.14.0, 13-05 위험도 high 0.92 일치). 교훈: jev_ask 실패 시 criteria를 {id: 설명} 맵으로 바꿔 재시도하고 jev_doctor로 상태를 확인한 뒤에만 fallback 사용. 6.1 Sol은 이 계정에서 지원 확인
2026-11-01 | 19-01 | routine/low | T2 | gpt-5.6-terra | 통과(샌드박스 EPERM으로 테스트는 오케스트레이터가 재실행) | 0 | 0 | no | classifier: jev-partial(choice만, noul 미사용)
2026-11-01 | 19-02 | multi_file/medium | T3 | gpt-6-sol | 부분(entrypoints 카드 문구 단언 1건 수정) | 0 | warning 2건 반영 | no | 검증 sonnet diff 리뷰 blocker 0
2026-11-01 | 19-03 | multi_file/low | T2 | gpt-5.6-terra | 통과 | 0 | 0 | no | Jev는 multi_file(0.75)이었으나 low+P3로 T2
2026-11-01 | 19-04 | routine/low | T3 | claude(직접) | 통과 | 0 | - | no | 브라우저 필요로 Claude 채널
