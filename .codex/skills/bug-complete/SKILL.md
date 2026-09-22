---
name: bug-complete
description: "Use once a bug fixed by /bug-execute has been verified, to close out its documentation: move the fixed portion out of the phase's bugs/ folder into .planning/fixed/, update indexes, and commit the doc change."
---

# bug-complete

This skill is a pointer. The canonical instructions live in `.planning/skills/bug-complete.md`,
shared across Claude, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/bug-complete.md` in full — that is the real skill body.
2. Follow its procedure exactly: confirm the fix was actually verified, decide whether
   it's fully or partially fixed, write the `.planning/fixed/{phase}-{NN} 간단한 정리.md`
   summary, delete or rewrite the original `BUG-NN-*.md`, update every affected
   `bugs/README.md` and any other doc that referenced this bug, commit the doc change
   separately from the code commit, then report back what moved to `fixed/`.
3. Do not touch application code in this skill — documentation only.
