<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## 외부 AI 호출 시 모델 명시

Codex CLI, GSD 서브에이전트, 그 밖의 AI를 호출할 때는 **예외 없이 모델을 명시한다.** 도구의 기본값이나 전역 설정(`~/.codex/config.toml` 등)에 맡기지 않는다.

- **Codex CLI**: `codex exec`를 호출할 때마다 `-m <모델>`을 반드시 붙인다. 추론 강도를 정했다면 `-c model_reasoning_effort=<low|medium|high>`도 함께 넘긴다.
  - 예: `codex exec -m gpt-5.6-terra -c model_reasoning_effort=medium -s workspace-write ...`
- **Claude 서브에이전트(Agent 도구)**: `model` 파라미터(`opus`/`sonnet`/`haiku`/`fable`)를 명시한다.
- **모델 선택 기준**: 사용자가 지정한 모델을 최우선으로 쓴다. 지정이 없으면 GSD 설정의 역할별 모델(`gsd-tools.cjs init`의 `planner_model`/`executor_model` 등)을 쓴다. 그 값을 해당 도구가 지원하지 않으면 임의로 대체하지 말고, 사용자에게 어떤 모델로 할지 먼저 묻는다.
- **호출 전 보고**: 호출하기 직전에 사용자에게 어떤 도구를 어떤 모델·추론 강도로 부르는지 한 줄로 알린다.
- **호출 후 확인**: Codex는 실행 로그 첫머리의 `model:` 줄로 실제 모델을 확인한다. 명시한 모델과 다르면 즉시 중단하고 사용자에게 알린다.
