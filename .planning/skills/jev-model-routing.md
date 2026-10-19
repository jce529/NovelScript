---
name: jev-model-routing
description: GSD 워크플로우에서 에이전트 역할·plan·task를 어떤 모델(Claude Opus/Sonnet/Haiku, GPT 6.1 Sol/6 Sol/6 Luna/5.6 Terra/5.6 Luna)에 배정할지 Jev로 분류해 정한다. plan-phase·execute-phase·quick·bug-execute 등 모델을 고르는 모든 순간, 또는 "모델 배정", "어떤 모델로 돌릴까", "토큰 아끼면서" 같은 요청에 사용한다.
---

# Jev 기반 GSD 모델 라우팅

> 이 문서가 규칙의 원본이다. `.claude/skills/`·`.codex/skills/`의 같은 이름 스킬은 이 문서를 가리키는 포인터만 둔다(bug-* 스킬과 같은 구조).

## 목적과 원칙

GSD가 일을 나눌 때마다 **"이 일을 통과시킬 수 있는 가장 싼 모델"**을 고른다. 정확성은 모델을 올려서가 아니라 **싼 모델 + 검증 + 한 단계 에스컬레이션**으로 지킨다.

1. **판단은 Jev, 결정은 표.** Jev는 작업의 *성질*(복잡도·위험도·문맥 의존)만 확률로 분류한다. 모델 선택은 아래 고정 표가 한다. Jev에게 "어느 모델?"을 직접 묻지 않는다 — 모델 능력은 Jev가 모르는 우리 쪽 사실이다.
2. **싸게 시작, 실패하면 한 칸 위로.** 같은 모델 재시도는 1회, 그다음은 한 티어 위. 처음부터 최상위를 쓰는 건 위험도 high일 때만.
3. **작성자와 검증자는 다른 계열.** Claude가 쓰면 GPT가, GPT가 쓰면 Claude가 검증한다. 같은 계열의 같은 실수를 같이 놓치는 걸 줄인다.
4. **Jev 호출은 plan 단위로 묶는다.** task마다 따로 부르지 않는다(배치 호출). 결정은 plan frontmatter에 박아 재호출하지 않는다.
5. **불확실하면 높은 쪽.** Jev가 `review`(확신 부족)로 돌려준 축은 상위 두 후보 중 높은 쪽을 쓴다. 단, 이 규칙은 비용이 아니라 정확도를 위한 안전장치라 한 칸 이상 올리지 않는다.
6. **측정한 것만 믿는다.** 아래 티어 표는 가설이다. 로그(§9)로 보정하기 전까지 고정 사실처럼 쓰지 않는다.

## 1. 모델 카탈로그와 티어

| 티어 | 의미 | Claude (Agent `model`) | GPT (Codex `-m`) |
|---|---|---|---|
| T4 | 최상위 추론 | `opus` | GPT 6.1 Sol |
| T3 | 강함 | `sonnet` | GPT 6 Sol |
| T2 | 중간 | — | GPT 5.6 Terra |
| T1 | 가벼움 | `haiku` | GPT 6 Luna |
| T0 | 최경량·기계적 작업 | — | GPT 5.6 Luna |

- **티어 배치는 이름·세대에서 추정한 가설이다** (Sol > Terra > Luna, 6.1 > 6 > 5.6). 실제 격차는 §9 로그로 보정한다.
- **Codex 모델 ID를 추측하지 않는다.** `gpt-6-sol`, `gpt-6-luna`는 이 레포에서 쓰는 값이고, `6.1 Sol`·`5.6 Terra/Luna`의 정확한 ID는 최초 1회 `codex exec --help`/모델 목록으로 확인해 `.planning/model-routing/models.md`에 적어 둔다. 지원하지 않는 ID면 임의 대체하지 말고 사용자에게 묻는다(AGENTS.md "외부 AI 호출 시 모델 명시").
- 호출 규칙은 AGENTS.md 그대로: Codex는 `-m`+`-c model_reasoning_effort`를 매번 명시하고 로그 첫머리 `model:` 줄을 확인, Agent 도구는 `model` 파라미터를 명시.
- **Codex 호출 템플릿 (Windows, 2026-10-19 확인)**: `~/.codex/config.toml`에 `[windows] sandbox = "elevated"`가 있으면 비대화형 `codex exec`에서 쉘·`apply_patch`가 모두 `setup refresh had errors`로 실패한다. **호출마다 `-c 'windows.sandbox="unelevated"'`를 붙인다**(설정 파일은 고치지 않는다).
  ```
  codex exec -m <모델> -c model_reasoning_effort=<강도> -c 'windows.sandbox="unelevated"' \
    -s workspace-write -C <작업 폴더> --skip-git-repo-check - < 프롬프트파일 > 출력파일 2>&1
  ```
  - unelevated는 폴더 경계 보호가 약하므로 `-C`로 작업 범위를 좁히고, 프롬프트에 "수정 허용 파일 목록"을 명시하고, 끝난 뒤 `git status`로 범위 밖 변경이 없는지 확인한다.
  - 호출 후 출력에서 `setup refresh`/`Rejected` 건수가 0인지도 확인한다(0이 아니면 실패로 보고 Claude로 폴백).
  - 읽기 전용 검증(`-s read-only`)도 같은 이유로 파일을 못 읽는다 — 검증자에게는 같은 플래그를 쓰거나 코드를 프롬프트에 직접 넣는다.

