---
name: codex-tdd-pipeline
description: 사용자가 "GPT로 넘겨서 구현해줘", "Codex로 실행해줘", "TDD로 쪼개서 진행해줘", "코덱스한테 위임", "GPT Plus로 짜게 해줘" 등으로 계획-실행 분리 파이프라인을 요청할 때 사용한다. Claude가 GSD로 phase를 TDD 단위 계획으로 쪼개고, 실제 실행은 로컬 Codex CLI(ChatGPT 로그인, GPT Plus)에 2단계로 위임한다 — gpt-6-sol이 작은 TDD 단위 설계를, gpt-6-luna가 빠른 구현을 맡는다. Claude가 결과를 검수·로드맵 동기화한 뒤 phase 완료 시 Artifact 목업으로 전체 기능검사를 제공하는 절차를 정의한다.
---

# Codex TDD 파이프라인

Claude(계획·검수·목업) ↔ Codex CLI(구현·자체검증)를 분리한 하이브리드 실행 절차. "계획은 Claude, 코딩은 Codex, 통합·검증·목업은 다시 Claude" 순환을 phase의 모든 plan이 끝날 때까지 반복한다.

## 사전 조건

시작 전 매번 확인한다:

```bash
codex --version              # 설치 확인
node -e "const j=require(require('os').homedir()+'/.codex/auth.json');const p=JSON.parse(Buffer.from(j.tokens.access_token.split('.')[1],'base64url').toString());console.log(new Date(p.exp*1000)>new Date()?'valid':'EXPIRED')"
```

- `EXPIRED`가 나오면 진행하지 말고 사용자에게 `!codex login`을 요청한다 (브라우저 인증이 필요해 Claude가 대신 못 함).
- `~/.codex/hooks.json`이 파싱 에러를 내면 최상위 키가 `hooks`로 감싸져 있는지 확인한다 (`{"hooks": {"SessionStart": [...]}}`) — Claude Code용 형식과 혼동하기 쉬운 지점.

**모델 명시 (필수)**: `codex exec`는 매번 `-m <모델>`과 `-c model_reasoning_effort=<low|medium|high>`를 붙여 호출한다. `~/.codex/config.toml` 기본값에 맡기지 않는다(AGENTS.md "외부 AI 호출 시 모델 명시"). 사용자가 지정한 모델이 최우선이고, 지정이 없으면 GSD `executor_model`을 쓴다. 호출 직전에 사용자에게 모델·추론 강도를 한 줄로 알리고, 실행 로그 첫머리의 `model:` 줄이 명시한 값과 다르면 즉시 중단한다.

**실행 권한 기본값**: `-s workspace-write` (레포 안에서만 파일 쓰기, 외부 네트워크·레포 밖 접근 불가, exec 모드라 승인 요청은 `never`로 자동 거절). 주의:
- `--approve-for-me`는 그 자체로 workspace-write 샌드박스를 쓰므로 `-s`와 **함께 쓸 수 없다**(`cannot be used with '--approve-for-me'` 오류).
- `--approve-for-me`는 Claude Code auto mode 분류기가 막을 수 있다. 사용자가 명시적으로 요청할 때만 쓴다.
- 샌드박스는 네트워크를 막으므로 원격 DB(Supabase) 통합 테스트는 Codex 안에서 실패한다. Codex 자체 검증은 단위 테스트 범위(예: `npx vitest run tests/ai`)와 `npx tsc --noEmit`로 한정하고, 전체 `npm test`는 3단계에서 샌드박스 밖에서 돌린다.

사용자가 다른 수준(완전 자동 `danger-full-access` 등)을 요청하지 않는 한 이 기본값을 쓴다.

## 1단계 — 계획 (Claude / GSD)

대상 phase가 아직 안 쪼개졌으면:

```
/gsd:plan-phase <N>
```

GSD 플랜 템플릿은 이미 task마다 `<acceptance_criteria>`(grep/테스트로 검증 가능한 조건)를 강제하므로 별도 지시 없이도 TDD에 맞는 최소 단위가 나온다. 다만 순수 TDD 루프(실패하는 테스트 먼저)를 명시적으로 원하면 discuss-phase 단계에서 "각 task는 실패하는 테스트 작성 → 최소 구현 → 통과 확인 순서로 쪼갠다"를 결정사항으로 남긴다.

