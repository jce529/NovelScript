---
phase: 15-jev-ai
plan: 05
subsystem: testing
tags: [jev, jsonl, vitest, zod, calibration, holdout]

# Dependency graph
requires:
  - phase: 15-02
    provides: task/category and folder/template planning functions used by the evaluator
  - phase: 15-11
    provides: activation thresholds, metrics gate, and persistent evidence recording
provides:
  - Versioned synthetic JSONL evaluation sets with dataset hashing
  - Candidate-order and calibration/holdout evaluation flow for Jev decisions
  - Fixture-safe CLI and real-vendor holdout evidence recording
affects: [15-09 activation gate, AIDOC-04, Jev confidence thresholds]

# Tech tracking
tech-stack:
  added: [tsx 4.23.12]
  patterns: [calibration-only confidence recommendations, holdout-only activation evidence, production planner reuse]

key-files:
  created:
    - lib/ai/decision/eval/golden-set.v1.jsonl
    - lib/ai/decision/eval/folder-template-set.v1.jsonl
    - lib/ai/decision/eval/evaluate.ts
    - lib/ai/decision/eval/run-eval.ts
    - tests/ai/jev-golden-set.test.ts
    - tests/ai/jev-eval.test.ts
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - lib/ai/decision/eval/golden-set.ts

key-decisions:
  - "Folder/template evaluation calls planFolderAndTemplateFromCandidates so opaque keys, deterministic ordering, fallbacks, and configured thresholds match production."
  - "Confidence recommendations use calibration rows only; activation evidence uses holdout rows only and requires a real vendor run."
  - "The computed 0.90 thresholds remain recommendations; config.ts was not changed."

patterns-established:
  - "Every JSONL row includes split, rationale, difficulty, tags, and reviewer metadata."
  - "The dataset hash covers both exact JSONL byte streams separated by a fixed delimiter."

requirements-completed: [AIDOC-04]

# Metrics
duration: 29min
completed: 2026-09-27
---

# Phase 15 Plan 05 Summary

**Synthetic Jev evaluation sets now exercise production decision planners, candidate-order sensitivity, split-isolated confidence recommendations, and real-vendor-only activation evidence.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-09-27T04:27:58Z
- **Completed:** 2026-09-27T04:57:00Z
- **Tasks:** 2
- **Files modified:** 11 plan files, plus refreshed graphify outputs

## Accomplishments

- Added 154 synthetic task/category rows and 40 folder/template rows, including required class/category coverage and stratification tags.
- Added deterministic SHA-256 dataset hashing, ECE, accuracy, threshold recommendation, and conservative order-sensitivity metrics.
- Added `npm run eval:jev`; fixture runs skip evidence recording, while real vendor runs submit holdout metrics through `recordActivationEvidence`.
- Recorded dataset hash: `bb82b14e7ed87d9535767f16c63d443a9112b2f2c11eb1442b3163c652501ae7`.
- Fixture calibration recommended `JEV_CONFIDENCE_THRESHOLDS.taskAndCategory=0.90` and `JEV_CONFIDENCE_THRESHOLDS.folderAndTemplate=0.90`. These values are recorded here only; `config.ts` was left unchanged.

## Task Commits

