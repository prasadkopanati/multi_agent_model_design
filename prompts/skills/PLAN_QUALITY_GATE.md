---
name: plan-quality-gate
description: Self-check plan.md before handing it to the executor. Catches requirement gaps, silent scope drops, vague tasks, missing test tasks, and scope overload before they become build failures. Run this check after writing the plan and before returning it to the orchestrator.
---

# Plan Quality Gate

## Overview

A bad plan reaches the executor as a build failure. Every silent requirement drop, vague task, or missing test step becomes a retry cycle. This skill runs a structured self-check after the plan is written to catch these issues before they leave the planning stage.

**The rule:** Do not return plan.md until all five gates pass. Document any splits or corrections made.

## The Five Gates

### Gate 1: Requirement Coverage

Extract every stated requirement from the spec. For each one, name the task(s) that address it.

```
REQUIREMENT COVERAGE CHECK

Spec requirements:
  R-01: [requirement text]  → Task 2 (auth endpoint)   ✓
  R-02: [requirement text]  → Task 4 (session store)   ✓
  R-03: [requirement text]  → NONE                     ✗ BLOCKER

Uncovered requirements: R-03
Action: Add a task for R-03 before returning the plan.
```

Any requirement with no covering task is a **BLOCKER**. Add the task or explicitly mark the requirement as out-of-scope with a written reason.

---

### Gate 2: Scope Reduction Scan

Scan every task description for language that silently reduces a spec requirement:

```
SCOPE REDUCTION SIGNALS — flag any of these in task descriptions:
  "v1", "simplified version", "static for now", "hardcoded"
  "placeholder", "future enhancement", "will be wired later"
  "not connected to", "stub", "basic version", "minimal"
  "too complex for now", "out of scope for this task"
```

When any of these appear against a live spec requirement, it is a **BLOCKER**. The task must either deliver the requirement fully or the plan must explicitly split the work into a current task and a named future task, with the future task also present in the plan.

---

### Gate 3: Task Completeness

Every implementation task must answer four questions:

```
TASK COMPLETENESS CHECK (for each task):
  ✓ Files: which specific files will be created or modified?
  ✓ Action: what specifically will be done? (not "implement auth" — be precise)
  ✓ Verify: what command or check confirms it is done?
  ✓ Done: what is the observable acceptance criterion?
```

A task that says "implement the auth module" with no files, no action detail, and no verify step is not a task — it is a wish. Rewrite it before returning the plan.

---

### Gate 4: Test Task Ordering (TDD Gate)

For every task that creates or modifies logic, behavior, or data flow, there must be a corresponding test task that **precedes** it in the plan. The test task must use the `test:` commit prefix.

```
CORRECT ORDERING:
  Task 3: Write failing tests for login endpoint  (test: commit)
  Task 4: Implement login endpoint                (feat: commit)

INCORRECT ORDERING (no gate):
  Task 3: Implement login endpoint                (no test task before it)
```

**Exception:** Pure visual/CSS/layout tasks and static content tasks do not require a preceding test task. Mark these explicitly as `[visual]` in the task name. If a task is not marked `[visual]`, a test task is required before it.

**No test infrastructure?** The first task in the plan must set up the test runner (jest, pytest, vitest, etc.) before any implementation task.

---

### Gate 5: Scope Sanity

```
SCOPE SANITY CHECK:
  Tasks in this plan: [N]
  Threshold: ≤ 4 tasks for reliable execution; 5+ degrades quality at the end

  If N > 4:
    → Identify which tasks are independent
    → Split into two separate plan files: plan-part-A.md, plan-part-B.md
    → Document the split reason
```

Context fills as tasks execute. The last task in a 7-task plan runs under the most pressure. Split the plan rather than accept degraded quality on the final tasks.

---

## Completing the Gate Check

After running all five gates, produce a one-paragraph summary before the plan output:

```
PLAN QUALITY GATE RESULT

Gate 1 (Requirement Coverage): PASS — all N requirements covered.
Gate 2 (Scope Reduction):       PASS — no reduction language found.
Gate 3 (Task Completeness):     PASS — all tasks have files/action/verify/done.
Gate 4 (TDD Ordering):          PASS — test tasks precede all logic tasks.
Gate 5 (Scope Sanity):          PASS — N tasks, within threshold.

Corrections made: [none | list any tasks added, rewritten, or split]
```

If any gate is FAIL, fix the issue and re-check that gate before returning the plan.

## Verification

- [ ] Every spec requirement maps to at least one task
- [ ] No scope reduction language appears against live requirements
- [ ] Every non-visual task has files, action, verify, and done
- [ ] Every logic/behavior task has a test task before it in the sequence
- [ ] Total tasks ≤ 4, or the plan has been split
- [ ] Gate result paragraph is included at the top of the plan
