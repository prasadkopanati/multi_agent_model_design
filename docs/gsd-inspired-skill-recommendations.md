# GSD-Inspired Skill Recommendations for agenticspiq

**Source material:** `get-shit-done` (GSD) — a meta-prompting, context engineering, and spec-driven
development system trusted at Amazon, Google, Shopify, and Webflow. Its core thesis is: *"If you
know clearly what you want, this WILL build it for you. No bs."* Its architectural insight maps
cleanly onto agenticspiq's three-agent model.

**Method:** Each recommendation below identifies a concrete failure mode in the current agenticspiq
pipeline, explains how GSD's corresponding mechanism addresses it, and describes precisely what the
new skill should encode.

---

## How GSD Maps to agenticspiq

| GSD Role | agenticspiq Agent | Pipeline Stage |
|---|---|---|
| Orchestrator / Plan Checker | Claude Code (Controller) | `spec → plan → review → failure-analysis` |
| Executor | OpenCode (Executor) | `build → test → fix loops` |
| Ship / Milestone completion | Gemini (Finisher) | `finish` |

GSD's most celebrated property — *"solves context rot, the quality degradation that happens as Claude
fills its context window"* — is less of a problem in agenticspiq because each agent runs in a fresh
`spawnSync` subprocess. But GSD's deeper value is in its **structured decision-making protocols**:
what to check before handing work off, how to bound fix attempts, what artifacts to produce at
completion, and how to verify delivery is coherent before shipping. Those are the gaps agenticspiq
has today.

---

## Claude Code — Controller (spec, plan, review, failure analysis)

### Skill 1: `PLAN_QUALITY_GATE.md`

**The failure mode this addresses:**

Claude writes a plan, the plan goes straight to OpenCode. If the plan has silent requirement drops,
tasks without verification steps, circular dependencies, or is simply too large to execute within a
single context window, OpenCode will fail — but the failure will manifest as a build error or test
failure. Three retry cycles will then burn budget attempting to fix a symptom (broken execution)
when the real cause was a broken plan.

The current pipeline has no stage between `plan` and `build` that asks: *does this plan actually
cover what the spec requires?*

**What GSD does:**

GSD's `gsd-plan-checker` agent runs pre-execution goal-backward verification across 12 dimensions.
The key principle: *"Plans describe intent. You verify they deliver. A plan can have all tasks
filled in but still miss the goal if key requirements have no tasks, tasks exist but don't actually
achieve the requirement, or scope exceeds context budget (quality will degrade)."*

The two most critical dimensions for agenticspiq are:

**Requirement coverage** — Does every spec requirement have a task that addresses it? GSD catches
the case where requirements exist in the spec but nothing in the plan touches them. It builds an
explicit matrix: `Requirement → Plans → Tasks → Status (COVERED / MISSING)`.

**Scope reduction detection** — The most insidious failure mode. A plan references a requirement
but delivers a fraction of it. Language patterns that signal this: *"v1", "static for now",
"hardcoded", "will be wired later", "future enhancement", "placeholder", "not connected to"*.
GSD treats every scope reduction as a BLOCKER, not a warning. The plan must either deliver the
requirement fully or split the phase.

**Scope sanity** — 2–3 tasks per planning unit is ideal. 5+ tasks means the executor's context
window will be nearly full when it reaches the last tasks, producing degraded quality on precisely
the hardest work.

**What the skill encodes for Claude:**

After Claude writes `plan.md` and before returning it to the orchestrator, it should self-check:

