---
name: pipeline-integrity-check
description: Verify the pipeline's own health before the finish stage closes out. Catches dangling artifacts, uncommitted changes, broken state files, and leftover failure records that would corrupt the next run. Run this at the start of the finish stage, before spec-traced delivery begins.
---

# Pipeline Integrity Check

## Overview

The finish stage runs after all build/test/review cycles complete. At this point, the workspace should be clean, all artifacts should be present, and the pipeline state should be consistent. If any of these conditions fail, a PR or merge would capture broken state.

**The rule:** Run the integrity check before any delivery action (PR, merge, branch keep). A failed integrity check is a hard stop.

---

## The Seven Checks

### Check 1: Working Tree Clean

```bash
git status --short
```

Expected: empty output (no modified, staged, or untracked files).

If output is non-empty:
- **Staged changes**: something was staged but not committed — commit or stash before proceeding.
- **Modified tracked files**: uncommitted work — determine if it belongs in this pipeline run and either commit or discard.
- **Untracked files**: likely build artifacts or temp files — add to `.gitignore` or clean up.

```
CHECK 1: Working Tree
  Status: [CLEAN | DIRTY]
  If dirty: [list of dirty files and disposition]
```

---

### Check 2: Required Artifacts Present

Verify that all expected stage outputs exist in `.spiq/artifacts/output/`:

```
CHECK 2: Artifacts

  .spiq/SPEC.md:                [present | MISSING]
  .spiq/tasks/plan.md:          [present | MISSING]
  .spiq/artifacts/output/spec-output.json:    [present | MISSING]
  .spiq/artifacts/output/plan-output.json:    [present | MISSING]
  .spiq/artifacts/output/build-output.json:   [present | MISSING]
  .spiq/artifacts/output/test-output.json:    [present | MISSING]
  .spiq/artifacts/output/review-output.json:  [present | MISSING]
```

Any MISSING artifact means a stage did not complete or its output was not persisted. This is a hard blocker — do not proceed until the missing artifact is explained.

---

### Check 3: Pipeline State Consistency

Read `.spiq/tasks.json` and verify:

```
CHECK 3: Pipeline State

  current_stage:   [should be "finish" or "complete"]
  human_required:  [should be false — if true, why are we in finish?]
  failure_state.count: [should be 0 or explained]
  failure_state.history: [if non-empty, list the stages that failed and recovered]
```

If `human_required: true`, the pipeline should not have reached finish automatically. Flag and stop.

---

### Check 4: No Active Failure Records

Check for unresolved failure records:

```bash
ls .spiq/artifacts/failures/
```

```
CHECK 4: Failure Records

  Open failure files: [list, or "none"]
  If any: [were these resolved and the recovery committed?]
```

Leftover failure files from the current run indicate that the failure analysis ran but the fix was not confirmed. Each failure file should be reviewed: if the issue was resolved, note it; if not, it is a blocker.

---

### Check 5: Branch State

```bash
git log --oneline origin/main..HEAD 2>/dev/null || git log --oneline HEAD~10..HEAD
```

```
CHECK 5: Branch

  Branch name:   [current branch]
  Commits ahead of base: [count]
  All commits have messages: [yes/no]
  Any merge commits (unexpected): [yes/no]
```

If there are no commits ahead of the base branch, the pipeline ran but nothing was committed — this is either a bug or a no-op and must be investigated before creating a PR.

---

### Check 6: Test Suite Still Passes

Re-run the test suite one final time before delivery:

```
CHECK 6: Final Test Run

  Command: [test command used]
  Result:  [N passed, N failed, N skipped]
  Status:  [PASS | FAIL]
```

If the test suite fails at this point, something changed between the test stage and now (a last-minute fix, a conflicting change, an environment issue). Do not ship a failing test suite.

---

### Check 7: Review Verdict

Confirm the review stage produced a PASS verdict:

```
CHECK 7: Review Verdict

  Review output: [PASS | FAIL | not found]
  If FAIL or not found: HARD STOP — do not proceed to delivery
```

Read `.spiq/artifacts/output/review-output.json` for the verdict. If it is missing or contains a FAIL, the pipeline routing has a bug and human review is required.

---

## Integrity Gate Summary

After all seven checks, produce:

```
PIPELINE INTEGRITY GATE

  Check 1 (Working Tree):       [PASS | FAIL]
  Check 2 (Artifacts Present):  [PASS | FAIL]
  Check 3 (State Consistency):  [PASS | FAIL]
  Check 4 (Failure Records):    [PASS | FAIL]
  Check 5 (Branch State):       [PASS | FAIL]
  Check 6 (Final Tests):        [PASS | FAIL]
  Check 7 (Review Verdict):     [PASS | FAIL]

  Overall: [ALL PASS → proceed | N FAIL → BLOCKED]
```

Any FAIL is a hard stop. Diagnose and resolve before delivery actions begin.

---

## Remediation by Check

| Check | Common failure | Remediation |
|-------|---------------|-------------|
| 1 | Staged/untracked files | Commit relevant changes; discard or ignore artifacts |
| 2 | Missing artifact | Identify which stage skipped output; re-run that stage |
| 3 | human_required still true | Investigate why pipeline reached finish in error state |
| 4 | Open failure files | Verify recovery was committed; remove stale files |
| 5 | No commits ahead | Investigate — was the build a no-op? Is base branch wrong? |
| 6 | Tests failing | Identify regression; run a fix loop before delivery |
| 7 | Review FAIL | Do not bypass; escalate to human for review decision |

---

## Verification

- [ ] All 7 checks were run
- [ ] Integrity gate summary was produced
- [ ] Any FAIL check was resolved before proceeding
- [ ] Spec-traced delivery begins only after ALL PASS
