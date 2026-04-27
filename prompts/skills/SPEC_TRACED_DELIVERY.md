---
name: spec-traced-delivery
description: Verify that every requirement in SPEC.md is traceable to a commit before closing the pipeline. Prevents shipping partial implementations that passed code review but silently dropped features. Run this as the first step of the finish stage, before creating a PR or merging.
---

# Spec-Traced Delivery

## Overview

A codebase that passes review is not the same as a codebase that satisfies the spec. Review catches bugs and code quality issues; it cannot detect requirements that were never implemented. Spec-traced delivery bridges this gap by walking every requirement in SPEC.md and confirming it has a traceable commit.

**The rule:** Do not create a PR, merge, or mark the pipeline complete until every requirement in SPEC.md maps to at least one commit. Silent drops are not acceptable.

---

## The Trace Protocol

### Step 1 — Extract requirements from SPEC.md

Read `.spiq/SPEC.md` and extract every discrete requirement. Number them if they don't have IDs:

```
SPEC REQUIREMENTS

R-01: [requirement text]
R-02: [requirement text]
R-03: [requirement text]
...
```

A requirement is any statement that says the system MUST, SHOULD, or WILL do something. "The login form must validate email format" is a requirement. "The UI should use the brand color palette" is a requirement.

### Step 2 — Scan the commit log

Run: `git log --oneline <base-branch>..HEAD`

List every commit that is part of this pipeline run. Group them by type:

```
COMMIT INVENTORY

feat commits:    [list]
test commits:    [list]
fix commits:     [list]
other commits:   [list]
```

### Step 3 — Produce the trace matrix

For each requirement, identify the commit(s) that implement it:

```
REQUIREMENT TRACE MATRIX

R-01: [requirement] → feat(auth): add login endpoint    ✓  COVERED
R-02: [requirement] → feat(auth): add session store     ✓  COVERED
R-03: [requirement] → NONE                              ✗  MISSING
R-04: [requirement] → partial — see known issues        ⚠  PARTIAL
```

### Step 4 — Decision gate

```
DELIVERY DECISION

All requirements COVERED:  → Proceed to PR / merge
Any requirement MISSING:   → BLOCK — do not ship
Any requirement PARTIAL:   → Document in PR body; proceed only if explicitly approved
```

---

## Handling Missing Requirements

When a requirement has no covering commit:

**Option A — Implement now (preferred if small)**
If the missing requirement is small (< 50 lines, clearly scoped), implement it before proceeding. Update the trace matrix and re-verify.

**Option B — Explicit deferral (if large or blocked)**
Write a deferral notice:
```
DEFERRED REQUIREMENT

R-03: [requirement text]
Reason: [blocked by X / out of scope for this sprint / requires external dependency]
Owner: [who will implement it]
Tracking: [issue/ticket reference or "none"]
```
Include this notice in the PR body. Do not silently drop the requirement.

**Option C — Scope correction**
If the requirement was never valid (changed since spec was written, superseded, duplicate):
```
SCOPE CORRECTION

R-03: [requirement text]
Status: SUPERSEDED — replaced by R-07 / INVALID — requirement changed after spec was frozen
Evidence: [reference to the change or decision]
```

---

## PR Body Template

When producing the PR, the body must include the trace matrix summary:

```markdown
## Requirements Coverage

| ID | Requirement | Status | Commit |
|----|-------------|--------|--------|
| R-01 | [text] | ✅ Covered | abc1234 |
| R-02 | [text] | ✅ Covered | def5678 |
| R-03 | [text] | ⚠️ Partial | See notes |

## Known Gaps
[list any partial or deferred requirements with explanation]

## Test Coverage
[summary of test results and coverage delta]
```

---

## TDD Audit in Delivery

Before creating the PR, verify the commit sequence follows TDD discipline:

```
TDD DELIVERY AUDIT

For each feature requirement:
  test(feat-name) commit exists before feat(feat-name) commit? [yes/no]

If no: Flag in PR body — "TDD not maintained for [requirement]"
```

This is an informational flag, not a blocker at delivery — the TDD enforcement point is at build time. But the PR body must be honest about it.

---

## Verification

- [ ] Every requirement in SPEC.md appears in the trace matrix
- [ ] Every MISSING requirement has an Option A, B, or C disposition
- [ ] PR body includes requirements coverage table
- [ ] PR body includes known gaps section (empty is acceptable)
- [ ] TDD audit has been run and any violations are noted in PR body
- [ ] Delivery decision gate was checked before proceeding to PR creation