```
PLAN QUALITY GATE — self-check before returning plan.md

1. REQUIREMENT COVERAGE
   For each spec requirement, name the task(s) that address it.
   If any requirement has no task → flag as BLOCKER, revise plan before continuing.

2. SCOPE REDUCTION SCAN
   Scan every task description for: "v1", "static", "hardcoded", "placeholder",
   "future", "stub", "not wired", "minimal", "simplified".
   Any match against a spec requirement → BLOCKER. Deliver fully or split tasks.

3. TASK COMPLETENESS
   Every task must have: target files, specific action, verification command, done criteria.
   A task named "implement auth" with no files or verify step is not a task — it is a wish.

4. SCOPE SANITY
   > 4 tasks in a single planning block → WARNING; > 5 → split required.
   OpenCode's context fills as tasks accumulate; last tasks get worst quality.

5. DEPENDENCY CHECK
   If tasks have ordering constraints, state them explicitly.
   Circular constraints → BLOCKER.

Only return plan.md after all gates pass. Document any scope splits made.
```

**Why this matters more than the other possible Claude skills:**

The current failure analysis skill (`failure.md`) is reactive — it responds to broken execution.
The plan quality gate is preventive — it stops bad plans before they create failures. In practice,
many "build failures" are actually "plan failures" that OpenCode had no chance of succeeding
against. One plan quality gate prevents three retry cycles.

---

### Skill 2: `FAILURE_CONTEXT_CONTINUITY.md`

**The failure mode this addresses:**

When the same stage fails multiple times (up to `retry_limit = 3`), each failure analysis round
receives only the current failure log. Claude has no visibility into what fix strategies were
attempted in rounds 1 and 2. The result: it can suggest the same strategy again, burning the
remaining retry budget on a known-ineffective approach.

Looking at the current `failure.md` template:

```
Analyze the failure below and return STRICT JSON: { root_cause, fix_strategy, affected_files, confidence }
```

Round 2 receives the same template as round 1. There is no field for "prior attempts" and no
instruction to check what already failed.

**What GSD does:**

GSD's STATE.md tracks `blockers`, `decisions`, and `session history` across rounds. The executor's
deviation rules create a paper trail. GSD escalates to human when the same blocker appears a second
time rather than retrying with the same approach. The `gsd-forensics` command does post-mortem
investigation of failed workflow runs, diagnosing stuck loops.

**What the skill encodes for Claude:**

```
FAILURE CONTEXT CONTINUITY

Before producing failure analysis, load the failure history:

1. READ PRIOR FAILURES
   Check .spiq/artifacts/failures/ for previous failure records for this stage.
   If none exist: this is round 1, proceed normally.
   If prior records exist: load them before analyzing the current failure.

2. CROSS-REFERENCE ATTEMPTED STRATEGIES
   Build a list of strategies already tried:
   - Round N: root_cause = X, fix_strategy = Y, outcome = failed
   
   Do NOT suggest a fix strategy that matches a prior attempted strategy.
   A strategy "matches" if it targets the same root cause with the same approach.

3. ESCALATION GATE
   If the same root cause has appeared in 2+ failure records:
   → Set confidence to 0.0
   → Set fix_strategy to "ESCALATE: same root cause has failed twice —
     human review required before next attempt"
   → Do NOT suggest a third automated fix for the same cause

4. ENRICHED OUTPUT
   Extend the JSON output with:
   {
     "root_cause": "",
     "fix_strategy": "",
     "affected_files": [],
     "confidence": 0.0,
     "previous_attempts": [
       { "round": 1, "strategy": "", "outcome": "failed" }
     ],
     "escalation_flag": false,
     "novel_hypothesis": ""
   }
   
   novel_hypothesis: if prior strategies failed, what is a fundamentally different
   approach? If no novel hypothesis exists, escalation_flag should be true.
```

**Why this matters more than the other possible Claude skills:**

Context rot prevention is the other major GSD concept worth adapting, but agenticspiq's subprocess
architecture already addresses the core form of context rot (each stage runs fresh). Failure context
continuity, by contrast, is a real gap — retry round 2 is currently as blind as round 1. This skill
makes each retry round smarter than the last, which directly reduces the "exceeded retry limit,
escalating to human" frequency. Fewer human escalations means the pipeline ships more autonomously.

