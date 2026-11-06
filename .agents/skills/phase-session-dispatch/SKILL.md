---
name: phase-session-dispatch
description: "Use when /gsd:manager (or the user) is about to dispatch discuss/plan/execute for a phase, or asks to run approved phases in their own sessions. Creates one dedicated session per user-approved phase only, keeps the orchestrator session for progress tracking, and reflects verified results into STATE/ROADMAP. Trigger on: gsd manager dispatch, 'phase 12, 13 세션으로', 'phase 세션 만들어', 하위 세션 보고 반영."
---

# phase-session-dispatch

This skill is a pointer. The canonical instructions live in `.planning/skills/phase-session-dispatch.md`,
shared across Codex, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/phase-session-dispatch.md` in full — that is the real skill body.
2. Follow its procedure: create sessions only for phases the user explicitly approved (one session
   per phase), brief each with the template, and keep STATE/ROADMAP/SSOT/graph edits in the
   orchestrator session. Reflect a phase session's report only after the user has verified it there.
3. Answer the user in Korean.
