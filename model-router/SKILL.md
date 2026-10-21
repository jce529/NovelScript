---
name: model-router
description: Route coding tasks: classify with Jev, then handle directly or delegate to Codex CLI, log outcomes, and tune routing rules.
---

# Model Router

When the user gives a coding task, handle it with the steps below without asking which model to use. If the user explicitly says "use Claude" or "use Codex", that always wins.

Report to the user in Korean, briefly. Everything else (prompts to Codex/Jev, logs, rules files) stays in English.

## 1. Classify (via Jev)

Do not classify yourself; use Jev for speed and cost.

1. Find the jev MCP server's tools in the available tool list. Do not guess tool names; read the list and schemas.
2. Call a Choice-type tool with the task description and these options:
   - design: architecture, structural decisions, multi-file refactors, tasks needing long context
   - implement: feature work with clear scope and completion criteria
   - bugfix: fixing a bug that has reproduction steps
   - review: code review, root-cause analysis, explanation
   - boilerplate: repetitive or mechanical code generation
3. If the top probability is below 0.7, do not trust it; handle the task yourself. Use the threshold in `.model-router/rules.md` if one is set there.
4. If the jev tools are missing or the call fails, classify yourself and log `classifier: claude(fallback)`.

## 2. Assign

Follow `.model-router/rules.md` in the project if it exists. Otherwise use these defaults. They are hypotheses, to be tuned from the log in step 6.

| type | default |
|---|---|
| design | Claude |
| review | Claude |
| implement | Codex |
| bugfix | Codex |
| boilerplate | Codex |

Regardless of type, Claude handles the task itself when: it depends heavily on the current conversation context, the delegation brief would be longer than the task, or the Codex CLI is missing or failed.

## 3. Delegate to Codex

1. Check `which codex` and read `codex exec --help`. Do not guess option names.
2. Write a brief containing: goal, target files, completion criteria, and what must not be touched. Summarize any needed conversation context.
3. Restrict write access to the current working directory. Run `git status` first and confirm a clean state.
4. After the run, read `git diff` yourself and run build/tests where possible. For Unity projects, check compile errors and console warnings.
5. If verification fails, retry once with a specific fix instruction. If it still fails, finish the task yourself.

## 4. Log

After each task, append one line to `.model-router/log.md`:

`date | type | jev confidence | assigned model | passed first try | fix count | note`

Log only observed results, never guesses.

## 5. Report

Tell the user in one line (in Korean) which model did what, then a short summary of the result.

## 6. Tune rules

When there are 5 or more entries for the same type, and only if the user asks, summarize pass rate and fix count per type and propose changes to `.model-router/rules.md`. Also check whether Jev classifications often disagree with actual outcomes. Never change the rules file without user approval.
