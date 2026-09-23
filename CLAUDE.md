@AGENTS.md

# Language

사용자와의 모든 대화는 한국어로 진행한다.

# GSD 실행 후 로드맵 동기화

executor(gsd-executor, `/gsd:execute-phase` 등)가 plan 실행을 끝낼 때마다, 반드시 `.planning/ROADMAP.md`를 실제 완료 상태와 일치시킨다:

1. 해당 phase에 대해 다음을 실행한다: `node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" roadmap update-plan-progress <phase-number>`
2. 결과를 확인해 ROADMAP.md 상단 phase 체크박스(`- [ ]` → `- [x]`)와 하단 Progress 표의 `Plans Complete`/`Status`/`Completed` 열이 실제 SUMMARY.md 개수·완료일과 일치하는지 검증한다.
3. 자동 갱신이 안 됐거나 phase가 실행기 밖(수동 버그 수정 등)에서 완료 처리된 경우, 위 값을 직접 수정해 어긋난 상태로 남겨두지 않는다.

이 확인은 executor 세션이 끝날 때마다 매번 수행한다 — plan 하나만 끝났을 때도, phase 전체가 끝났을 때도 동일하게 적용한다.

# UI phase 완료 후 예시 목업 제공

UI 관련 phase(`/gsd:ui-phase` 등)에서 UI-SPEC.md 작성/검증이 끝나면, 문서만 전달하지 말고 사용자가 브라우저에서 직접 볼 수 있는 예시 목업도 함께 제공한다:

1. `design` 스킬을 사용해 UI-SPEC.md에 정의된 주요 화면(들)을 아트보드로 목업한다.
2. Artifact로 발행해 링크를 전달한다 — 사용자가 클릭해서 바로 확인할 수 있어야 한다.
3. UI-SPEC.md 승인만으로 phase의 UI 산출물을 끝냈다고 보지 않는다 — 목업 제공까지가 완료 조건이다.

# 버그 워크플로

버그를 발견/조사/수정/정리하는 전 과정은 `bug-plan` → `bug-execute` → `bug-complete` 세 스킬로 한다 (사용자가 `/bug-plan`, `/bug-execute`, `/bug-complete`로 직접 부를 수도 있다). 세 스킬 모두 `.claude/skills/`와 `.codex/skills/`에 동일하게 있고(각 에이전트가 자기 폴더만 읽으므로 `.agents/skills/`에는 중복 배치하지 않는다 — Codex가 `.agents/`도 같이 읽어서 명령이 두 번 뜨는 문제가 있었음), 실제 절차는 `.planning/skills/bug-plan.md` / `bug-execute.md` / `bug-complete.md`에 있다 — 이 문서들이 규칙의 원본이므로 버그 처리 절차를 바꿀 때는 거기를 고친다.

요약: 버그 발견 시 `bug-plan`이 원인 phase의 `bugs/` 폴더에 `BUG-NN-....md`를 만들고(정책 결정이 필요하면 사용자에게 먼저 확인), `bug-execute`가 그 방향대로 고치고 커밋하고, `bug-complete`가 검증된 수정만 `.planning/fixed/{phase}-{NN} 간단한 정리.md`로 옮기고 원본 문서/인덱스를 정리한다.
