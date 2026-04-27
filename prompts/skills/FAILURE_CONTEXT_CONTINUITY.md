---
name: failure-context-continuity
description: Package failure context before handing off to a retry. Prevents the executor from retrying blind — collects the exact error, the last attempted fix, the files touched, and the confidence-scored root cause into a structured handoff block. Run this during failure analysis, before the next build or fix attempt begins.
---

# Failure Context Continuity

## Overview

A retry without context is a guess. When an executor fails and the pipeline hands back to the controller for failure analysis, the output of that analysis must be a structured block that the next build prompt can consume directly. This skill governs how that block is produced.

**The rule:** Never return a failure analysis without all four required fields populated. A partial failure context is worse than none — it creates false confidence.

---

## The Four Required Fields

Every failure handoff block must contain:

```
FAILURE CONTEXT BLOCK

root_cause:       [One sentence — the specific thing that broke, not "it failed"]
last_fix_attempt: [What the executor tried in the previous build, if any — "none" is valid]
affected_files:   [Comma-separated list of files the executor touched or should have touched]
confidence:       [0.0–1.0 — how certain the analysis is; below 0.7 triggers human escalation]
```

### Field rules

**`root_cause`**
- Must name the mechanism, not the symptom. "Missing null check in `auth.js:42`" not "authentication failed".
- If the root cause is unknown, say "UNKNOWN — insufficient signal from stack trace" and set `confidence: 0.4`.

**`last_fix_attempt`**
- Describe what the executor tried: "Added try/catch around database call in `db.js:88`".
- If this is the first attempt, write "none — first attempt".
- If the last attempt made things worse, prefix with "REGRESSED: ".

**`affected_files`**
- List every file the executor modified or that the error trace points to.
- If no files are determinable, write "unknown" — do not omit the field.

**`confidence`**
- Estimate based on signal quality: clear stack trace + reproducible = 0.85+; ambiguous runtime error = 0.5–0.7; no stack trace = 0.3–0.5.
- Score below 0.7 **must** trigger human escalation before the next retry.

---

## Analysis Protocol

When a stage fails, run this protocol before producing the failure context block:

### Step 1 — Collect raw signal

Read the failure output in this order of priority:
1. Exact error message and stack trace (highest signal)
2. Diff of files changed in the failed build (what changed vs. what broke)
3. The build prompt that produced the failure (what was the executor asked to do)
4. Any prior failure context blocks (what has been tried before)

### Step 2 — Localize the failure

```
FAILURE LOCALIZATION

Error type: [syntax | runtime | test | integration | environment]
Error location: [file:line if available, otherwise "unknown"]
First occurrence: [is this new or has this error appeared before?]
Change correlation: [which recent change correlates with this failure?]
```

### Step 3 — Produce the failure context block

```
FAILURE CONTEXT BLOCK

root_cause:       [precise mechanism]
last_fix_attempt: [what was tried]
affected_files:   [file1.js, file2.js]
confidence:       [0.0–1.0]
```

### Step 4 — Determine next action

```
NEXT ACTION

If confidence >= 0.7:  → Retry with failure context block injected into build prompt
If confidence < 0.7:   → ESCALATE TO HUMAN — attach failure context block to escalation message
If same root_cause seen twice: → ESCALATE — executor is stuck in a loop
```

---

## Injection Format

The failure context block is injected into the next build prompt verbatim, inside a clearly delimited section:

```
## FAILURE CONTEXT FROM PREVIOUS ATTEMPT

root_cause:       Missing null check — `user.profile` can be undefined when OAuth callback skips profile fetch
last_fix_attempt: Added `user?.profile?.name` optional chaining in `auth.js:42`
affected_files:   src/auth.js, src/middleware/session.js
confidence:       0.82

Your fix must address the root cause above. Do not re-attempt the last fix if it was marked REGRESSED.
```

---

## Anti-Patterns to Avoid

**DO NOT:**
- Write "the build failed" as a root cause — that is the symptom
- Skip the confidence score because it is "hard to estimate"
- Omit `last_fix_attempt` — the executor will re-attempt the same broken approach
- Round confidence up — underconfident analysis that triggers human review is better than false-confident retries that waste cycles

**DO:**
- Quote the exact error message in the root cause when the message is specific enough
- Flag REGRESSED attempts explicitly — the executor must know a direction has been ruled out
- Include line numbers when they are available from the stack trace

---

## Verification

- [ ] `root_cause` names a mechanism, not a symptom
- [ ] `last_fix_attempt` is populated ("none" is acceptable for first attempts)
- [ ] `affected_files` lists at least one file or explicitly states "unknown"
- [ ] `confidence` is a number between 0.0 and 1.0
- [ ] If `confidence < 0.7`, the escalation path is noted
- [ ] If the same root cause has appeared twice, escalation is mandatory
