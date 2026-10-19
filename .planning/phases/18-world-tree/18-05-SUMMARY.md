---
phase: 18-world-tree
plan: "05"
subsystem: world-tree
tags: [metrics, wtree-08, tdd]
requires: [18-04]
provides: [lib/world-tree/metric-adapter.ts, lib/world-tree/metrics.ts]
affects: [18-06, 18-08]
tech-stack:
  patterns: [single temporary adapter, sentinel row for global normalization]
key-files:
  created:
    - lib/world-tree/metric-adapter.ts
    - lib/world-tree/metrics.ts
    - tests/world-tree/metric-adapter.test.ts
    - tests/world-tree/metrics.test.ts
requirements-completed: [WTREE-08]
completed: 2026-10-19
---

# Phase 18 Plan 05: Metric adapter and visual coefficients Summary

Single feed-proxy-v1 popularity adapter (reuses computeTrendingScores with a global-maxima sentinel row) plus pure proximity, branch stroke and fruit diameter functions.

## What was built
- `metric-adapter.ts`: `computeWorldTreePopularity(raw, baseline)` clamps raw to the public global maxima, adds a sentinel row, and drops its score, so the same raw gives the same score in every world. Malformed, negative and nonfinite values close to 0, ctr clamps to 0..1, and the result clamps to 0..100. `loadWorldTreePopularity` makes one baseline RPC and scores work nodes only (broken stubs skipped), returning a typed note with kind `feed-proxy-v1`, `temporary: true`, the author-view cutoff, and limitations (mixed past counts, anonymous authors not identifiable). `chapterViewsToRaw` reproduces the feed's adjacent-views ratio average.
- `metrics.ts`: `branchProximity`, `branchStroke` (1..6px), `fruitDiameter` (14..44px), `strokeForNode` (fixed neutral 2px for stubs), and a frozen `METRIC_COEFFICIENTS` with `provisional: true` and a 44px touch target.

## Deviations from Plan
- Adapter takes the already-aggregated per-work raw metrics from the get_world_tree projection (totalViews/likeCount/ctr) and does not load chapters or likes, so no 150-ID batching was needed. The chapter-views helper exists for future adapters. The raw is clamped to the baseline maxima before normalization so an outlier cannot rescale the sentinel.
- The next-docs reading steps in the task action were skipped because both files are pure server-agnostic lib code with no Next APIs.

## Gaps
- No UI wiring yet (consumers: layout/fruit components in later plans). No live-DB tests were run; the baseline RPC is exercised only through a mock.
- graphify update and requirement-link scripts were not run, per instructions.

## Verification
- `npx vitest run --project unit tests/world-tree/metrics.test.ts tests/world-tree/metric-adapter.test.ts`: 18 passed.
- `npx tsc --noEmit`: clean.

## Self-Check: PASSED