결과물: `.planning/phases/<NN>-<slug>/*-PLAN.md` (frontmatter에 `wave`, `depends_on`, `files_modified` 포함).

## 2단계 — 실행 위임 (Codex CLI, Sol 설계 → Luna 구현 2단 호출)

`depends_on`이 없는 wave부터 순서대로, plan 파일 하나씩 Codex에 넘긴다. 같은 wave 안에서 파일이 겹치지 않으면 병렬로 여러 `codex exec`를 동시에 실행해도 되지만, 기본은 순차 실행(레이스 컨디션·중복 커밋 방지).

plan 하나당 Codex를 **두 번** 호출한다 — 설계는 `gpt-6-sol`, 구현은 `gpt-6-luna`로 모델을 분리한다(작은 목표 쪼개기는 Sol이, 빠른 실제 구현은 Luna가 담당). Sol의 출력(작은 TDD 단위 목록)을 그대로 Luna 프롬프트에 붙여 넣어 두 호출을 체이닝한다.

### 2-a. Sol — 작은 TDD 단위 설계

```bash
codex exec \
  -C "C:/Users/chang/novelscript-mvp" \
  -m gpt-6-sol \
  -c model_reasoning_effort=medium \
  -s read-only \
  -o "<scratchpad>/codex-<plan-id>-design.txt" \
  - <<'PROMPT'
아래 계획(plan)을 코드를 건드리지 않고 분석만 하라. 목표는 각 task를 "실패하는 테스트 하나 → 최소 구현 하나"로 쪼갠, 실행 가능한 아주 작은 TDD 스텝 목록을 만드는 것이다.

각 스텝에 다음을 명시한다:
1. 작성할 실패하는 테스트(파일 경로, 테스트 이름, 무엇을 검증하는지)
2. 그 테스트만 통과시키는 데 필요한 최소 구현 범위(건드릴 파일/함수)
3. 이 스텝이 어떤 acceptance_criteria를 얼마나 충족하는지

파일을 쓰지 말고, 이 스텝 목록만 텍스트로 출력하라.

<plan>
{PLAN.md 파일 내용 전체를 여기 붙여넣는다}
</plan>
PROMPT
```

- `-s read-only`로 고정한다 — 이 호출은 설계만 하고 코드를 건드리지 않는다.
- 출력이 비었거나 스텝이 plan의 acceptance_criteria를 다 못 덮으면, 같은 프롬프트에 부족한 부분을 지적해 재호출한다. 통과할 때까지 2-b로 넘어가지 않는다.

### 2-b. Luna — 빠른 구현

```bash
codex exec \
  -C "C:/Users/chang/novelscript-mvp" \
  -m gpt-6-luna \
  -c model_reasoning_effort=medium \
  -s workspace-write \
  -o "<scratchpad>/codex-<plan-id>-result.txt" \
  - <<'PROMPT'
아래 TDD 스텝 목록을 순서대로 실행하라.

절차 (모든 스텝에 대해 반복):
1. 지정된 실패하는 테스트를 먼저 작성한다.
2. 지정된 최소 구현 범위 안에서만 테스트를 통과시킨다.
3. 프로젝트 테스트 명령(package.json의 test 스크립트)을 실행해 그린인지 스스로 확인한다.
4. 실패하면 원인을 고치고 3번부터 반복한다 — 통과 전까지 다음 스텝으로 넘어가지 않는다.
5. 모든 스텝이 끝나면 전체 테스트 스위트를 한 번 더 돌려 회귀가 없는지 확인한다.

<tdd_steps>
{2-a에서 받은 스텝 목록 전체를 여기 붙여넣는다}
</tdd_steps>

<plan>
{PLAN.md 파일 내용 전체를 여기 붙여넣는다 — acceptance_criteria 원문 확인용}
</plan>
PROMPT
```

