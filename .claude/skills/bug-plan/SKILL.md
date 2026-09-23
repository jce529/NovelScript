---
name: bug-plan
description: "Use when a bug is found in this project and needs to be documented, investigated, and given a fix direction before any code is touched. Creates or updates the bug's markdown doc in the origin phase's bugs/ folder."
---

# bug-plan

This skill is a pointer. The canonical instructions live in `.planning/skills/bug-plan.md`,
shared across Claude, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/bug-plan.md` in full — that is the real skill body.
2. Follow its procedure exactly: determine the origin phase, create/find that phase's
   `bugs/` folder, assign the next `BUG-NN` number scoped to that folder, investigate,
   write the doc, update that folder's `bugs/README.md`, then report back and ask
   whether to continue to `/bug-execute`.
3. Do not write or edit application code in this skill — planning and documentation only.
