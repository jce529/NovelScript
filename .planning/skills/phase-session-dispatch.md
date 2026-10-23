# phase-session-dispatch

`/gsd:manager`(총괄 세션)에서 사용자가 **승인한 phase에 한해** phase 전용 세션을 만들어 맡기고, 그 결과를 총괄이 반영하는 절차. 원본은 이 문서이고 `.claude/skills/`·`.codex/skills/`는 포인터다.

## 언제 쓰나

- `/gsd:manager`가 Discuss / Plan / Execute를 dispatch하려는 모든 순간. 기본 동작(인라인 Skill, `Agent(run_in_background)`) 대신 이 절차를 따른다.
- 사용자가 "phase 12, 13 세션으로 돌려줘"처럼 직접 요청할 때.

## 원칙

1. **승인한 phase만 세션을 만든다.** 사용자가 phase 번호를 명시해 허용한 것(예: "12, 13")만 대상이다. manager 메뉴의 "Continue"처럼 여러 액션을 묶은 선택이면, 대상 phase 목록을 한 줄로 보여주고 확인받은 뒤에 만든다. 추천된 phase라도 승인 전에는 만들지 않는다.
2. **phase 하나 = 세션 하나.** 승인한 phase 수만큼만 만든다. 12, 13을 허용하면 세션 2개이고, 총괄 세션은 그대로 남는다.
3. **총괄 세션은 진행도만 본다.** STATE / ROADMAP / REQUIREMENTS / SSOT / 그래프는 총괄만 수정한다. 논의·plan·실행·UAT·버그 처리 같은 세부는 phase 세션이 한다.
4. **하위 결과의 검증은 사용자가 phase 세션에서 한다.** 총괄은 그 보고를 받아 반영만 하고, 결과물을 다시 감사하지 않는다.

## 만들기 전 확인 (총괄)

- `git status`를 본다. 커밋 안 된 변경이 worktree 세션에 필요한 것이면 사용자에게 먼저 커밋할지 묻는다. (worktree는 마지막 커밋 기준으로 시작한다.)
- 승인된 phase끼리 의존·파일 겹침이 있는지 ROADMAP으로 확인한다. 겹치면 사용자에게 알리고 순서를 묻는다.
- 같은 phase의 세션이 이미 있는지 `list_sessions`로 본다. 있으면 새로 만들지 않고 그 세션에 메시지를 보낸다.

## 세션 만들기

phase마다 `mcp__ccd_session__start_session`을 쓴다. 호출 직전 메시지에 굵은 제목과 한 문장을 쓴다. 두 개 이상이면 먼저 `mark_chapter`로 묶는다.

- `initiation`: `user_asked` (사용자가 승인했으므로)
- `context`: `fresh`
- `use_worktree`: `true` (쓰기 작업이고 phase끼리 병렬이므로)
- 세션 이름·제목: `Phase {NN} {phase 이름}`

### 브리프 템플릿

```
Phase {NN} ({이름}) 담당 세션이다. 총괄 세션이 사용자 승인 후 만들었다.

필수로 읽을 것: CLAUDE.md, AGENTS.md, .planning/STATE.md, .planning/ROADMAP.md의 이 phase 항목,
{phase_dir}/ 안의 CONTEXT / RESEARCH / UI-SPEC / PLAN (있는 것).
요구사항 ID: {IDs}
시작 단계: {discuss | plan | execute | verify} (현재 상태: {STATE 기준 한 줄})

규칙
- 수정 범위는 {phase_dir}/ 와 이 phase의 코드·테스트뿐이다.
- .planning/STATE.md, ROADMAP.md, REQUIREMENTS.md, docs/SSOT-*.md, graphify-out/ 은 수정하지 않는다. 총괄이 반영한다.
- 논의·plan 승인·UAT는 사용자와 이 세션에서 직접 한다. 결정이 필요하면 사용자에게 묻는다.
- 모델 배정은 jev-model-routing 스킬과 AGENTS.md의 외부 AI 호출 규칙을 따른다.
- 버그는 bug-plan → bug-execute → bug-complete로 처리한다.
- 사용자가 "검증 끝" / "반영해"라고 한 뒤에만 총괄에 보고한다. 보고에는 phase, 브랜치, 충족한 요구사항 ID, 남은 이슈, 완료한 plan 수를 한 덩어리로 적는다.
```

## 보고를 받은 뒤 (총괄)

1. 보고가 사용자의 "검증 끝"을 거친 것인지 확인한다. 아니면 반영하지 않고 사용자에게 확인을 묻는다.
2. 반영한다: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress <phase>` → STATE.md 갱신 → `traceability-sync` 스킬 절차(REQUIREMENTS → ROADMAP → STATE → SSOT → `graphify update .` → `python3 scripts/graph-link-requirements.py`).
3. 동기화 결과를 커밋한다. 이때 phase 브랜치는 병합하지 않는다.
4. 브랜치 병합은 사용자가 지시할 때만 한다. 병합 전에는 각 브랜치를 `refs/heads/...` 전체 이름으로 알리고 묻는다.
5. 대시보드(manager)로 돌아가 다음 승인을 기다린다.

## 하지 않는 것

- 승인 없는 phase 세션 생성, 승인된 수를 넘는 생성.
- 총괄에서 phase 세부 논의·plan 결정.
- 하위 세션의 브랜치를 사용자 지시 없이 병합하거나 push.
- 클라우드 세션 사용(보고가 돌아오지 않으므로). 사용자가 요청할 때만.