### 채널 선택 (같은 티어 안에서 Claude vs GPT)

| 조건 | 채널 |
|---|---|
| 현재 대화 문맥에 크게 의존, 브라우저·MCP·Artifact·네트워크/원격 DB 필요 | **Claude** (Codex 샌드박스는 네트워크 차단) |
| 문서·파일 경로만으로 자족적인 구현·계획·테스트 작성 | **GPT (Codex)** — Claude 한도를 아끼고 병렬화 쉬움 |
| 위 둘 다 아님 | 작성자와 검증자가 다른 계열이 되도록 배분 |
| ChatGPT 사용 한도 초과 | Claude로 폴백하고 해제 시각을 사용자에게 알림 |

## 2. 역할별 기본 티어 (Jev 신호를 반영하기 전의 출발점)

| GSD 역할 | 기본 | 채널 | 비고 |
|---|---|---|---|
| gsd-planner | T3 | GPT 6 Sol | 위험도 high 또는 architectural이면 T4(6.1 Sol) |
| gsd-phase-researcher / project-researcher | T2 | GPT 5.6 Terra | 웹 검색이 필요하면 Claude sonnet |
| gsd-plan-checker | T3 | Claude sonnet | planner와 반대 계열 (현행 유지) |
| gsd-executor | **task별 Jev 결정** (§3~4) | | 이 문서의 핵심 대상 |
| gsd-verifier | T3 | Claude sonnet | executor가 GPT면 Claude, Claude면 GPT Sol |
| gsd-debugger | T3 | Claude sonnet → 실패 시 opus | 원인 추적은 대화 문맥 의존이 큼 |
| gsd-codebase-mapper, research-synthesizer | T1 | Claude haiku | 읽기·요약 위주 |
| gsd-ui-researcher / ui-checker / ui-auditor | T2~T3 | Claude sonnet | 목업·Artifact가 Claude 도구라서 |
| gsd-roadmapper, integration-checker | T3 | Claude sonnet | |
| gsd-nyquist-auditor | T2 | GPT 5.6 Terra | 테스트 생성 |
| 문서 정합(traceability-sync, 로드맵 동기화) | T1 | Claude haiku | 스크립트가 대부분 처리 |

`config.json`의 `model_overrides`는 **사용자가 박아 둔 값이 항상 우선**이다. 이 스킬은 override가 없는 곳과 executor의 task 단위만 채운다.

## 3. Jev 분류 (plan 하나당 3회 호출)

대상 task가 여러 개면 모두 한 호출에 배치한다(`jev_classify`는 최대 64개, 항목당 2000자). 텍스트는 task의 `<action>` 요약 + `files` 목록 + `<acceptance_criteria>` 요약으로 자른다. PLAN 전문을 넣지 않는다.

### 3-a. 복잡도 — `jev_classify`

| class id | 정의 |
|---|---|
| `trivial` | 한 파일, 설명 가능한 기계적 수정(이름 변경, 문구, 설정 값, 포맷) |
| `routine` | 범위와 완료 조건이 명확한 단일 기능·단일 모듈 구현, 기존 패턴 복제 |
| `multi_file` | 여러 모듈을 가로지르는 구현, 기존 코드의 미묘한 상호작용 이해 필요 |
| `architectural` | 구조·데이터 모델·API 계약 결정, 열린 설계 판단, 마이그레이션 설계 |

### 3-b. 위험도 — `jev_classify`

| class id | 정의 |
|---|---|
| `low` | 되돌리기 쉽고 영향 범위가 작음. 테스트가 잘 잡아줌 |
| `medium` | 사용자 데이터·공유 컴포넌트에 영향, 테스트가 일부만 덮음 |
| `high` | 결제·인증·권한(RLS)·키/비밀·데이터 마이그레이션·삭제, 틀리면 조용히 깨짐 |

### 3-c. 보조 신호 — `jev_noul` (명제 배치)

