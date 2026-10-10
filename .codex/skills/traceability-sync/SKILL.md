---
name: traceability-sync
description: "Use to audit and re-sync the roadmap (.planning/ROADMAP·STATE·REQUIREMENTS), the SSOT (docs/SSOT-PLANNING-IMPLEMENTATION.md) and the graphify knowledge graph, then run graphify update plus the requirement-ID linking script. Trigger on: 로드맵·SSOT·그래프 연결/동기화/불일치 점검, phase 상태 동기화, graphify 갱신."
---

# traceability-sync

This skill is a pointer. The canonical instructions live in `.planning/skills/traceability-sync.md`,
shared across Claude, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/traceability-sync.md` in full — that is the real skill body.
2. Follow its procedure: audit (read-only, report a 문서/적힌 내용/실제 table), sync docs in the
   order REQUIREMENTS → ROADMAP → STATE → SSOT, rebuild the graph with `graphify update .` and
   immediately `python3 scripts/graph-link-requirements.py`, verify with `graphify explain`, then
   commit and push to the working branch (no PR unless asked).
3. Answer the user in Korean.
