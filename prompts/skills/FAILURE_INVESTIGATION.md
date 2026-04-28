---
name: failure-investigation
description: Investigate failures with Iron Law discipline — trace data flow from symptom to origin, form competing hypotheses, score them against evidence, then declare fix scope. No fixes without investigation.
---

# Failure Investigation

## Iron Law

**No fix without a trace from symptom to origin.**

An LLM pattern-matching on an error message can produce 0.9 confidence for the wrong root cause. The Iron Law converts "I think I know what's wrong" into "I have traced why this is wrong and confirmed one hypothesis against the others." Confidence is not a substitute for investigation.

---

## The Four-Step Investigation Protocol

### Step 1 — Trace (not guess)

Starting from the error message or test failure, trace data flow *backward*:

- Where did the failing value originate?
- Which function set it?
- Which call site invoked that function?
- Where was the data transformed or parsed before it reached that function?

The trace must end at a **root event** (a write, a parse, an assumption), not at the **error site** (a read, an assertion, a throw). An error at the assertion site is a symptom. The root event is the cause.

Document the trace:

```
FAILURE TRACE

Error site: [function/line where the failure surfaced]
  ← called by: [call site]
  ← [function that set the failing value]
  ← [where the data was written/parsed]
Root event: [the write, parse, or assumption where the wrong value was introduced]
```

### Step 2 — Form competing hypotheses

State at least two candidate root causes before proposing any fix. For each hypothesis:

```
HYPOTHESIS A: [statement of the cause]
  Evidence for:    [what in the trace or code supports this]
  Evidence against: [what contradicts this or makes it unlikely]
  Confirming check: [one specific test or inspection that would definitively confirm or rule this out]

HYPOTHESIS B: [statement of the cause]
  Evidence for:    [...]
  Evidence against: [...]
  Confirming check: [...]
```

Do not merge hypotheses into a single diagnosis at this stage. Competing hypotheses are the mechanism that surfaces the alternative explanation that pattern-matching misses.

### Step 3 — Score and commit

Evaluate each hypothesis against the evidence gathered in Steps 1 and 2. Pick the highest-scoring one.

```
HYPOTHESIS VERDICT

Winner: [A | B | C]
Reason: [why the evidence favors this hypothesis over the others]
Confidence: [0.0–1.0 — based on evidence, not intuition]
```

**Tiebreaker rule:** If two hypotheses are equally supported by the evidence, pick the one whose fix has the smaller blast radius — fewer files, fewer behavioral changes, less risk of introducing new failures.

**Escalation trigger:** If confidence is below 0.7, flag for human review rather than guessing.

### Step 4 — Declare fix scope

Before the retry, produce an explicit fix declaration:

```
FIX DECLARATION

Files to change:   [list of specific files]
Functions to change: [list of specific functions or methods]
Before state:      [what the code currently does / what value is currently produced]
After state:       [what the code will do / what value will be produced after the fix]
Confirming test:   [exact test command that will confirm the fix worked]
```

This declaration becomes the `fix_strategy` and `affected_files` in the failure JSON — derived from investigation, not from pattern-matching.

---

## Hard Stop Rule

If **3 consecutive failure cycles** for the same stage produce **different root causes** (i.e., each analysis contradicts the previous one), confidence across all analyses is effectively zero. Do not attempt a fourth fix. Escalate to human with:

```
ESCALATION REQUIRED

Three consecutive failure analyses for [stage] produced contradictory root causes:
  Cycle 1: [root_cause from attempt 1]
  Cycle 2: [root_cause from attempt 2]
  Cycle 3: [root_cause from attempt 3]

The failure is not converging. Human review is required.
```

This is a stronger escalation signal than retry count alone. Three contradictory diagnoses indicate the problem is not diagnosable by the current investigation approach.

---

## Scope Freeze

While investigating a failure, scope is frozen to the module or area identified by the trace. Do not introduce changes to files outside the trace chain. New changes outside scope during a debugging cycle introduce confounding variables that make subsequent failure traces harder.

---

## Output Format

The failure investigation must produce the standard failure JSON, but its fields must now be derived from the investigation steps above:

```json
{
  "root_cause": "<the winner from Step 3 — written as a factual statement, not a guess>",
  "fix_strategy": "<the FIX DECLARATION from Step 4 — concise but complete>",
  "affected_files": ["<files listed in FIX DECLARATION>"],
  "confidence": <score from Step 3>
}
```

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Diagnosing from the error message alone | Error messages identify symptoms, not causes — tracing backward is mandatory |
| Single hypothesis | Without a competing hypothesis, confirmation bias is unchecked |
| High confidence without a trace | Confidence is a score on evidence, not an intuition rating |
| Changing files outside the trace chain | Introduces confounding variables; future failures become harder to trace |
| Retrying after 3 contradictory diagnoses | Iteration without convergence is not debugging — it is thrashing |

---

## Verification

- [ ] Failure trace produced from error site to root event
- [ ] At least two competing hypotheses documented with evidence for and against
- [ ] Winning hypothesis selected with confidence score
- [ ] Fix declaration produced before any code changes
- [ ] Scope frozen to trace chain — no out-of-scope changes
- [ ] If three consecutive cycles produced contradictory diagnoses: escalated rather than retried
