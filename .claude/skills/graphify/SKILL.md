---
name: graphify
description: "Use for any question about a codebase, its architecture, file relationships, or project content — especially when graphify-out/ exists, where the question should be treated as a graphify query first. Turns any input (code, docs, papers, images, videos) into a persistent knowledge graph with god nodes, community detection, and query/path/explain tools."
---

# graphify

This skill is a pointer. The canonical instructions live in `.codex/skills/graphify/`,
shared with the Codex CLI so both agents follow one copy and stay in sync when
`graphify` is upgraded.

## How to use this skill

1. Read `.codex/skills/graphify/SKILL.md` in full — that is the real skill body.
2. Read the reference file that matches the task:

   | File | Covers |
   |---|---|
   | `references/query.md` | `query` / `path` / `explain` — reading the graph |
   | `references/update.md` | `update` — incremental rebuild after code changes |
   | `references/extraction-spec.md` | how nodes and edges are extracted |
   | `references/exports.md` | SVG, GraphML, Neo4j, FalkorDB, wiki, Obsidian |
   | `references/hooks.md` | post-commit auto-rebuild hook |
   | `references/add-watch.md` | `add <url>` and `--watch` |
   | `references/transcribe.md` | audio/video ingestion |
   | `references/github-and-merge.md` | cloning repos and cross-repo merges |

   All paths are relative to `.codex/skills/graphify/`.

## Environment (verified on this machine)

- CLI: `graphify` 0.9.56, installed as the Python package `graphifyy` under
  `C:\Users\chang\AppData\Local\Programs\Python\Python313`. Already on PATH.
- Graph data: `graphify-out/` (relative paths only, so it is portable).
- Skipping the install-detection block in Step 1 of the canonical SKILL.md is fine
  while `graphify --version` succeeds.

## Project rules

`AGENTS.md` (imported by `CLAUDE.md`) carries the binding rules — prefer
`graphify query` over raw grep for codebase questions, and run `graphify update .`
after modifying code. Those rules win over anything here.
