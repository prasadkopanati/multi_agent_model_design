---
name: requesting-code-review
description: Produce a structured handoff document at the end of the build stage. Use as the final step before declaring build complete — summarize changed files, tests run, edge cases handled, and areas of concern so the reviewer has a navigational map rather than raw diffs.
---

# Requesting Code Review

## Overview

The reviewer's job is to evaluate code quality, not to reconstruct the builder's intent from diffs. A structured review request gives the reviewer a navigational map: what changed, what was tested, what was uncertain. This concentrates reviewer attention on the areas that actually matter.

**The rule:** Never hand off a build without a review request. A build output without context is noise; a build output with a structured handoff is actionable.

## When to Use

- As the final step of every build stage, before declaring the stage complete
- When the build touched more than one file
- When any deviations from the plan were made
- When the builder has areas of uncertainty that the reviewer should scrutinize

**When NOT to use:** Single-file typo fixes or trivial non-functional changes that touch no logic.

## The Review Request Format

At the end of the build stage, produce this structured document as the final output:

```
REVIEW REQUEST

## What Changed

| File | Change Type | Summary |
|---|---|---|
| src/auth/login.js | Modified | Added JWT validation middleware |
| src/routes/users.js | Modified | Wired middleware to protected routes |
| tests/auth.test.js | Created | 8 tests covering login, token expiry, invalid tokens |
| .env.example | Modified | Added JWT_SECRET placeholder |

## Tests Run

Command: npm test
Results: 24 passed, 0 failed, 0 skipped
Build: Clean (no compilation errors)
Lint: Passed

## Spec Requirements Covered

- [x] REQ-001: Users can log in with email and password
- [x] REQ-002: Sessions expire after 24 hours
- [x] REQ-003: Protected routes return 401 for unauthenticated requests
- [ ] REQ-004: Password reset flow (deferred — not in current task scope)

## Edge Cases Handled

- Token with expired `exp` claim → returns 401 with "session expired" message
- Token with invalid signature → returns 401 with "invalid token" message
- Missing Authorization header → returns 401 with "authentication required" message
- Malformed Bearer format → returns 401, does not crash

## Areas of Concern

1. **JWT_SECRET configuration** — currently reads from process.env with no fallback; will crash if unset. Reviewer should confirm this is the right fail-fast behavior.
2. **Token storage** — implementation stores tokens in memory only; not persisted across restarts. Acceptable for current scope but reviewer should confirm.
3. **Clock skew** — no tolerance window for `exp` validation; a 1-second difference causes 401. May need a small grace period.

## Deviations from Plan

- Task 3 specified `bcrypt` for password hashing. Used `bcryptjs` instead (pure JS, no native binding — avoids build toolchain dependency). Functionally equivalent.
```

## Completing the Handoff

After producing the review request:

1. Commit all staged changes if not already committed (follow `git-workflow-and-versioning`)
2. Append the review request to the build stage output
3. Declare the build stage complete

The orchestrator passes the build output (including this review request) to the review stage via `{{BUILD}}`.

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| "Tests pass, build is clean" | Not a review request — tells the reviewer nothing about what to look for |
| Listing every file modified without summaries | Volume without signal; the reviewer gets nothing from a flat diff manifest |
| Omitting areas of concern to appear more confident | Hides exactly the things the reviewer most needs to scrutinize |
| Marking a spec requirement as covered when it was only partially implemented | Creates false confidence; the reviewer will miss the gap |
| Writing the review request before running the tests | The test results field will be wrong |

## Verification

Before declaring build complete:

- [ ] All changed files are listed with one-line summaries of what changed
- [ ] Tests were actually run and the results are from this run, not assumed
- [ ] Every spec requirement is accounted for (covered, deferred, or N/A)
- [ ] At least one edge case is documented per non-trivial behavior
- [ ] Areas of uncertainty or concern are explicitly called out
- [ ] Any deviations from the plan are documented with reasons
