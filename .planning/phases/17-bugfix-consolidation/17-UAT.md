---undefined 일회용 DB+fixture 서버(웹팩 dev)에서 다이얼로그를 열고 폴더 선택값 표시. 콘솔에 uncontrolled 경고·Next 오버레이 없음 (2026-10-25, 에이전트 자동) | PASS 화면에 "파일 선택"·"폴더째 선택" 버튼만 보임. file input 2개 모두 `sr-only`(약 1px), tabindex=-1, aria-label 있음, 기본 문구 비노출 | PASS accessibility 트리에서 버튼과 숨은 input이 분리됨(자동 테스트 7건 통과). 실제 키보드·선택창 오픈은 미확인 | pending 모바일 에뮬레이션·실기기 미확인 | pending 기존 제한은 단위 테스트로만 확인, 브라우저 미확인 | pending fixture 호출 성공 시 서버 로그 `[ai] generation observed`: provider=gemini, keySource=service, finishReason=stop, wasCapped=false, maxOutputTokens=4096, outputTokens=200, thoughtsTokens=null, idempotencyKey 있음. 본문·프롬프트·키 없음 (실키 아님, fixture) | PASS (fixture) fixture `rate_limited` 실패 후 모델을 GPT-4o mini로 바꿔 재시도: 요청 모델 gemini-3.5-flash→gpt-4o-mini, 멱등 키 24a5ba98…→18853705… (새 키). 원장 차감 없음 | PASS 같은 실패에서 모델 변경 없이 재시도: gemini-3.5-flash, 같은 키 24a5ba98…로 재전송 | PASS fixture `drop-response`(응답 유실=unknown 취급)로 모델을 바꾸고 재시도: 모델 gemini-3.5-flash, 같은 키 fcff109e…. 토스트 "이전 요청의 처리 여부가 확실하지 않아 처음 고른 모델로 다시 보내요. 바꾼 모델은 새 메시지부터 적용돼요." 서버는 "이미 처리된 요청" 응답. DB 원장에 해당 키 -1 한 건뿐, 잔액 20000→19999 | PASS 실키 필요, fixture에 max_tokens 응답 없음. 문구 분류는 단위 테스트(capped-reason·capped-ux)로만 확인 | blocked 실키 필요 | blocked 잔액 한도 잘림 재현에 max_tokens 응답 필요, 단위 테스트로만 확인 | blocked 실키 필요(fixture 응답은 문서 구조가 아님) | blocked 실키 필요 | blocked 실키·잘림 재현 필요, 단위 테스트(regenerate-document)로만 확인 | blocked 실키 필요 | blocked 미확인 | pending 일회용 DB 시드 필요, 미확인 | pending 사용자 확인 필요 | pending 사용자 결정 필요 | pending |undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|undefined|
phase: 17-bugfix-consolidation
status: pending
created: 2026-10-23
---

# Phase 17 수동 UAT 체크리스트

코드·자동 검증은 끝났다. 이 문서는 브라우저·실기기에서만 확인할 수 있는 항목이다. 각 항목의 `실제`·`판정` 칸을 확인하면서 채운다. 판정: PASS / partial / blocked / pending / FAIL.

## 자동 검증 (2026-10-23, 이 브랜치 `claude/festive-swanson-cc07cc`)

| 검사 | 결과 |
|---|---|
| `npx vitest run --project unit` | 163파일 2529테스트 통과 |
| `npx eslint . --max-warnings=0` | 경고·오류 0 |
| `npx tsc --noEmit` | `app/layout.tsx` `LayoutProps` 1건 (`.next/types` 없음, 환경 요인) |
| 일회용 DB 전체 suite (게이트 3개 on) | 3052 통과 / 5 skip / 1 실패 (DB 잔여물, 17-05-SUMMARY 참조) |

## 준비

- 개발 서버를 이 브랜치로 띄운다. 로그인은 테스트 계정으로 한다.
- 서비스 키(Gemini)가 있어야 하는 항목은 `실키 필요`로 표시했다. Gemini가 503이면 해당 항목은 blocked로 두고 자동 테스트를 live PASS로 대신하지 않는다.
- 공유 Supabase에는 아무것도 적용하지 않았다. DB를 바꾸는 확인(0012 시드 등)은 일회용 DB에서만 한다.
- 브라우저 콘솔(F12)과 네트워크 탭을 열어 둔다.

---

## A. BUGFIX-03 · 업로드 다이얼로그 (Phase 16 G2·G3)

대상: 스튜디오 → 설정 문서 AI 패널 → 파일 업로드 다이얼로그

| # | 확인 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| A1 | 다이얼로그를 열고 폴더 선택 드롭다운을 연다 | 콘솔에 Base UI `Select` uncontrolled→controlled 경고 없음, Next 오버레이 "1 Issue" 없음 | | |
| A2 | 파일 선택 영역을 본다 | 브라우저 기본 "선택된 파일 없음" 문구가 보이지 않고, "파일 선택"·"폴더째 선택" 버튼만 보인다 (대화 첨부 모드에서는 폴더 버튼 없음) | | |
| A3 | 키보드로 Tab 이동 후 Enter/Space | "파일 선택" 버튼으로 파일 선택창이 열린다 | | |
| A4 | 모바일 기기(또는 모바일 에뮬레이션)에서 두 버튼 | 파일/폴더 선택창이 열린다. 실기기는 별도 기록 | | |
| A5 | 파일 5개 초과·용량 초과 등 기존 제한 | 기존과 같은 안내 문구가 나온다 | | |

