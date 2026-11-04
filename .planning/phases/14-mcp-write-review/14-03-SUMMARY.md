---
phase: 14-mcp-write-review
plan: 03
subsystem: proposals
tags: [diff, paragraph-merge, sha256]
requires: [14-01]
provides: [lib/proposals/paragraph-merge.ts, lib/proposals/hash.ts]
affects: [14-04]
tech-stack:
  added: []
  patterns: [diffArrays paragraph tokens, pure functions]
key-files:
  created:
    - lib/proposals/paragraph-merge.ts
    - lib/proposals/hash.ts
    - tests/proposals/paragraph-merge.test.ts
    - tests/proposals/hash.test.ts
requirements: [MCP-05, MCP-06]
metrics:
  completed: 2026-11-04
---

# Phase 14 Plan 03: Paragraph merge + hash Summary

Pure paragraph 3-way merge (diffArrays, re-anchoring on changed current, non-applicable detection) and a UTF-8 SHA-256 hash helper.

## API
- `tokenize(text)`: paragraph + trailing newlines, `join('') === text`.
- `computeHunks(base, draft, current)`: hunks `{index, kind(바뀜|추가|삭제), before, after, applicable, anchor}`.
- `applySelectedHunks(current, hunks, [{index, editedText?}])`: no selection returns current bytes; throws on unknown/duplicate/non-applicable index or edited deletion.
- `hashContent(text)`: sha256 hex of UTF-8.

## Tests
22 unit tests pass (paragraph-merge + hash). tsc clean for these files. DB-side hash equivalence is deferred to 14-04.

## Decisions
- Empty base and empty current: insertion is applicable; empty current with non-empty base: insertion not applicable.
- Pure insertion with prev unmapped falls back to next-anchor; overlapping equal positions applied in descending index so order is preserved.

## Deviations
None.

## Self-Check: PASSED
