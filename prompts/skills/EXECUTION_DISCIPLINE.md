---
name: execution-discipline
description: Constrain what the executor touches during a build. Prevents scope creep, unrelated refactors, and accidental deletions that corrupt diffs and make review impossible. Apply during every build and fix stage — before writing a single line of code.
---

# Execution Discipline

## Overview

An executor that touches files outside its assignment, refactors code it wasn't asked to refactor, or deletes things it doesn't understand is worse than an executor that does nothing. Uncontrolled changes make review impossible and failures undiagnosable.

**The rule:** Before touching a file, ask "was I explicitly asked to change this?" If no — do not touch it.

---

## Pre-Build Scope Declaration

Before writing any code, output this block:

```
EXECUTION SCOPE

Task:            [one sentence — what this build is implementing]
Files to CREATE: [list, or "none"]
Files to MODIFY: [list, or "none"]
Files to DELETE: [list, or "none"]
Files OFF-LIMITS: [everything not listed above — do not touch]
Max diff lines:  ~300
```

If the plan lists specific files, copy them. If the plan is vague, pick the minimal set needed and list them explicitly. Once declared, **do not deviate from the scope list without restarting this declaration**.

---

## The Five Execution Rules

### Rule 1: Minimal Surface Area

Touch only what the task requires. Resist every impulse to:
- Rename variables that are "confusing but not wrong"
- Reorganize imports in files you are passing through
- Remove commented code you don't recognize
- Improve error messages in unrelated paths
- Add console.log debugging you intend to remove "later"

Each of these increases diff size, reduces reviewability, and creates new failure modes.

### Rule 2: Surgical Changes Only

A change is surgical when it is:
- The smallest possible change that implements the requirement
- Localized to the declared scope
- Reversible without affecting other functionality

A change is NOT surgical when it:
- Touches more than one concern in a single commit
- Modifies formatting across a whole file while also changing behavior
- Collapses multiple requirements into one undifferentiated diff

### Rule 3: Atomic Commits Per Concern

One logical change = one commit. Do not batch:
```
BAD:  git commit -m "feat: add login + fix navbar + update deps"
GOOD: git commit -m "feat(auth): add login endpoint validation"
      git commit -m "fix(nav): correct active state on route change"
```

Commit message format: `<type>(<scope>): <what>` where type is `feat`, `fix`, `test`, `refactor`, `chore`.

### Rule 4: No Speculative Changes

Do not add code "for future use", "in case we need it", or "to make this easier to extend". Speculative code:
- Creates dead code that confuses reviewers
- Adds untested paths to production
- Violates the requirement that every line must trace to a requirement

If you see a future need, note it in a comment **at most**. Do not implement it.

### Rule 5: Hard Stop at 300 Lines

If your implementation requires more than ~300 lines of diff:
1. Stop.
2. Output: `SCOPE OVERLOAD — diff exceeds 300 lines. Splitting required.`
3. Split the work into the smallest slice that can be delivered and tested independently.
4. Implement the first slice only.
5. Signal to the orchestrator that a second pass is needed.

A 400-line diff reviewed under time pressure is a bug waiting to ship.

---

## During Execution Checklist

Run this after each commit, before the next:

```
EXECUTION CHECK

  Files changed this commit: [list]
  All in declared scope?     [yes/no — if no, STOP and explain]
  Diff lines this commit:    [count]
  Running total diff lines:  [count]
  Single concern?            [yes/no — if no, split the commit]
  Tests updated/added?       [yes/no — if behavior changed and no: STOP]
```

---

## Forbidden Patterns

These patterns are execution failures regardless of whether they "work":

| Pattern | Why it's forbidden |
|---|---|
| `git add -A` or `git add .` | Stages files outside declared scope |
| Modifying `.env` or secret files | Never belongs in a feature diff |
| Reformatting entire files | Masks behavior changes in review |
| Deleting files not in scope | Unrecoverable without git; destroys reviewer trust |
| Adding `// TODO: implement later` stubs | Either implement it or don't — stubs ship as dead code |
| Squashing test commits into feat commits | Destroys TDD audit trail |

---

## Recovery Protocol

If you realize mid-build that you have gone out of scope:

1. **Stop coding immediately.**
2. Run `git diff --stat` to see what you've touched.
3. For each out-of-scope file: `git checkout -- <file>` to restore it.
4. Re-declare your scope.
5. Continue from the clean state.

Do not "finish first and clean up later" — cleanup under pressure always misses something.

---

## Verification

- [ ] Scope declaration was produced before any code was written
- [ ] Every modified file was in the declared scope list
- [ ] Total diff lines across all commits is ≤ 300
- [ ] Every commit has a single concern
- [ ] No speculative code was added
- [ ] `git add -A` was not used
