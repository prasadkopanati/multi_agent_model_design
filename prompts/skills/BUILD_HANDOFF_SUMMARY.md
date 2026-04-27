---
name: build-handoff-summary
description: Produce a structured handoff block at the end of every build or test stage. Gives the reviewer (Claude) and finisher (Gemini) the exact information they need without forcing them to re-read the full diff. Run this as the final step of every build and test stage, before signaling completion.
---

# Build Handoff Summary

## Overview

A build that completes without a handoff summary forces the next agent to reconstruct context from scratch — re-reading diffs, re-tracing requirements, and making assumptions that may be wrong. The handoff summary prevents this by packaging the output of each stage into a consumable block.

**The rule:** The last action of every build and test stage is producing a handoff summary. No exceptions.

---

## The Handoff Block Format

```
BUILD HANDOFF SUMMARY

Stage:            [build | test | fix]
Status:           [COMPLETE | PARTIAL | FAILED]

Changes made:
  - [file path]: [one-line description of what changed and why]
  - [file path]: [one-line description of what changed and why]

Requirements addressed:
  - R-01: [requirement text] → [how it was addressed]
  - R-02: [requirement text] → [how it was addressed]

Requirements NOT addressed:
  - R-03: [requirement text] → [reason: deferred / blocked / out of scope]

Test results:
  - [test suite name]: [N passed / N failed / skipped]
  - Coverage delta: [+N% | unchanged | not measured]

Known issues or warnings:
  - [describe any non-fatal issues the reviewer should know about]
  - [or "none"]

Commit range: [first commit SHA..last commit SHA]
Next stage:   [review | finish | fix — and what it should focus on]
```

---

## Field-by-Field Rules

### `Status`

- **COMPLETE**: All assigned requirements are addressed and tests pass.
- **PARTIAL**: Some requirements addressed; unaddressed ones are documented under "Requirements NOT addressed".
- **FAILED**: Build or tests failed; attach or reference the failure context block.

A PARTIAL status is not a failure — it is honest communication. A false COMPLETE that hides unaddressed requirements is a failure.

### `Changes made`

- One line per file. Not per function, not per change — per file.
- The description must say **what changed AND why**. "Updated auth.js" is not sufficient. "Updated auth.js: added null guard for missing OAuth profile to fix undefined error on first login" is sufficient.
- Do not list test files separately from implementation files — list them interleaved in the order they were written.

### `Requirements addressed`

- Map back to the spec. Use the requirement identifiers from SPEC.md when they exist (R-01, R-02, etc.).
- If the spec has no explicit identifiers, summarize the requirement in 5–10 words.
- Every requirement in scope must appear here or under "NOT addressed".

### `Requirements NOT addressed`

- List every requirement that was assigned but not completed.
- State the reason clearly: "deferred — exceeded scope limit", "blocked — waiting for API credential", "out of scope — reassigned to part B".
- This field is NEVER empty if Status is PARTIAL.

### `Test results`

- Report actual pass/fail counts from the test runner output.
- If no tests were run: `no tests executed — [reason]`. This is a yellow flag for the reviewer.
- Coverage delta: report the change from baseline if coverage is tracked. If not tracked, write "not measured".

### `Known issues or warnings`

- Include any non-fatal lint warnings, deprecation notices, or "this works but is fragile" observations.
- Do not omit known issues to make the summary look cleaner. The reviewer will find them.

### `Commit range`

- Use `git log --oneline` to get the first and last commit SHA of this build's changes.
- Format: `abc1234..def5678`

### `Next stage`

- Name the next stage explicitly.
- If the next stage needs to focus on something specific, say so: "review — pay attention to the session token TTL logic in auth.js:88"

---

## Test Stage Handoff

When the stage is `test`, the handoff block has a required additional field:

```
TDD AUDIT

  test(...)  commits before feat(...) commits: [yes / no]
  Test-first discipline maintained:            [yes / no]
  If no: [describe which logic was implemented without a preceding test]
```

This field makes TDD compliance auditable across stages without requiring the reviewer to parse the git log manually.

---

## Partial Build Protocol

When a build produces PARTIAL status:

1. Complete the handoff summary with all unaddressed requirements listed.
2. Append: `CONTINUATION REQUIRED — the following requirements need a second build pass: [list]`
3. Signal to the orchestrator that another build iteration is needed.

Do not silently stop mid-implementation. A declared PARTIAL is better than an undeclared incomplete.

---

## Verification

- [ ] Handoff summary is the last output of the build stage
- [ ] Every assigned requirement appears under addressed or NOT addressed
- [ ] Changes made includes a why, not just a what
- [ ] Test results report actual counts, not "tests were run"
- [ ] Commit range is present and accurate
- [ ] If status is PARTIAL, "CONTINUATION REQUIRED" is appended
- [ ] TDD audit block is present for test stages
