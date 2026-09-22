---
name: bug-execute
description: "Use to implement the fix direction already written in a bug doc created by /bug-plan (BUG-NN under a phase's bugs/ folder). Implements the code fix, adds/updates tests, verifies, and commits the code change."
---

# bug-execute

This skill is a pointer. The canonical instructions live in `.planning/skills/bug-execute.md`,
shared across Claude, Codex and other agents so everyone follows one copy.

## How to use this skill

1. Read `.planning/skills/bug-execute.md` in full — that is the real skill body.
2. Follow its procedure exactly: load the `BUG-NN` doc, stop and ask the user if the
   fix direction still has undecided policy options, implement only what the doc
   describes, add/update tests, verify (tests + typecheck, browser check for UI),
   update the doc with what was actually done, commit the code+tests as one commit,
   then report back and ask whether to continue to `/bug-complete`.
3. Do not reorganize or move bug docs in this skill — that is `/bug-complete`'s job.
