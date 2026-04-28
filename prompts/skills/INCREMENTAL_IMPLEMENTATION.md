---
name: incremental-implementation
description: Delivers changes incrementally. Use when implementing any feature or change that touches more than one file. Use when you're about to write a large amount of code at once, or when a task feels too big to land in one step.
---

# Incremental Implementation

Build in thin vertical slices. Each increment leaves the system in a working, testable state.

## Increment Cycle (repeat for each slice)

1. **Implement** — the smallest complete piece of functionality
2. **Test** — run the test suite; write a test first if none exists
3. **Verify** — tests pass, build succeeds
4. **Commit** — descriptive message (see `git-workflow-and-versioning`)
5. **Next slice** — carry forward, don't restart

## Rules

**Rule 0: Simplicity first.** Ask "what is the simplest thing that could work?" before writing code. Three similar lines is better than a premature abstraction. Build the naive, obviously-correct version first.

**Rule 0.5: Scope discipline.** Touch only what the task requires. Do NOT: rename variables that are "confusing but not wrong", reorganize imports in passing, remove comments you don't understand, add features not in the spec. Note out-of-scope observations — don't fix them.

**Rule 1: One thing at a time.** Each increment changes one logical thing. No mixing features, fixes, and refactors.

**Rule 2: Keep it compilable.** After each increment, the build succeeds and existing tests pass. Never leave the codebase broken between slices.

**Rule 3: Feature flags for incomplete work.** If a feature isn't user-ready, gate it with an env flag rather than keeping it on a long-lived branch.

**Rule 4: Safe defaults.** New code defaults to conservative, opt-in behavior.

**Rule 5: Hard stop at 300 lines.** If the diff exceeds ~300 lines: stop, output `SCOPE OVERLOAD — diff exceeds 300 lines. Splitting required.`, implement only the first slice, signal that a second pass is needed.

## Red Flags

- More than ~100 lines written without running tests
- Multiple unrelated changes in one increment
- "Let me just quickly add this too" — scope creep
- Skipping the test/verify step to move faster
- Build or tests broken between increments
- Building abstractions before a third use case demands it
- Touching files outside the task scope

## Verification

- [ ] Each increment individually tested and committed
- [ ] Full test suite passes
- [ ] Build clean
- [ ] Feature works end-to-end as specified
- [ ] No uncommitted changes remain