Committed from the main session (Codex sandbox couldn't write `.git/index.lock`).

## Live Vendor Evaluation (post-summary addendum)

Ran `npm run eval:jev` against the real Jev API (`.env.local` credentials) outside the sandbox:

```
accuracy=0.605~0.623 calibrationError=0.140~0.156 orderSensitivityDrop=0.000 folderTemplateAccuracy=0.533 meetsActivationThreshold=false
```

- Real Jev task/category accuracy (~60-62%) and folder/template accuracy (~53%) are both well below `JEV_ACTIVATION_THRESHOLDS` (0.85 / 0.80) — activation correctly stays blocked.
- `recordActivationEvidence` returned `{ recorded: false }` and the CLI exited 1 as designed — **not a code defect**. Root cause: migrations `0010_kb_category_root_unique.sql` and `0011_ai_doc_planning.sql` have not been applied to the live Supabase project yet (`ai_doc_activation_evidence` doesn't exist there — confirmed via `PGRST205`). Recorded in `.planning/STATE.md` Blockers.
- Recommended confidence threshold for `folderAndTemplate` varied between runs (0.70 vs 0.90) since it's computed from live (non-deterministic) vendor responses — expected for an advisory metric, not committed to `config.ts`.

## Files Created/Modified

- `lib/ai/decision/eval/golden-set.v1.jsonl` - Versioned synthetic task/category set.
- `lib/ai/decision/eval/folder-template-set.v1.jsonl` - Synthetic folder/template planner cases.
- `lib/ai/decision/eval/golden-set.ts` - JSONL schema, loaders, and dataset hash.
- `lib/ai/decision/eval/evaluate.ts` - Pure evaluation and calibration functions.
- `lib/ai/decision/eval/run-eval.ts` - Fixture/real CLI orchestration and evidence recording.
- `tests/ai/jev-golden-set.test.ts`, `tests/ai/jev-eval.test.ts` - 17 acceptance tests.
- `package.json`, `package-lock.json`, `.gitignore` - `tsx`, CLI script, and local report ignore rule.
- `graphify-out/` - Refreshed graph outputs from the required `graphify update .` command; these files were already dirty before this plan began.

## Decisions Made

- Followed the live `FolderCandidate` and `TemplateOption` interfaces and used the existing planner entry point as required.
- Used the locally cached `tsx@4.23.12` package because registry access was denied in this environment; package and lockfile now resolve to that exact version.
- Kept the provisional activation thresholds in `config.ts` unchanged and reported the calibration recommendations for later human review.

## Deviations from Plan

### Auto-fixed Issues

**1. Local npm registry access unavailable**
- **Found during:** Task 2 dependency installation.
- **Issue:** `npm install -D tsx` could not reach `registry.npmjs.org`, and npm's default cache path was not writable.
- **Fix:** Used the existing local npm-exec cache for `tsx@4.23.12` and its `esbuild@0.28.2` dependency, then aligned `package.json` and `package-lock.json` to those exact package records.
- **Verification:** `npm ls tsx esbuild --all --depth=1` resolved both packages; the full fixture verification chain passed.

**2. Windows tsx user lookup failure in this sandbox**
- **Found during:** Task 2 CLI verification.
- **Issue:** tsx called `os.userInfo()` and Node returned `uv_os_get_passwd ... ENOMEM` in this environment.
- **Fix:** Used a temporary `NODE_OPTIONS` preload for verification only to supply the UID path and clear vendor credentials after Node loaded `.env.local`; no shim file was retained.
- **Verification:** `npm run eval:jev` completed in fixture mode and printed `fixture run` and `meetsActivationThreshold=false`.

---

**Total deviations:** 2 environment workarounds
**Impact on plan:** No product behavior changed. Registry installation and direct tsx startup depend on environment capabilities; fixture evaluation, tests, and type checking passed with temporary execution setup.

## Issues Encountered

- A real-vendor execution selected the live path and returned `recorded: false` from activation evidence persistence in this environment. The CLI surfaced this as a nonzero failure as designed. The final acceptance run used fixture mode and recorded no activation evidence.
- Task-level `git add` was denied while creating `.git/index.lock` (`Permission denied`). No retry was made.

## User Setup Required

None for fixture evaluation. A real-vendor evaluation requires the configured Jev credentials and a reachable Supabase admin database.

## Next Phase Readiness

- Offline evaluation artifacts and tests are ready for the activation gate.
- Review the recommended confidence thresholds and manually update `config.ts` only if approved.
- Real-vendor evidence persistence still needs verification against the configured Supabase admin database before it can support activation.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*