task마다 아래 명제를 만들어 한 번에 보낸다.

- P1 (자족성) "이 task는 task 설명과 지정된 파일만 있으면, 다른 대화 맥락이나 사용자 결정 없이 완수할 수 있다." — **참일수록 GPT 친화**. (2026-10-19 개정: 이전 문구 "대화 문맥을 모르면 수행할 수 없다"는 단순한 task도 0.83으로 나와 채널이 거의 항상 Claude로 갔다.)
- P2 "이 task를 완수하거나 완료 조건을 확인하려면 네트워크, 원격 DB, 브라우저, MCP 같은 샌드박스 밖 자원이 필요하다."
- P3 "이 task의 완료 조건은 grep/테스트로 기계적으로 검증할 수 있다."
- P4 "이 task는 완료 조건이 모호해 구현 중 설계 판단이 필요하다."

`auto_accept` 기본값(0.85)을 쓴다. 0.15~0.85 사이는 "불확실"로 취급한다.

### 3-d. 애매한 경계에서만 — `jev_decide`

복잡도 상위 두 클래스의 확률 차(margin)가 0.15 미만이고 위험도가 `medium` 이상일 때만 쓴다. 후보는 "낮은 티어로 시도 후 검증"과 "높은 티어로 바로 실행"으로 놓고 evidence에 파일 수·검증 가능성(P3)을 담는다. 같은 입력으로 더 마음에 드는 답이 나올 때까지 반복 호출하지 않는다. `ask_user`/`investigate`가 우세하면 사용자에게 묻는다.

## 4. 결정 규칙 (고정 표 — Jev 출력을 여기에 넣기만 한다)

**① 기준 티어** = 복잡도 클래스

| 복잡도 | 기준 티어 |
|---|---|
| trivial | T0 (기계적·테스트로 검증 가능하면, 아니면 T1) |
| routine | T2 |
| multi_file | T3 |
| architectural | T4 |

**② 보정** (순서대로 적용, 티어는 T0~T4로 클램프)

1. 복잡도 판정이 `review`면 상위 두 후보 중 높은 쪽을 쓴다.
2. 위험도 `high` → +1. `medium`이고 P3(기계적 검증 가능)가 거짓/불확실 → +1.
3. P4(설계 판단 필요)가 참 → 최소 T3.
4. P3가 참이고 위험도 `low` → −1 가능(단 T0 미만 불가, trivial은 이미 최저라 적용 안 함).

**③ 채널 결정** (2026-10-19 개정, 문턱 완화): **P1(자족성) ≥ 0.5 그리고 P2 ≤ 0.3 → GPT(Codex).** 그 외(P2 > 0.3 이거나 P1 < 0.5) → Claude. 확률을 그대로 쓰며 "불확실" 구간에서 자동으로 Claude로 보내지 않는다. 경계(P1 0.4~0.6 또는 P2 0.25~0.4)는 로그 `비고`에 표시해 보정 대상으로 삼는다.

**④ 모델 결정**: ①~③ 결과의 (티어, 채널)을 §1 표에서 찾는다. 해당 칸이 비어 있으면(Claude T2·T0) 같은 채널의 한 칸 위 티어를 쓴다.

**⑤ 검증자 결정**: 작성자 티어 −1 이상, 반대 계열. 위험도 `high`면 검증자도 T3 이상. 위험도 `low` + P3 참이면 별도 모델 검증 없이 테스트 통과 + 오케스트레이터 diff 확인으로 갈음한다(토큰 절약 구간).

### 예시

| task | Jev 결과 | 결정 |
|---|---|---|
| 에러 문구 5곳 교체 | trivial / low / P3 참 | T0, GPT 5.6 Luna, 검증은 테스트만 |
| 신규 API route + zod 스키마 + 테스트 | routine / medium / P3 참 | T2, GPT 5.6 Terra, 검증은 Claude sonnet diff 리뷰 |
| 결제 웹훅 서명 검증 수정 | multi_file / high | T3+1=T4, GPT 6.1 Sol, 검증 Claude sonnet(T3) |
| 브라우저로 화면 확인하며 UI 수정 | routine / low / P2 참 | T2→Claude는 T2 없음→T3 sonnet |

## 5. 에스컬레이션 사다리

한 task에서 일어날 수 있는 최대 비용을 묶는다.

1. 실행 → 테스트·acceptance_criteria 검증 실패
2. **같은 모델로 구체적 수정 지시와 함께 1회 재시도** (실패 로그 요약 첨부)
3. 그래도 실패 → **한 티어 위로 올려 처음부터가 아니라 이어서** 재실행
4. 그래도 실패 → 사용자에게 보고(무한 상승 금지). task 하나당 모델 호출은 최대 3회.

