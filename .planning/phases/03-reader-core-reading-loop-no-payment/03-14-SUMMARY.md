---
phase: 03-reader-core-reading-loop-no-payment
plan: "14"
subsystem: reader
tags: [viewer, preferences, cookie, popover, css-module]
requires: ["03-08"]
provides: ["ViewerPreferences DTO + ns_viewer cookie codec", "ViewerSettingsPopover/Panel", "viewer.module.css scoped theme/font vars"]
affects: ["03-16 (viewer page/shell consumes preferences and popover)"]
tech-stack:
  added: []
  patterns: ["whitelist cookie codec", "CSS module data-attribute scoping"]
key-files:
  created: [lib/reader/viewer-preferences.ts, tests/reader/viewer-preferences.test.ts, components/reader/viewer.module.css, tests/reader/viewer-settings.test.ts]
  modified: [components/reader/viewer-settings-sheet.tsx]
requirements-completed: [READ-03, READ-05]
completed: 2026-10-17
---

# Phase 3 Plan 14: Viewer settings Summary

5-key viewer preferences (font, mode, size, padding, line height) with a whitelisted one-year `ns_viewer` cookie codec, a base-ui Popover settings panel, and viewer-scoped CSS.

## Commits
- 66a4b75: codec + tests (task 1)
- 2fb2d03: popover + scoped CSS + tests (task 2)

## What was built
- `parseViewerPreferences` never throws: malformed URI/JSON, unknown keys, out-of-range values fall back to defaults per key; `sepia` maps to `light`. `serializeViewerPreferences` emits max-age=31536000; SameSite=Lax; Path=/ (+Secure on https).
- `ViewerSettingsPopover` (trigger prop via render) wraps `ViewerSettingsPanel` (5 controls, steppers disabled at range ends, ReportDialog reused). Changes persist via `persistViewerPreferences` (document.cookie) and call `onPreferencesChange`.
- Legacy `ViewerSettingsSheet` kept as adapter with a file-local `light|sepia|dark` type (no dependency on viewer-shell's ViewerTheme); 03-16 switches consumers.
- `viewer.module.css`: `--viewer-size/lh/pad`, `data-viewer-theme` (light/dark/system via prefers-color-scheme), `data-viewer-font` (gothic / OS serif stack, no font download); no body/html/:root rules.

## Verification
`npx vitest run tests/reader/viewer-preferences.test.ts tests/reader/viewer-settings.test.ts`: 14/14 pass. `tsc --noEmit` shows no viewer-related errors.

## Deviations
None of substance. Added exported `ViewerSettingsPanel` and `persistViewerPreferences` so SSR tests can reach the panel contents (popover content is portaled and not rendered when closed).

## Gaps (gate 03-19)
Real popover open/close/ESC/focus-return, cookie persistence across reload, and CSS module application in a browser are not verified (no browser). The CSS module is not yet applied to a viewer root; 03-16 must wire `styles.viewer` + `data-viewer-*` + inline `--viewer-*` vars. Per-plan instructions: STATE/ROADMAP not edited, graphify not run.

## Known Stubs
None.

## Self-Check: PASSED
