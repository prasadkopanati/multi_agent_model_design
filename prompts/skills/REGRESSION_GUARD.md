---
name: regression-guard
description: Write a failing regression test before fixing any discovered bug, then verify the test passes after the fix. Extends TDD discipline from planned features to discovered bugs. Applies in the test stage.
---

# Regression Guard

## Overview

A bug found once and fixed without a test is a bug you will fix again. The regression test is not overhead — it is the long-term value extracted from the work of finding and fixing the bug. In an automated pipeline that runs repeatedly on the same codebase, a growing regression suite is the cumulative safety net that makes each subsequent run faster and more reliable.

**The rule:** For every fix applied during the test stage, write the test that would have caught the bug *before* applying the fix.

---

## The Regression Protocol

For every fix applied to make a failing test pass, or to resolve a bug discovered during testing:

### Step 1 — Write the regression test first

Before touching the buggy code:

1. Write a new test that targets the specific broken behavior
2. Confirm the test fails (i.e., it correctly identifies the bug)
3. Commit the failing test:

```
test(regression): <description of the broken behavior>
```

The test name should describe the behavior, not the fix. Example: `test(regression): count_words returns 0 for empty string` not `test(regression): fix None bug`.

### Step 2 — Apply the fix

Implement the fix in the production code.

### Step 3 — Verify

Run the full test suite. Confirm:
- The new regression test now passes
- The original failing test (if separate) now passes
- No other tests broke

### Step 4 — Commit the fix

```
fix(<scope>): <description> — regression test: <test name>
```

Referencing the regression test commit in the fix commit message creates a traceable pair: the test and the fix are linked.

---

## Browser Gate for Web Deliverables

For any project that includes HTML, CSS, or JavaScript output, before declaring the test stage complete:

1. Open a browser using Playwright (see `BROWSER_TESTING.md` for setup)
2. Navigate to the primary user flow described in the spec
3. Verify the primary interaction works end-to-end
4. Confirm zero console errors on the path

Report the outcome explicitly:

```
BROWSER GATE: PASS — navigated to [URL], [primary action] worked, 0 console errors
```

or

```
BROWSER GATE: FAIL — [what failed and why]
```

A FAIL on the browser gate means the test stage is not complete, even if all unit and integration tests pass. The spec's primary user flow must work in a real browser.

---

## What Counts as a Discovered Bug

A discovered bug is any behavior that:
- Causes an existing test to fail
- Is identified during manual or browser testing
- Is found via inspection of the code (e.g., an unhandled edge case noticed while reading)
- Is reported in the failure analysis from a previous retry cycle

Planned features that never worked are not discovered bugs — they are implementation tasks covered by the build stage's TDD protocol. The regression guard applies specifically to behaviors that *should already work* but don't.

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Fix first, write test later | The test may be written to match the fix rather than to catch the original bug |
| Write the test after seeing the fix pass | The test was never red — it may not actually test the broken behavior |
| Skip the browser gate for "small" web features | The most common failures are in UI paths that unit tests don't cover |
| Write a test for the fix instead of the bug | Tests should describe behaviors, not implementations |

---

## Verification

- [ ] Every bug fix in the test stage has a preceding `test(regression):` commit
- [ ] The regression test was confirmed failing before the fix was applied
- [ ] The regression test passes after the fix
- [ ] Full test suite passes with no new failures
- [ ] For web projects: browser gate was run and explicitly reported as PASS or FAIL
- [ ] All regression commits use the `test(regression):` prefix for traceability
