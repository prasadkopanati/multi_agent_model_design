---
name: spec-ceo-challenge
description: Apply five forcing questions to the feature request before writing the spec. Challenges problem framing, identifies deferrable scope, and surfaces the most dangerous assumption. Run before Step 1 of the spec stage.
---

# Spec CEO Challenge

## Overview

Product failures almost never come from bad implementation of the right idea. They come from high-quality implementation of the wrong idea. The cheapest time to challenge a problem framing is before the spec is written. Once the spec exists, the plan follows it, the build follows the plan, and the review follows the build. A misframed request at spec time costs one pipeline run to correct. A misframed request discovered at review costs a full `spec → plan → build → test → review` cycle.

**The rule:** Before writing the spec, apply five forcing questions to the feature request. Record the answers in `CHALLENGED PREMISES` in the Assumption Register. Downstream stages can reference this section to detect when implementation diverges from the challenge findings.

---

## The Five Forcing Questions

Run through each question autonomously, answering from the perspective of a technical founder reviewing a product brief. Record each answer explicitly.

---

### Question 1 — The Framing Test

> "The request says `[X]`. Is `[X]` the actual problem, or is it a symptom of a deeper problem? What is the user really trying to accomplish?"

Look past the stated solution to the underlying need. Sometimes the stated request is already the right level of abstraction. Sometimes it is a solution to an unstated problem, and a better solution exists.

**Output:**

```
FRAMING TEST

Stated request:     [what was asked for]
Underlying need:    [what the user is actually trying to accomplish]
Assessment:         [CORRECT FRAMING — stated request maps to underlying need |
                     REFRAMED — the real problem is X; the stated request is one approach]
Impact on spec:     [none | adjust scope as follows: ...]
```

---

### Question 2 — The Narrowest Wedge

> "What is the smallest implementation that would test whether this idea works? Which parts of the scope exist solely because they seem complete, not because they are necessary to validate the core hypothesis?"

Scope creep usually happens before the spec is written. Requirements are added because they "seem like they should be there," not because they are essential for the thing to work. The narrowest wedge identifies which requirements are load-bearing (failure to include them would invalidate the delivery) and which are cosmetic (they complete the picture but don't change whether the core idea works).

**Output:**

```
NARROWEST WEDGE

Core hypothesis:    [what must be true for this to be worth building]
Load-bearing scope: [requirements that directly test the hypothesis]
Cosmetic scope:     [requirements that complete the picture but don't test the hypothesis]
Wedge recommendation: [proceed with full scope | flag [X, Y] as deferrable]
```

---

### Question 3 — The Deferred Scope Scan

> "Which requirements can be built in a Phase 2 without invalidating the Phase 1 delivery? Flag each as CORE or DEFERRABLE."

Walk through every requirement in the feature request and assign a label:

- **CORE:** Must be in this delivery or the feature does not work / is not usable.
- **DEFERRABLE:** Could be built later without breaking Phase 1. Including it now adds complexity; excluding it now loses nothing essential.

**Output:**

```
SCOPE LABELS

  [requirement 1]: CORE — [reason]
  [requirement 2]: CORE — [reason]
  [requirement 3]: DEFERRABLE — [can be added in Phase 2 without breaking Phase 1]
  [requirement 4]: DEFERRABLE — [nice-to-have; does not affect core behavior]
```

Note: DEFERRABLE items are still included in the spec unless explicitly out of scope. They are flagged so the plan stage can deprioritize them if the build runs over budget.

---

### Question 4 — The Wrong Assumption

> "What is the assumption in this request that is most likely to be wrong? State it explicitly and note what the spec should do if the assumption turns out to be false."

Every feature request rests on assumptions about the user, the environment, the data, or the team's ability to implement. Most of these are correct. One or two are fragile. Identify the most dangerous assumption — the one whose failure would require the most rework.

**Output:**

```
DANGEROUS ASSUMPTION

Assumption:        [the assumption most likely to be wrong]
Why it might fail: [the scenario in which this assumption breaks]
Fallback:          [what the spec should do / how the design should adapt if this assumption is false]
Spec impact:       [document the assumption explicitly in the Assumption Register so the build stage can flag divergences]
```

---

### Question 5 — The 10-Star Version

> "If this product were extraordinary, not just complete, what one thing would make it so? Is that thing in scope or out of scope, and why?"

Not every feature needs to be extraordinary. But knowing what extraordinary looks like is useful context. It tells the build stage what direction "better" is in, even if "better" is not in scope for this delivery.

**Output:**

```
10-STAR VERSION

Extraordinary differentiator: [the one thing that would make this feature exceptional]
In scope?          [YES — include in spec | NO — note as future direction]
Why in/out:        [rationale]
```

---

## Challenged Premises Section

After all five questions are answered, add a `CHALLENGED PREMISES` section to the Assumption Register in the spec. Format:

```
CHALLENGED PREMISES

Framing:       [CORRECT FRAMING | REFRAMED to: ...]
Wedge items:   [none flagged | [X, Y] flagged as DEFERRABLE]
Dangerous assumption: [the assumption + its fallback, copied from Question 4]
10-star note:  [in scope | noted as future direction: ...]
```

Downstream stages (plan, build, review) read `CHALLENGED PREMISES` and can flag divergence. If the build stage implements something flagged as DEFERRABLE, that is worth noting in the review. If the dangerous assumption turns out to be false during the build, the failure analysis can reference the documented fallback.

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Answering questions with "this seems fine" | Each question requires a specific answer — vague assessments produce no signal |
| Challenging the request so aggressively that no spec is written | The goal is to refine framing, not reject requests — always produce a spec |
| Marking too many items DEFERRABLE | Deferred scope must be genuinely separable; don't defer load-bearing requirements |
| Skipping the questions when the request is "obvious" | Obvious requests have obvious assumptions — those are the most dangerous ones |

---

## Verification

- [ ] All five forcing questions answered with explicit output
- [ ] `CHALLENGED PREMISES` section added to the Assumption Register
- [ ] At least one DEFERRABLE item identified (or documented that none exist)
- [ ] Dangerous assumption stated and fallback documented
- [ ] Spec framing checked against the Framing Test output — if reframed, spec reflects the reframe