---

## OpenCode — Executor (build, test, fix loops)

### Skill 3: `EXECUTION_DISCIPLINE.md`

**The failure mode this addresses:**

OpenCode can enter two common failure states that waste context budget without producing useful
output:

**Analysis paralysis:** OpenCode reads exhaustively — examining every file that might be relevant —
before writing anything. In practice, once it has read 5+ files without making a change, it is
usually in a loop. The additional reads rarely add information that changes the approach; they
consume tokens and delay execution.

**Scope creep in fix loops:** When a fix prompt identifies broken file X, OpenCode may "also fix"
adjacent issues in files Y and Z that it noticed while investigating. These out-of-scope fixes
introduce new variables into already-failing code, making it harder to isolate whether the original
fix worked.

**Unbounded fix attempts per task:** The current retry limit is on the stage level (3 retries), not
the task level. If one task is fundamentally broken, OpenCode can burn all 3 stage retries on it
while leaving the remaining tasks untouched.

**What GSD does:**

GSD's `gsd-executor` contains three interlocking guards that address all three failure modes:

**Analysis paralysis guard:** *"During task execution, if you make 5+ consecutive Read/Grep/Glob
calls without any Edit/Write/Bash action: STOP. State in one sentence why you haven't written
anything yet. Then either: (1) Write code (you have enough context), or (2) Report 'blocked' with
the specific missing information. Do NOT continue reading. Analysis without action is a stuck
signal."*

**Scope boundary:** *"Only auto-fix issues DIRECTLY caused by the current task's changes.
Pre-existing warnings, linting errors, or failures in unrelated files are out of scope. Log
out-of-scope discoveries to deferred-items, do NOT fix them."*

