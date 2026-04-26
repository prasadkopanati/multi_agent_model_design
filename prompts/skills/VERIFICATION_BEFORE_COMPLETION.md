---
name: verification-before-completion
description: Confirm work is actually done before declaring a stage complete. Use at the end of the test stage — run the test suite, observe actual output, verify the pass count, and emit a confirmed result. Prevents silent false completion where an agent declares done without evidence.
---

# Verification Before Completion

## Overview

A stage is not complete because the work looks done. A stage is complete because the evidence confirms it is done. This skill enforces the distinction between a self-assessment ("I believe the tests pass") and a confirmed result ("I ran the tests and observed 24 pass, 0 fail").

**The failure mode this prevents:** An agent reaches a token budget limit, timeout, or ambiguous terminal state and reports completion based on its last successful step rather than a confirmed final result. The pipeline advances with a false positive.

**The rule:** Emit a confirmed result only after observing actual test output. Never assert completion without evidence.

## When to Use

- At the end of the test stage, before declaring the stage complete
- After any task that must produce a confirmed working outcome
- When a test run may have been partial or interrupted

**When NOT to use:** During intermediate build steps where tests are run as part of a development loop. This skill governs the terminal verification gate, not every test invocation.

## The Verification Gate

### Step 1: Run the Test Suite

Execute the project's test command and capture its output. Do not use a previously cached result.

```bash
# Identify the test command from package.json, Makefile, or project conventions
npm test           # Node.js projects
pytest             # Python projects
go test ./...      # Go projects
cargo test         # Rust projects
```

If the test command is not obvious, check `package.json` scripts, the project README, or existing CI configuration.

### Step 2: Parse the Output

From the actual test output, extract:

```
TEST RESULT:
  Total:   [N]
  Passed:  [N]
  Failed:  [N]
  Skipped: [N]
  Duration: [time]
  Exit code: [0 = pass | non-zero = fail]
```

Do not infer these numbers. Read them from the actual output.

### Step 3: Apply the Verification Gates

All of the following must be true before the stage can be declared complete:

```
GATE 1: Pass count > 0
  Why: Zero tests passing is not "all tests pass" — it means no tests ran.

GATE 2: Fail count = 0
  Why: Any failing test is a defect. The stage is not complete.

GATE 3: Skipped tests explained
  Why: Unexplained skips may be hiding failures. Each skipped test must be
  accounted for (platform-specific, marked as known flaky, etc.).

GATE 4: Build succeeds
  Why: Tests can pass while the build is broken (e.g., TypeScript errors not
  caught by the test runner). Run the build separately if tests do not cover it.
  npm run build | tsc --noEmit | cargo build | go build ./...

GATE 5: Exit code is 0
  Why: Some test runners print "X passed" but exit non-zero due to other errors.
  The exit code is the authoritative signal.
```

### Step 4: Handle Gate Failures

If any gate fails:

```
GATE FAILURE: [gate name]
Observed: [what the output actually showed]
Expected: [what a passing gate requires]

This stage is NOT complete. Investigating now.
```

Do not mark the stage complete and do not advance the pipeline. Investigate and fix the failure, then re-run from Step 1.

### Step 5: Emit the Confirmed Result

Only after all gates pass:

```
VERIFICATION COMPLETE

Test suite: npm test
  Passed:  24
  Failed:  0
  Skipped: 1 (skip reason: requires live database; marked @integration in test file)
  Duration: 4.2s
  Exit code: 0

Build: npm run build → exit 0

All verification gates passed. Stage complete.
```

This output is the stage's confirmed completion artifact.

## Handling Partial Runs

If the test suite was interrupted before completion (timeout, OOM, process killed):

1. The partial result is not a valid confirmation — do not use it
2. Investigate why the run was interrupted
3. If a timeout issue: try running a subset (`--testPathPattern`, `--run`, `-k`)
4. If a resource issue: check for runaway processes, memory leaks, or large test fixtures
5. Report the interruption explicitly rather than inferring completion

```
PARTIAL RUN DETECTED
  Tests completed before interruption: 18 of ~24
  Interruption reason: process killed (SIGKILL) after 30s timeout
  Stage: NOT complete
  Action: investigating timeout cause
```

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| "All tests should pass after these changes" | Should-pass is not did-pass. Run the suite. |
| Using the pass count from a prior run | Stale data; changes made since then may have broken tests |
| Ignoring non-zero exit codes because test output looked good | The exit code is authoritative |
| Treating skipped tests as passing tests | Skips may hide failures; each must be explained |
| Declaring complete before the build check | Tests can pass while TypeScript or compile errors remain |
| Marking stage done after a partial interrupted run | Partial confirmation is no confirmation |

## Verification

This skill's own verification gate:

- [ ] Test command was explicitly run (not inferred from prior output)
- [ ] Pass, fail, and skip counts are from actual observed output
- [ ] Exit code is 0
- [ ] All skipped tests have documented reasons
- [ ] Build check passed independently of test runner
- [ ] Confirmed result is emitted with observed evidence, not assertions