## B. BUGFIX-01 · 잘림 안내와 출력 상한 (Phase 16 G1, Phase 8 BUG-04 단계 A-2) `실키 필요`

| # | 확인 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| B1 | 잔액이 충분한 계정으로 설정 문서 AI 패널에 "이 인물의 성격을 한 문장으로 제안해줘." 전송 | 응답이 정상 완료되거나, 잘려도 "토큰이 모두 소진됐어요"가 **나오지 않는다** | | |
| B2 | 서버 로그에서 `[ai] generation observed` 줄 | provider·keySource·finishReason·wasCapped·maxOutputTokens(4096)·outputTokens·thoughtsTokens·idempotencyKey가 있고, 응답 본문·프롬프트·키는 없다 | | |
| B3 | 긴 요청을 5회 정도 보내 잘림 빈도를 센다 | 잘림 횟수와 사고 토큰 비율을 기록한다(판정 아님, 단계 B 관측 자료) | | |
| B4 | 잔액을 아주 적게 만든 계정에서 같은 요청 (일회용 DB 또는 테스트 계정) | 잔액 한도에 걸리면 기존 "토큰이 모두 소진됐어요" 문구가 유지된다 | | |

## C. BUGFIX-02 · 문서 재생성 (Phase 15 HUMAN-UAT item 2, BUG-07) `실키 필요`

| # | 확인 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| C1 | 템플릿 문서를 재생성하고 저장 | 문서 이름이 바뀌지 않고, 위치·내용이 정상 | | |
| C2 | 재생성 성공/실패 문구 | 성공 시 성공 문구, 실패 시 실패 문구가 맞게 나온다 | | |
| C3 | 응답이 잘리는 긴 문서를 재생성 (잘림 재현이 어려우면 blocked) | "문서가 길어서 생성 도중 잘렸어요. 사용한 토큰은 차감되지 않았어요. 다시 시도해주세요." 표시, 지갑 원장에 차감 없음, 같은 요청 재시도 가능 | | |
| C4 | 저장 모달에서 폴더 이동/삭제 race | 재검증 배너가 뜨고 저장이 안전하게 막히거나 안내된다 | | |
| C5 | 루트 직속 커스텀 이름 템플릿 | "미분류"로 표시되고 툴팁이 맞다 | | |
| C6 | 0012 평면 템플릿 이동 (일회용 DB) | 이동 후 내용이 보존된다 | | |

## D. BUGFIX-04 · "다시 시도" 모델 반영 (Phase 16 G4)

실패를 만드는 방법: 서비스 키를 일시적으로 막거나(네트워크 차단·잘못된 키), 모델 가용성 제한 상태를 이용한다. 어렵다면 해당 항목은 blocked로 둔다.

| # | 확인 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| D1 | 요청 실패(rate_limited/credit_exhausted/unavailable/config 중 하나) 후 모델을 바꾸고 "다시 시도" | 네트워크 탭에서 요청이 **새 멱등 키 + 바꾼 모델**로 전송된다 | | |
| D2 | 모델을 안 바꾸고 "다시 시도" | 이전과 **같은 멱등 키**로 재전송된다 | | |
| D3 | 실패 종류가 모호한 경우(settlement/unknown/응답 유실) 모델을 바꾸고 "다시 시도" | **같은 멱등 키 + 이전 모델**로 재전송되고, 바꾼 모델은 다음 메시지부터 적용된다는 토스트가 뜬다. 지갑 원장에 이중 차감 없음 | | |

## E. 기준선 (BUGFIX-05) 사용자 확인 항목

| # | 확인 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| E1 | 공유 Supabase에 `purge_account_data`(구 0022_account_deletion_purge)가 이미 적용돼 있는가 | 적용 여부를 확인한다. 이력 테이블이 없어 파일명만 `0028_account_deletion_purge.sql`로 바뀌었다 | | |
| E2 | 일회용 DB 잔여물(확정 가지 작품 3개 `UAT If Branch`, `UAT 확장 가지 작품`, `UAT 손자 가지`) 처리 방식 | 일회용 DB를 재생성하거나 직접 정리하면 전체 suite 실패 0을 확인할 수 있다 | | |

---

## 결과 요약 (확인 후 채움)

- PASS: A1, A2, B2(fixture), D1, D2, D3
- partial: 없음
- blocked(실키·잘림 재현 필요): B1, B3, B4, C1~C4
- pending: A3, A4, A5, C5, C6, E1, E2
- FAIL: 없음

## 에이전트 자동 확인 환경 (2026-10-25)

- 코드: 브랜치 `claude/festive-swanson-cc07cc` 그대로, Next dev `--webpack`, 포트 3199
- DB: 일회용 DB(`env.disposable`), 공유 프로젝트와 ref 다름 확인. 테스트 계정 `uat17-*@novelscript.test`(작가, 잔액 20000)와 작품 `UAT17 작품`이 일회용 DB에 남아 있음
- AI: `AI_PROVIDER_FIXTURE`(rate_limited / drop-response)와 더미 서비스 키. 실제 Gemini 호출 없음
- 임시 설정(launch.json 항목, node_modules junction)은 모두 제거함

발견한 새 결함은 원인 phase의 `bugs/`에 `BUG-NN`으로 추가한다(`bug-plan`).
