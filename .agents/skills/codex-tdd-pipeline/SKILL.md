---
name: codex-tdd-pipeline
description: 사용자가 "GPT로 넘겨서 구현해줘", "Codex로 실행해줘", "TDD로 쪼개서 진행해줘", "코덱스한테 위임", "GPT Plus로 짜게 해줘" 등으로 계획-실행 분리 파이프라인을 요청할 때 사용한다. Codex가 GSD로 phase를 TDD 단위 계획으로 쪼개고, 실제 코드 작성/자체 검증은 로컬 Codex CLI(ChatGPT 로그인, GPT Plus)에 위임하고, Codex가 결과를 검수·로드맵 동기화한 뒤 phase 완료 시 Artifact 목업으로 전체 기능검사를 제공하는 절차를 정의한다.
---

# Codex TDD 파이프라인

Codex(계획·검수·목업) ↔ Codex CLI(구현·자체검증)를 분리한 하이브리드 실행 절차. "계획은 Codex, 코딩은 Codex, 통합·검증·목업은 다시 Codex" 순환을 phase의 모든 plan이 끝날 때까지 반복한다.

## 사전 조건

시작 전 매번 확인한다:

```bash
codex --version              # 설치 확인
node -e "const j=require(require('os').homedir()+'/.codex/auth.json');const p=JSON.parse(Buffer.from(j.tokens.access_token.split('.')[1],'base64url').toString());console.log(new Date(p.exp*1000)>new Date()?'valid':'EXPIRED')"
```

- `EXPIRED`가 나오면 진행하지 말고 사용자에게 `!codex login`을 요청한다 (브라우저 인증이 필요해 Codex가 대신 못 함).
- `~/.codex/hooks.json`이 파싱 에러를 내면 최상위 키가 `hooks`로 감싸져 있는지 확인한다 (`{"hooks": {"SessionStart": [...]}}`) — Codex용 형식과 혼동하기 쉬운 지점.

**실행 권한 기본값**: `-s workspace-write --approve-for-me` (레포 안에서만 파일 쓰기/명령 실행 자동승인, 외부 네트워크·레포 밖 접근은 불가). 사용자가 다른 수준(완전 자동 `danger-full-access` 또는 플랜마다 수동 승인)을 요청하지 않는 한 이 기본값을 쓴다.

## 1단계 — 계획 (Codex / GSD)

대상 phase가 아직 안 쪼개졌으면:

```
/gsd:plan-phase <N>
```

GSD 플랜 템플릿은 이미 task마다 `<acceptance_criteria>`(grep/테스트로 검증 가능한 조건)를 강제하므로 별도 지시 없이도 TDD에 맞는 최소 단위가 나온다. 다만 순수 TDD 루프(실패하는 테스트 먼저)를 명시적으로 원하면 discuss-phase 단계에서 "각 task는 실패하는 테스트 작성 → 최소 구현 → 통과 확인 순서로 쪼갠다"를 결정사항으로 남긴다.

결과물: `.planning/phases/<NN>-<slug>/*-PLAN.md` (frontmatter에 `wave`, `depends_on`, `files_modified` 포함).

## 2단계 — 실행 위임 (Codex CLI)

`depends_on`이 없는 wave부터 순서대로, plan 파일 하나씩 Codex에 넘긴다. 같은 wave 안에서 파일이 겹치지 않으면 병렬로 여러 `codex exec`를 동시에 실행해도 되지만, 기본은 순차 실행(레이스 컨디션·중복 커밋 방지).

```bash
codex exec \
  -C "C:/Users/MSI/NovelScript" \
  -s workspace-write --approve-for-me \
  -o "<scratchpad>/codex-<plan-id>-result.txt" \
  - <<'PROMPT'
아래 계획을 TDD로 실행하라.

절차 (모든 task에 대해 반복):
1. acceptance_criteria를 검증하는 실패하는 테스트를 먼저 작성한다.
2. 테스트를 통과시키는 최소 구현을 작성한다.
3. 프로젝트 테스트 명령(package.json의 test 스크립트)을 실행해 그린인지 스스로 확인한다.
4. 실패하면 원인을 고치고 3번부터 반복한다 — 통과 전까지 다음 task로 넘어가지 않는다.
5. 모든 task가 끝나면 전체 테스트 스위트를 한 번 더 돌려 회귀가 없는지 확인한다.

<plan>
{PLAN.md 파일 내용 전체를 여기 붙여넣는다}
</plan>
PROMPT
```

- `-o`로 마지막 응답을 파일로 받아 결과 요약을 빠르게 확인한다. 필요하면 `--json`으로 이벤트 스트림을 받아 실패한 커맨드를 추적한다.
- 이 호출은 Bash 도구로 동기 실행한다 (완료까지 대기 후 다음 단계로).
- Codex가 인증/샌드박스 오류를 내면 사전 조건 섹션으로 돌아가 재확인한다.

## 3단계 — 검수 및 로드맵 동기화 (Codex)

Codex 실행이 끝날 때마다:

1. `git status` / `git diff`로 실제 변경 내용을 확인한다 — Codex의 자체 보고를 그대로 믿지 않는다.
2. 프로젝트 테스트 명령을 Codex 쪽에서도 한 번 더 돌려 그린인지 재확인한다.
3. plan의 `<acceptance_criteria>`를 grep/직접 확인으로 재검증한다.
4. 문제없으면 plan 파일의 체크박스를 갱신하고, AGENTS.md의 기존 규칙대로 로드맵을 동기화한다:
   ```bash
   node "$HOME/.Codex/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress <phase-number>
   ```
   결과로 `ROADMAP.md`의 phase 체크박스와 Progress 표(`Plans Complete`/`Status`/`Completed`)가 실제와 일치하는지 확인한다.
5. 문제가 있으면(테스트 실패, acceptance_criteria 미충족) 실패 내용을 요약해 같은 plan으로 Codex를 재호출하거나, 범위가 작으면 Codex가 직접 고친다.

다음 plan으로 넘어가기 전에 이 단계를 반드시 완료한다 — 검증 안 된 상태로 쌓아두지 않는다.

## 4단계 — Phase 완료 시 전체 기능검사

해당 phase의 모든 plan이 `[x]`이고 Progress 표 Status가 "Complete"가 되면:

1. Phase에 `UI hint: yes`가 있으면 UI-SPEC.md 존재를 확인한다(없으면 `/gsd:ui-phase <N>` 먼저 실행).
2. `design` 스킬로 UI-SPEC.md의 주요 화면을 아트보드로 목업하고 Artifact로 발행한다 (이미 AGENTS.md에 명시된 규칙과 동일 — 여기서 다시 빠뜨리지 않는다).
3. 정적 목업만으로 끝내지 않고, `run` 스킬로 실제 앱을 띄워 phase의 Success Criteria(ROADMAP.md에 명시된 "무엇이 참이어야 하는가" 목록)를 하나씩 골든 패스로 눌러보며 통과/실패를 확인한다.
4. 사용자에게 Artifact 링크 + 기능검사 결과 요약(통과/실패 항목)을 함께 전달한다. 목업 링크만 주고 끝내지 않는다.

## 문제 해결

- Codex 401/토큰 만료 → `!codex login` 사용자 직접 실행 필요.
- `hooks.json` 파싱 에러 → 최상위를 `{"hooks": {...}}`로 감싼다.
- Windows에서 GSD 에이전트 스포닝이 멈추면 `plan-phase.md`의 `<windows_troubleshooting>` 절차(오래된 node 프로세스/task 디렉토리 정리)를 따른다.
