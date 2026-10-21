---
phase: 18-world-tree
plan: "13"
subsystem: world-tree
tags: [eligibility, rule-22, tdd, sql-generation]
requires: ["18-01"]
provides:
  - "WORLD_TREE_ELIGIBILITY threshold SSOT"
  - "evaluateBranchEligibility / countQualifyingDocuments pure evaluation"
  - "renderEligibilityPolicySql generated DB policy block for 18-14 (0033)"
affects: ["18-14", "18-02", "18-07", "18-09"]
tech-stack:
  added: []
  patterns: ["constant -> generated SQL block with BEGIN/END markers (drift-checked by 18-14)"]
key-files:
  created:
    - lib/world-tree/eligibility.ts
    - tests/world-tree/eligibility.test.ts
    - tests/world-tree/eligibility-policy.test.ts
  modified: []
requirements: [WTREE-03, WTREE-04]
decisions:
  - "Trim rule is an explicit code-point set (space, tab, LF, VT, FF, NBSP, U+3000, BOM) after removing all CR, so TS and SQL btrim match exactly; length = Unicode code points (char_length)."
  - "Default-template exclusion uses kb_template_seed_catalog provenance: body equal to the raw seed or the title-substituted seed (normalized) is excluded; document names are never used."
  - "readerVisible=true with 0 published chapters fails closed as parent_not_visible."
  - "Generated SQL has three internal immutable functions (thresholds with no args, body normalization, seed check); EXECUTE revoked from public/anon/authenticated, no grants."
metrics:
  duration: "~10m"
  completed: "2026-10-19"
---

# Phase 18 Plan 13: World-tree Branch Eligibility Summary

Rule 22 eligibility now has one place for its numbers: `WORLD_TREE_ELIGIBILITY` (50 published chapters, body of 200+ chars, 20 documents, 인물 5 / 장소 3 / 사건 3) lives in `lib/world-tree/eligibility.ts`. The same file has a pure evaluator that works from server facts only, and `renderEligibilityPolicySql()`, which builds the DB policy SQL from that constant. 18-14 pastes that SQL into 0033.

## What was built

- `WORLD_TREE_ELIGIBILITY` (frozen) and `eligibilityThresholds()`, which maps the constant to the 18-01 `BranchEligibilityThresholds` shape.
- `normalizeEligibilityBody` / `eligibilityBodyLength`: removes CR, trims a shared set of characters and counts code points, so surrogate pairs count as one character.
- `isQualifyingDocument` / `countQualifyingDocuments`: counts only rows with scope=work, the same source work, node_type=file, deleted_at null and a category in KB_CATEGORIES (the real Korean keys from `lib/kb/categories.ts`). The body must be at least 200 characters after normalization. Untouched canonical seeds, raw or title-substituted, are excluded. 회차, template, custom and unexpected categories are never counted.
- `evaluateBranchEligibility(serverFacts)`: when readerVisible is false, it stops early and returns `parent_not_visible` with counts 0 (meaning "not counted"). Otherwise every shortfall reason is computed separately. 세력 and 아이템 count toward the total only.
- `renderEligibilityPolicySql()`: output is deterministic and wrapped in BEGIN/END markers. It defines `world_tree_eligibility_thresholds()` (no arguments), `world_tree_eligibility_body(text)` and `world_tree_eligibility_is_untouched_seed(text,text,text)`, all immutable with `search_path = pg_catalog`. Backslashes in the name passed to regexp_replace are escaped. The JSDoc records how to regenerate the SQL and the `needs_migration_number` rule.

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | RED | 9569710 | test(18-13): add failing eligibility boundary tests |
| 1 | GREEN | d5f8200 | feat(18-13): implement rule-22 eligibility constants and pure evaluation |
| 2 | RED | 3d55a37 | test(18-13): add failing eligibility SQL policy contract tests |
| 2 | GREEN | 7672b5f | feat(18-13): generate DB eligibility policy SQL from the shared constant |

## Verification

- `npx vitest run --project unit tests/world-tree/eligibility.test.ts tests/world-tree/eligibility-policy.test.ts`: 2 files, 35 tests passed. Both RED phases failed first, as expected (missing module, then missing function).
- `npx tsc --noEmit` shows no errors in these files, and eslint is clean on all three.

## Deviations from Plan

- **[Rule 2 - Correctness] Fail-closed visibility:** readerVisible=true with 0 published chapters (inconsistent facts) is treated as `parent_not_visible`. Invalid chapter counts (NaN, negative, fractional) are treated as 0.
- **[Rule 2 - Correctness] SQL helper functions:** besides the no-argument thresholds function, the generated block has body-normalization and seed-provenance helpers. Without them, TS and SQL could drift on trim and character-count rules. None of the helpers takes a threshold argument.
- Field-name mapping: the plan's constant names (`minDocumentBodyChars`, `minSettingDocuments`, `categoryMinimums`) are kept on `WORLD_TREE_ELIGIBILITY`. They map to the 18-01 summary's `minDocumentChars` / `minQualifyingDocuments` / `minCategoryDocuments` without changing types.ts.

## Gaps / Not done (by design)

- No migration was written. 0033 and the drift test (`eligibility-source.test.ts`) belong to 18-14. The generated SQL has not been run against Postgres, so its syntax and behavior (btrim with a chr() set, POSIX `[[:space:]]` versus JS `\s` in the title placeholder, which only matters for non-ASCII whitespace inside the tag) still need to be proven by 18-14/18-12 DB tests.
- No live-DB suites were run. STATE.md, ROADMAP.md and graphify were not updated, as the orchestrator instructed.
- WTREE-09 locking, store sale eligibility UI/RPC, branches.ts / owner.ts / actions.ts are untouched.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/world-tree/eligibility.ts, tests/world-tree/eligibility.test.ts, tests/world-tree/eligibility-policy.test.ts
- FOUND commits: 9569710, d5f8200, 3d55a37, 7672b5f
