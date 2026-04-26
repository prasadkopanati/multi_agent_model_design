---
name: receiving-code-review
description: Act on code review findings systematically after a FAIL verdict. Use when a review stage returns FAIL — triage findings by severity, address Critical issues first, verify each fix does not introduce regressions, and confirm all Critical and Important findings are resolved before resubmitting.
---

# Receiving Code Review

## Overview

A review FAIL verdict is an input, not an obstacle. The findings are a prioritized work list. Acting on them systematically — rather than addressing all findings at once or guessing at priorities — produces cleaner fixes and avoids the failure mode of fixing suggestions while leaving Critical issues unaddressed.

**The rule:** Critical findings block resubmission. Important findings must be addressed or explicitly deferred with justification. Suggestions are optional.

## When to Use

- After a review stage returns `Verdict: FAIL`
- When entering a fix cycle to address review findings
- When deciding how to prioritize a mixed set of review comments

**When NOT to use:** `Verdict: PASS` — no action needed. Proceed to the next pipeline stage.

## Severity Reference

| Severity | Meaning | Required action |
|---|---|---|
| **Critical** | Security vulnerability, data loss, broken functionality, spec violation | Must fix before resubmission |
| **Important** | Non-critical bug, significant design issue, missing test coverage | Fix or explicitly defer with justification |
| **Suggestion** | Style preference, optional improvement, minor readability | Address if low-cost; skip otherwise |

## The Response Protocol

### Step 1: Parse the Review Output

Extract all findings from the review output. Identify their severity labels. If a finding has no label, treat it as Important.

```
FINDINGS PARSED:

Critical (must fix):
  - [file:line] JWT_SECRET is logged in debug output (security)
  - [file:line] Missing null check on user.id causes crash on unauthenticated requests

Important (fix or defer):
  - [file:line] Token expiry error message leaks internal implementation detail
  - [file:line] No test for concurrent login from multiple devices

Suggestions (optional):
  - [file:line] Extract token validation into a separate utility function
  - [file:line] Variable name `t` should be `token`
```

### Step 2: Address Critical Findings First

Fix all Critical findings before touching anything else. Critical findings are blocking — no other work matters until they are resolved.

For each Critical finding:
1. Read the finding and understand the root cause
2. Implement the fix (minimal change to address the root cause)
3. Run the specific test(s) that cover this area to verify the fix
4. Run the full test suite to check for regressions
5. Commit the fix with a message referencing the finding

```
FIX LOG:

[Critical #1] JWT_SECRET logged in debug output
  Root cause: debug middleware logs all env vars
  Fix: exclude JWT_* keys from debug log output
  Verified: security test passes; no regressions in auth suite

[Critical #2] Null check missing on user.id
  Root cause: assumed user object always present after middleware
  Fix: added null guard before accessing user.id; returns 401 if missing
  Verified: unauthenticated request test passes
```

### Step 3: Address Important Findings

After all Critical findings are fixed, address Important findings. For each:

1. Evaluate whether the fix is straightforward or requires significant rethinking
2. If straightforward: implement, verify, commit
3. If complex or out of scope: write a deferral note with justification

```
[Important #1] Token expiry message leaks internals
  Fix: changed message from "JWT token expired at {timestamp}" to "Session expired"
  Verified: message format test updated and passes

[Important #2] No test for concurrent logins
  Deferral: Testing concurrent session behavior requires a more complex test setup
  than fits in this fix cycle. Filed as backlog item. Not blocking current functionality.
```

### Step 4: Decide on Suggestions

Suggestions are optional. Apply only if the change is low-cost and clearly improves the code. Skip if the change would be purely cosmetic or would require significant refactoring.

```
[Suggestion #1] Extract token validation into utility
  Decision: Skip. Premature extraction — only one call site. Will apply when a second call site exists.

[Suggestion #2] Rename `t` to `token`
  Decision: Apply. 30-second change, immediately clearer.
```

### Step 5: Verify All Critical and Important Items Resolved

Before resubmitting for review, confirm the entire remediation:

```
REMEDIATION SUMMARY

Critical findings: 2 of 2 resolved
Important findings: 1 of 2 resolved, 1 deferred with justification
Suggestions: 1 of 2 applied (1 skipped — out of scope)

Full test suite: 26 passed, 0 failed
Build: Clean
```

### Step 6: Resubmit

Once all Critical and Important findings are resolved (or deferred with justification), the fix cycle is complete. Return control to the orchestrator or trigger the next review pass.

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Fixing suggestions before Critical findings | Leaves blocking issues unresolved while spending time on cosmetics |
| Treating all findings as equal priority | Critical issues may be buried under Suggestions |
| Fixing Critical issues without running tests | The "fix" may introduce a regression worse than the original issue |
| Deferring Critical issues | Critical = must fix. Deferring a security vulnerability is not acceptable |
| "Addressed all findings" without verifying the test suite | Not verified = not done |
| Silently skipping Important findings | If deferring, document the justification explicitly |

## Verification

Before declaring the fix cycle complete:

- [ ] All Critical findings are fixed and individually verified
- [ ] All Important findings are either fixed or deferred with written justification
- [ ] Full test suite passes after all fixes are applied
- [ ] Build is clean
- [ ] Fix log documents every finding and its disposition