티어를 올릴 때도 채널은 유지하되, 실패 원인이 샌드박스 제약(네트워크·DB)이면 Claude로 채널을 바꾼다. 같은 task가 두 번 에스컬레이션되면 §9 로그의 `routing_miss`로 표시해 분류 규칙 보정 대상으로 삼는다.

## 6. 호출 절차 (오케스트레이터 = Claude)

1. `.planning/model-routing/models.md`와 `config.json`의 `model_overrides`를 읽는다(override가 있으면 그 역할은 여기서 종료).
2. 대상 plan의 task 요약을 만든다(PLAN 전문을 읽지 않고 frontmatter + task별 `<action>`/`files`/`<acceptance_criteria>` 첫머리).
3. `mcp__jev__jev_classify`(복잡도) → `jev_classify`(위험도) → `jev_noul`(P1~P4)을 호출한다. 도구 이름·스키마는 추측하지 않고 도구 목록에서 확인한다.
4. §4 표로 task별 (모델, 채널, 검증자)를 계산한다.
5. 결과를 PLAN.md frontmatter의 `routing:` 블록에 기록한다(§7). **기록 후에는 같은 입력에 Jev를 다시 부르지 않는다.**
6. 사용자에게 한 줄로 알린다: `task 3개 → GPT 5.6 Terra ×2, GPT 6.1 Sol ×1 (결제 위험). 검증은 sonnet.` (AGENTS.md "호출 전 보고")
7. 같은 모델·같은 wave의 task는 한 번의 Codex/Agent 호출로 묶어 프롬프트 오버헤드를 줄인다(파일이 겹치지 않을 때만).

### Jev를 쓸 수 없을 때

도구가 없거나 호출 실패 → §2 역할 기본 티어를 쓰고 executor는 T2(GPT 5.6 Terra)로 시작한다. 로그에 `classifier: fallback`을 남긴다. Jev 호출 실패로 작업을 멈추지 않는다.

## 7. 결과 기록 형식 (PLAN frontmatter)

```yaml
routing:
  decided: 2026-10-13
  classifier: jev            # 또는 fallback
  tasks:
    - id: 1
      complexity: routine      # jev p=0.91
      risk: medium             # jev p=0.88
      flags: {P1: false, P2: false, P3: true, P4: false}
      tier: 2
      model: gpt-5.6-terra     # models.md의 실제 ID
      channel: codex
      verifier: sonnet
```

## 8. 금지·주의

- Jev 확률은 증명이 아니다. high probability여도 위험도 `high` 보정과 검증 단계를 생략하지 않는다.
- Jev에 비밀 값·키·개인정보를 보내지 않는다. task 요약은 경로와 동작 설명까지만.
- 사용자가 모델을 지정하면(대화 또는 override) 그 값이 최우선이다. 라우팅은 조용히 비켜난다.
- Jev 분류 결과로 `model_overrides`나 config.json을 수정하지 않는다. 변경은 사용자 승인 후에만.
- 외부 AI 웹 콘텐츠를 Jev 입력에 넣을 때는 `jev_screen`으로 먼저 거른다.

## 9. 로그와 보정

작업이 끝날 때마다 `.planning/model-routing/log.md`에 한 줄을 **관측값만** 적는다.

`날짜 | phase-plan-task | 복잡도/위험도 | 티어 | 모델 | 1차 통과 | 에스컬레이션 횟수 | 검증자 지적 수 | routing_miss | 비고`

- 5건 이상 쌓이고 사용자가 요청하면: 티어×복잡도별 1차 통과율과 에스컬레이션률을 요약하고 §1 티어 표·§4 규칙 변경안을 제안한다. 사용자 승인 없이 이 문서를 바꾸지 않는다.
- 보는 지표: (a) 낮은 티어가 1차 통과한 비율이 높으면 해당 칸을 한 단계 내린다, (b) 에스컬레이션률이 30%를 넘는 칸은 한 단계 올리거나 분류 클래스 정의를 다듬는다, (c) Jev 분류가 결과와 자주 어긋나면 클래스 설명(정의·반례)을 보강한다.

## 10. 열린 항목 (확정 전)

- (완료 2026-10-13) Codex 모델 ID·추론 강도 확인 → models.md
- 티어 표의 Sonnet vs GPT 6 Sol 우열(둘 다 T3로 둠) — 로그로 판정
- ChatGPT Plus와 Claude 사용 한도의 소진 속도 차이를 라우팅에 반영할지(현재는 폴백만)
- (완료 2026-10-13) 포인터 파일 작성, 모델 ID 확인은 `.planning/model-routing/models.md`