**Deviation rules** — a four-tier decision framework:
- Rule 1: Auto-fix bugs (broken behavior in current task's files)
- Rule 2: Auto-add missing critical functionality (null checks, auth, error handling)
- Rule 3: Auto-fix blocking issues (missing dependency, broken import)
- Rule 4: STOP and escalate for architectural changes (new DB table, switching libraries)

**Fix attempt limit:** *"After 3 auto-fix attempts on a single task: STOP fixing — document
remaining issues in SUMMARY, continue to the next task. Do NOT restart the build to find more
issues."*

**What the skill encodes for OpenCode:**

```
EXECUTION DISCIPLINE

ANTI-PARALYSIS RULE
Track your consecutive Read/Grep/Search calls per task.
After 5 consecutive reads with no Edit/Write/Bash action:
  STOP. Write in one sentence: why haven't you started writing yet?
  Then: write code or report the specific blocker. Do not read more.

SCOPE BOUNDARY
For each build/fix task, establish a scope boundary at the start:
  IN SCOPE: files explicitly named in the task OR files broken BY your changes
  OUT OF SCOPE: pre-existing issues in other files, unrelated linting, adjacent bugs

When you notice an out-of-scope issue:
  → Log it to .spiq/artifacts/deferred-issues.md
  → Do NOT fix it during this task
  → Do NOT re-run the build hoping it resolves itself

DEVIATION CLASSIFICATION — apply in order:
  If the issue is broken behavior caused by current task → fix automatically (Rule 1)
  If the issue is missing safety/correctness functionality → add automatically (Rule 2)
  If the issue is a blocking dependency/import error → fix automatically (Rule 3)
  If the fix requires architectural change (new table, library swap) → STOP, escalate (Rule 4)
  When in doubt: "Does this affect correctness or the ability to complete this task?"
    YES → Rules 1-3   MAYBE → Rule 4

FIX ATTEMPT LIMIT PER TASK
Track fix attempts per task independently.
After 3 fix attempts on one task:
  → Document the remaining issue clearly
  → Mark the task as "blocked: max fix attempts"
  → Move to the next task
  → Do NOT retry the same approach a fourth time
```

**Why this matters more than the other possible OpenCode skills:**

The existing skills (INCREMENTAL_IMPLEMENTATION, TEST_DRIVEN, DEBUGGING) tell OpenCode *what* to
build. EXECUTION_DISCIPLINE tells OpenCode *how to behave when things go wrong*. The pipeline's
most expensive failure mode is not "OpenCode can't build the feature" — it's "OpenCode enters an
analysis or fix loop that burns the entire stage context without producing a usable result." This
skill specifically prevents that failure mode.

---

### Skill 4: `BUILD_HANDOFF_SUMMARY.md`

**The failure mode this addresses:**

OpenCode executes its tasks and produces code. The review stage (Claude Code) then evaluates the
code against the spec. But Claude has no way to know:
- Whether OpenCode deviated from the plan (it found a bug it had to fix, it made a different
  implementation choice, it couldn't complete a task and left a stub)
- What tests actually passed with what counts (the current VERIFICATION_BEFORE_COMPLETION skill
  helps, but the evidence doesn't persist as a handoff artifact)
- Whether any spec requirements ended up as stubs/placeholders rather than real implementations

Without this, Claude reviews blind. A diff shows what changed; it cannot show what was supposed to
change vs what was deferred. The review stage can PASS a build that left placeholders in exactly
the places the spec required real behavior.

**What GSD does:**

GSD's executor produces a `SUMMARY.md` after every plan completion. It covers:

**Deviation documentation:** Every auto-fix is logged with `[Rule N - Type] description`, the files
modified, and the commit hash. If nothing deviated: "None — plan executed exactly as written."

**Stub tracking:** *"Before writing the SUMMARY, scan all files created/modified for stub
patterns: hardcoded empty values (=[], ={}, =null, ="" that flow to UI rendering), placeholder
text ('not available', 'coming soon', 'placeholder', 'TODO', 'FIXME'), components with no data
source wired."* If any stubs exist, they are catalogued. *"Do NOT mark a plan as complete if stubs
exist that prevent the plan's goal from being achieved."*

**Self-check:** *"After writing SUMMARY.md, verify claims before proceeding. Check created files
exist. Check commits exist. Append: '## Self-Check: PASSED' or 'FAILED' with missing items."*

**What the skill encodes for OpenCode:**

```
BUILD HANDOFF SUMMARY

After completing all build/test tasks, before returning to the orchestrator,
create a handoff document at .spiq/artifacts/output/build-handoff.md

CONTENTS:

1. EXECUTION RECORD
   For each task: task name, status (complete/blocked), commit hash, key files changed.
   If any task was blocked after max fix attempts: state the specific blocker.

2. DEVIATION LOG
   For each auto-fix made: what was found, what was changed, which file, commit hash.
   If nothing deviated from the plan: state "None — executed as planned."

3. STUB INVENTORY
   Scan all created/modified files for:
   - Hardcoded empty values ([], {}, null, "") flowing to output
   - Placeholder text ("TODO", "FIXME", "coming soon", "placeholder", "not implemented")
   - Missing data source connections (component wired to mock/empty data)
   
   For each stub: file path, line range, description, whether it blocks spec requirement.
   If no stubs found: state "None found."

4. TEST EVIDENCE
   Paste the actual test command, actual output lines (pass/fail counts), and exit code.
   Do not summarize — include the raw evidence.

5. SELF-CHECK
   Verify:
   - All files named in the task exist on disk (spot-check 3)
   - All commits mentioned have valid hashes (git log --oneline -5)
   - Exit code of final test run was 0
   State: "Self-Check: PASSED" or "FAILED — [what is missing]"

The review stage reads this handoff document. If it is missing or incomplete,
the review stage cannot verify that execution matched the plan.
```

**Why this matters more than the other possible OpenCode skills:**

The checkpoint protocol (GSD's human-verify / decision / human-action checkpoints) would add value
but requires infrastructure changes in the orchestrator. BUILD_HANDOFF_SUMMARY requires only a
change to OpenCode's output behavior. Yet its impact on review quality is immediate and large:
Claude reviewing a diff against the spec is much weaker than Claude reviewing a diff + a handoff
document that says exactly what deviated, what was stubbed, and whether the tests actually passed.
It also feeds directly into the Gemini delivery stage, which can use the stub inventory to block
delivery if uncompleted work would ship.

---

## Gemini — Finisher (PR creation, cleanup, delivery)

### Skill 5: `SPEC_TRACED_DELIVERY.md`

**The failure mode this addresses:**

Currently, Gemini creates a PR with a "delivery summary from the spec, plan, and review verdict."
But this is a narrative description, not a systematic verification. It is possible for Gemini to
create a well-written PR for code that implements 4 of 5 spec requirements because the plan
silently dropped one (and the plan quality gate wasn't there to catch it), or because OpenCode
stubbed one out and the review PASSED anyway.

The PR is the external-facing artifact that a human reviewer will trust. If it says "implemented
user authentication per spec §2", a reviewer expects complete authentication. If one requirement
was silently dropped, the reviewer has no way to know from the PR body alone.

**What GSD does:**

GSD's `gsd-ship` creates PRs with auto-generated bodies that trace back to phase goals and
requirements. Combined with `gsd-plan-checker`'s requirement coverage check and `gsd-executor`'s
SUMMARY.md, every delivered PR has a chain of evidence from requirement to implementation to commit.

GSD also has the `gsd-milestone-summary` command which generates a comprehensive summary for team
onboarding and review, tracing what was built against what was planned.

From the plan-checker: *"The executor marks completed requirements from PLAN.md frontmatter using
`requirements.mark-complete`. REQUIREMENTS.md checkboxes are updated with traceability table."*

**What the skill encodes for Gemini:**

```
SPEC-TRACED DELIVERY

Before creating the PR, build a requirement traceability check:

1. LOAD SPEC REQUIREMENTS
   Read .spiq/SPEC.md and extract every stated requirement.
   Requirements can be explicit ("shall", "must", "will") or implicit (stated user goals).
   Number them: R-01, R-02, R-03...

2. LOAD EXECUTION EVIDENCE
   Read .spiq/artifacts/output/build-handoff.md (if present).
   For each spec requirement, find:
   a. Which plan task addressed it
   b. Which commit implemented it (from handoff deviation log or task record)
   c. Whether any stub inventory entry indicates it was deferred

3. BUILD THE TRACEABILITY MATRIX
   | Requirement | Status | Implementation Evidence |
   |-------------|--------|------------------------|
   | R-01: ...   | FULL   | src/auth/login.ts (commit abc123) |
   | R-02: ...   | STUB   | Returns empty array — blocked by missing DB connection |
   | R-03: ...   | FULL   | src/api/session.ts (commit def456) |

4. DELIVERY GATE
   If any requirement is STUB or MISSING:
   → Do NOT create the PR
   → Report: "Delivery blocked: requirements [R-02, R-05] are incomplete.
     See stub inventory in build-handoff.md. Human review required."
   → Set human_required = true in .spiq/tasks.json

   If all requirements are FULL:
   → Proceed to PR creation

5. PR BODY STRUCTURE
   The PR body must include:
   - One-line summary of what was built
   - The traceability matrix (collapsed if >5 requirements)
   - Test evidence: X tests passed, 0 failed (from build-handoff.md)
   - Review verdict: PASS from review stage (cite the review artifact)
   - Delivery action taken (pr / merge / keep)

   Do NOT create a PR that omits the traceability matrix.
   Reviewers use it to verify completeness without re-reading the spec.
```

**Why this matters more than the other possible Gemini skills:**

The alternative major skill for Gemini is workspace archival — cleaning up `.spiq/artifacts/` and
archiving the run. That is valuable for repeated pipeline runs on the same project. But
SPEC_TRACED_DELIVERY addresses a more fundamental gap: it closes the loop between the spec (what
was promised) and the PR (what was delivered). Without this, the pipeline can complete every stage
with green checkmarks and still deliver something that missed a requirement — and nobody knows until
a human reviewer reads the code closely. This skill makes incomplete delivery visible at the last
possible point before it ships.

---

### Skill 6: `PIPELINE_INTEGRITY_CHECK.md`

**The failure mode this addresses:**

Gemini runs as a fresh subprocess in the finish stage. It receives the review output and the spec
file as context, but it has no independent view of whether the pipeline that preceded it actually
ran correctly. It is possible for the finish stage to be reached in degraded states:

- The review stage returned PASS with a low-confidence result
- An intermediate stage exhausted its retry budget and the orchestrator advanced anyway
  (the current pipeline advances on human escalation, but `human_required` might not be
  checked again at delivery time)
- `.spiq/artifacts/output/` is missing files from one of the build/test stages
- The token budget was partially exceeded in an earlier stage, meaning its output may be incomplete
- The tasks.json `failure_state.count > 0`, meaning retries occurred — and the final
  successful round may have produced lower-quality output under context pressure

Gemini currently takes the review PASS at face value and proceeds. But GSD's principle is: *"A
task is not complete until verification passes. 'Seems right' is never sufficient — there must be
evidence."*

**What GSD does:**

GSD's `gsd-health --repair` validates `.planning/` directory integrity and catches missing or
corrupted artifacts. Before `gsd-complete-milestone`, GSD does a comprehensive audit. The
`gsd-verifier` agent verifies code against goals after execution — a separate confirmation
independent of the executor's self-assessment.

GSD also distinguishes between the executor's self-check ("I believe the tests pass") and an
independently confirmed result ("I ran the tests and observed 24 pass, 0 fail"). The
VERIFICATION_BEFORE_COMPLETION skill in agenticspiq already captures this concept for the test
stage — this skill applies the same principle to the delivery stage.

**What the skill encodes for Gemini:**

```
PIPELINE INTEGRITY CHECK

Before taking any delivery action, independently verify the pipeline state:

1. TASKS.JSON STATE CHECK
   Read .spiq/tasks.json
   Required conditions for clean delivery:
   - current_stage = "finish"
   - human_required = false
   - failure_state.count < retry_limit  (count > 0 is a WARNING, not a blocker,
     but must be noted in PR body: "N retry cycles occurred during execution")
   
   If human_required = true:
   → STOP. Do not deliver. Report: "Pipeline requires human review before delivery."

2. ARTIFACT COMPLETENESS CHECK
   Required artifacts must exist:
   - .spiq/SPEC.md
   - .spiq/tasks/plan.md
   - .spiq/artifacts/output/ (at least one file per stage: build, test, review)
   
   For each missing artifact:
   → Record as WARNING if the stage completed (file may have been written elsewhere)
   → Record as BLOCKER if the stage has no output at all

3. REVIEW VERDICT VERIFICATION
   Do not rely on the review output passed in context alone.
   Read the actual review artifact from .spiq/artifacts/output/review-*.
   Confirm the exact string "Verdict: PASS" appears in it.
   If the file doesn't exist or "Verdict: FAIL" appears → STOP, do not deliver.

4. TOKEN BUDGET CHECK
   Read token_budget from tasks.json.
   If token_budget.used > (token_budget.total * 0.9):
   → WARNING: token budget was >90% consumed. Late-stage outputs may be degraded.
   → Include this warning in the PR body.

5. INTEGRITY REPORT
   Produce a short report before proceeding:
   
   PIPELINE INTEGRITY: [CLEAN | WARNINGS | BLOCKED]
   - tasks.json: current_stage=finish, human_required=false, retries=N
   - Artifacts: SPEC ✓, plan ✓, build output ✓, test output ✓, review output ✓
   - Review verdict: PASS confirmed from artifact (not inferred)
   - Token budget: N% consumed
   
   Only proceed with delivery if status is CLEAN or WARNINGS (with warnings noted in PR).
   BLOCKED → do not deliver, report specific blockers to orchestrator.
```

**Why this matters more than the other possible Gemini skills:**

The workspace archival / cleanup skill (GSD's `gsd-complete-milestone` analog) matters for
long-running projects where the `.spiq/` directory accumulates cruft over many pipeline runs. That
is valuable but lower-urgency. PIPELINE_INTEGRITY_CHECK addresses a real risk in every single run:
that Gemini ships code whose pipeline had silent failures, retry-cycle degradation, or
missing artifacts. The current finish stage assumes the pipeline reached it cleanly. This skill
verifies that assumption independently — defense-in-depth for the delivery gate.

---

## Implementation Summary

| Skill | Agent | File | Prevents |
|---|---|---|---|
| `PLAN_QUALITY_GATE.md` | Claude Code | `prompts/skills/PLAN_QUALITY_GATE.md` | Plan-level failures masquerading as build failures |
| `FAILURE_CONTEXT_CONTINUITY.md` | Claude Code | `prompts/skills/FAILURE_CONTEXT_CONTINUITY.md` | Circular retry loops suggesting already-failed strategies |
| `EXECUTION_DISCIPLINE.md` | OpenCode | `prompts/skills/EXECUTION_DISCIPLINE.md` | Analysis paralysis, scope creep, unbounded fix loops |
| `BUILD_HANDOFF_SUMMARY.md` | OpenCode | `prompts/skills/BUILD_HANDOFF_SUMMARY.md` | Blind review, undetected stubs, silent plan deviations |
| `SPEC_TRACED_DELIVERY.md` | Gemini | `prompts/skills/SPEC_TRACED_DELIVERY.md` | Incomplete delivery without traceability |
| `PIPELINE_INTEGRITY_CHECK.md` | Gemini | `prompts/skills/PIPELINE_INTEGRITY_CHECK.md` | Delivering from a degraded or partially-failed pipeline |

### Priority ordering for implementation

**Highest ROI (implement first):**
1. `PLAN_QUALITY_GATE.md` — Prevents the most expensive failure mode (bad plan → wasted retries)
2. `EXECUTION_DISCIPLINE.md` — Prevents context-burning loops in the most active agent

**High ROI (implement second):**
3. `BUILD_HANDOFF_SUMMARY.md` — Unlocks meaningful review; inputs directly into skill 5
4. `FAILURE_CONTEXT_CONTINUITY.md` — Makes retry rounds progressively smarter

**Complete the pipeline (implement third):**
5. `SPEC_TRACED_DELIVERY.md` — Requires skill 3 (handoff summary) to be meaningful
6. `PIPELINE_INTEGRITY_CHECK.md` — Defense-in-depth; most valuable after the above are in place

### Integration notes

Each skill is intended to be injected into the appropriate stage prompt via `{{SKILLS}}`:
- `PLAN_QUALITY_GATE.md` and `FAILURE_CONTEXT_CONTINUITY.md` → loaded in `prompts/plan.md` and
  `prompts/failure.md` for Claude
- `EXECUTION_DISCIPLINE.md` and `BUILD_HANDOFF_SUMMARY.md` → loaded in `prompts/build.md` for
  OpenCode
- `SPEC_TRACED_DELIVERY.md` and `PIPELINE_INTEGRITY_CHECK.md` → loaded in `prompts/finish.md`
  for Gemini

`BUILD_HANDOFF_SUMMARY.md` and `SPEC_TRACED_DELIVERY.md` are coupled: Gemini's traceability
check is most useful when the handoff document exists. If BUILD_HANDOFF_SUMMARY is not yet
implemented, SPEC_TRACED_DELIVERY should fall back to reading SPEC.md and git log directly.