- 2-a/2-b 각각의 `-m`·`model_reasoning_effort` 값은 예시다. "모델 명시" 규칙에 따라 매번 실제로 쓸 값으로 채우고, 실행 후 로그의 `model:` 줄이 `gpt-6-sol`/`gpt-6-luna`인지 각각 확인한다.
- ChatGPT 사용 한도 초과(`You've hit your usage limit`)로 실패하면 재시도하지 말고 해제 시각과 함께 사용자에게 알려, 기다릴지 Claude가 직접 진행할지 묻는다.
- `-o`로 마지막 응답을 파일로 받아 결과 요약을 빠르게 확인한다. 필요하면 `--json`으로 이벤트 스트림을 받아 실패한 커맨드를 추적한다.
- 두 호출 모두 Bash 도구로 동기 실행한다 (완료까지 대기 후 다음 단계로).
- Codex가 인증/샌드박스 오류를 내면 사전 조건 섹션으로 돌아가 재확인한다.
- Codex CLI가 `gpt-6-sol`/`gpt-6-luna`를 "not supported"로 거부하면 `codex --version` 확인 후 최신 안정 버전(`npm i -g @openai/codex@latest`)으로 업데이트한다 — 구버전 CLI는 이 모델들의 메타데이터를 모른다.

## 3단계 — 검수 및 로드맵 동기화 (Claude)

Codex 실행이 끝날 때마다:

1. `git status` / `git diff`로 실제 변경 내용을 확인한다 — Codex의 자체 보고를 그대로 믿지 않는다. 2-a(Sol) 설계 단계는 `read-only`라 diff가 없는 게 정상이며, 코드 변경은 2-b(Luna) 결과만 확인 대상이다.
2. 프로젝트 테스트 명령을 Claude 쪽에서도 한 번 더 돌려 그린인지 재확인한다.
3. plan의 `<acceptance_criteria>`를 grep/직접 확인으로 재검증한다.
4. 문제없으면 plan 파일의 체크박스를 갱신하고, CLAUDE.md의 기존 규칙대로 로드맵을 동기화한다:
   ```bash
   node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress <phase-number>
   ```
   결과로 `ROADMAP.md`의 phase 체크박스와 Progress 표(`Plans Complete`/`Status`/`Completed`)가 실제와 일치하는지 확인한다.
5. 문제가 있으면(테스트 실패, acceptance_criteria 미충족) 실패 내용을 요약해 같은 plan으로 Codex를 재호출하거나, 범위가 작으면 Claude가 직접 고친다.

다음 plan으로 넘어가기 전에 이 단계를 반드시 완료한다 — 검증 안 된 상태로 쌓아두지 않는다.

## 4단계 — Phase 완료 시 전체 기능검사

해당 phase의 모든 plan이 `[x]`이고 Progress 표 Status가 "Complete"가 되면:

1. Phase에 `UI hint: yes`가 있으면 UI-SPEC.md 존재를 확인한다(없으면 `/gsd:ui-phase <N>` 먼저 실행).
2. `design` 스킬로 UI-SPEC.md의 주요 화면을 아트보드로 목업하고 Artifact로 발행한다 (이미 CLAUDE.md에 명시된 규칙과 동일 — 여기서 다시 빠뜨리지 않는다).
3. 정적 목업만으로 끝내지 않고, `run` 스킬로 실제 앱을 띄워 phase의 Success Criteria(ROADMAP.md에 명시된 "무엇이 참이어야 하는가" 목록)를 하나씩 골든 패스로 눌러보며 통과/실패를 확인한다.
4. 사용자에게 Artifact 링크 + 기능검사 결과 요약(통과/실패 항목)을 함께 전달한다. 목업 링크만 주고 끝내지 않는다.

## 문제 해결

- Codex 401/토큰 만료 → `!codex login` 사용자 직접 실행 필요.
- `hooks.json` 파싱 에러 → 최상위를 `{"hooks": {...}}`로 감싼다.
- Windows에서 GSD 에이전트 스포닝이 멈추면 `plan-phase.md`의 `<windows_troubleshooting>` 절차(오래된 node 프로세스/task 디렉토리 정리)를 따른다.
