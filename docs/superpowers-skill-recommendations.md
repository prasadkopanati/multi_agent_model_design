# Superpowers Skill Recommendations for agenticspiq

## Summary

Cross-referencing the [superpowers](https://github.com/obra/superpowers) methodology against agenticspiq's 19 existing skills reveals six gaps that address the pipeline's most impactful structural weaknesses. Each recommendation is assigned to the agent whose unique capability best enables it.

---

## Pipeline Gaps Addressed

| Gap | Impact |
|---|---|
| Pre-spec ambiguity: raw requirements → spec with no clarification phase | High spec-approval rejection rate |
| Build handoff opacity: reviewer gets raw diffs, no summary of intent | Reviewers miss genuine issues; over-review on safe areas |
| Silent false completion: executor declares done without confirming tests passed | False positives advance to review; inflate retry count |
| Review response loop: FAIL verdict triggers blind retry with no triage protocol | Inefficient fix cycles; may miss Critical issues |
| Lifecycle gap: pipeline ends at `review` with no delivery mechanism | Requires manual developer intervention for every run |
| Sequential bottleneck: plan identifies parallel tasks but build executes sequentially | Throughput penalty proportional to project size |

---

## Recommendations

### Claude Code — `brainstorming` (spec stage)

**Skill file:** `prompts/skills/BRAINSTORMING.md`
**Stage wired to:** `spec`

**Why this skill, why this agent:**
The spec stage receives raw requirements and immediately writes SPEC.md. When requirements are ambiguous, the agent makes assumptions that the human rejects at the approval gate — triggering a full spec retry. A Socratic clarification phase before writing the spec surfaces ambiguities while they're still cheap to resolve.

Claude Code is the controller for all thinking stages and is the right agent for pre-spec reasoning. The clarification output becomes validated design premises that the spec is written against, reducing the spec-approval rejection rate.

**What it does:** Generates clarifying questions, surfaces implicit assumptions, explores design alternatives, and produces a short design premise summary before SPEC.md is written.

---

### Claude Code — `receiving-code-review` (review stage)

**Skill file:** `prompts/skills/RECEIVING_CODE_REVIEW.md`
**Stage wired to:** `review`

**Why this skill, why this agent:**
The review stage produces a PASS/FAIL verdict with categorized findings (Critical, Important, Suggestion). But no skill governs how the executor responds to a FAIL: which findings are blocking, which are optional, and how to verify each fix without introducing regressions.

Claude Code governs both sides of the review cycle — CODE_REVIEW.md produces the verdict; this skill closes the loop. Triage reasoning (deciding what blocks vs what's optional) is a judgment task for the controller, not the executor.

**What it does:** Buckets findings by severity after FAIL, addresses Critical first, verifies each fix, confirms all Critical and Important findings are resolved before resubmitting.

---

### OpenCode — `requesting-code-review` (build stage, terminal step)

**Skill file:** `prompts/skills/REQUESTING_CODE_REVIEW.md`
**Stage wired to:** `build`

**Why this skill, why this agent:**
Only the builder (OpenCode) knows which areas were uncertain during the build. The current build terminal step is a self-narrated completion summary. The reviewer (Claude Code) receives no structured handoff — no changed-file manifest, no test summary, no self-identified areas of concern — and must reconstruct intent from raw diffs.

This skill fires as the final step of the build stage. The output passes to the reviewer via the existing `{{BUILD}}` context placeholder.

**What it does:** At end of build, produces a structured handoff document: changed files with one-line summaries, tests run and outcomes, edge cases handled, spec requirements covered, and areas of concern for reviewer attention.

---

### OpenCode — `verification-before-completion` (test stage, terminal gate)

**Skill file:** `prompts/skills/VERIFICATION_BEFORE_COMPLETION.md`
**Stage wired to:** `test`

**Why this skill, why this agent:**
The test stage instructs OpenCode to run tests but there is no structural obligation for the agent to confirm the suite actually ran and passed before declaring done. Token-budget limits and timeouts (both listed in CLAUDE.md safety constraints) can terminate a stage before the full suite completes, with the agent reporting progress rather than confirmed completion.

OpenCode is the executor for the test stage and is strong at following deterministic checklist instructions. Verification-before-completion is a hands-on artifact check, not a judgment call.

**What it does:** Runs the full test suite, observes actual output, confirms pass count > 0 and fail count = 0, flags unexplained skipped tests, verifies build compiles, and emits a confirmed result — not a self-assessment.

---

### Gemini — `finishing-a-development-branch` (new `finish` stage)

**Skill file:** `prompts/skills/FINISHING_BRANCH.md`
**Stage wired to:** `finish` (new stage added to PIPELINE after `review`)

**Why this skill, why this agent:**
The pipeline ends at `review`. After a PASS verdict, the orchestrator prints "Pipeline complete" and stops. There is no delivery mechanism: no PR creation, no merge, no workspace cleanup. Every run ends requiring manual developer intervention.

Gemini's 1M+ token context window is suited to synthesizing all pipeline artifacts simultaneously for the delivery summary. Its `--approval-mode yolo` profile and full shell access make it well-suited for automated delivery execution.

**What it does:** Runs a final test verification, produces a delivery summary (what was built, review findings), executes the delivery action (creates PR by default; configurable via `FINISH_ACTION=merge|pr|keep`), and cleans up the workspace.

---

### Gemini — `dispatching-parallel-agents` (build stage)

**Skill file:** `prompts/skills/DISPATCHING_PARALLEL_AGENTS.md`
**Stage wired to:** `build`

**Why this skill, why this agent:**
The plan stage produces explicit parallelization annotations (e.g., "Task 5 parallel-safe after Task 2") but the build stage ignores them and executes all tasks sequentially. CLAUDE.md explicitly lists "Parallel task execution" as a future enhancement not yet implemented.

Gemini's large context allows it to hold the full task dependency graph and reason about execution batching. This skill defines the coordination pattern so that when parallel infrastructure is in place, the build stage can consume it.

**What it does:** Reads plan dependency annotations, groups independent tasks into execution batches, dispatches task batches in dependency order, and merges batch outputs. Reduces build wall-clock time to max-depth-branch time for plans with independent tasks.

---

## Files Created / Modified

| File | Status | Purpose |
|---|---|---|
| `prompts/skills/BRAINSTORMING.md` | New | Pre-spec clarification skill |
| `prompts/skills/REQUESTING_CODE_REVIEW.md` | New | Build-to-review handoff skill |
| `prompts/skills/RECEIVING_CODE_REVIEW.md` | New | Post-FAIL triage skill |
| `prompts/skills/VERIFICATION_BEFORE_COMPLETION.md` | New | Test terminal gate skill |
| `prompts/skills/FINISHING_BRANCH.md` | New | Post-review delivery skill |
| `prompts/skills/DISPATCHING_PARALLEL_AGENTS.md` | New | Build parallelization skill |
| `prompts/finish.md` | New | Finish stage prompt template |
| `orchestrator/promptCompiler.js` | Modified | Wire new skills into stages; add `finish` stage |
| `orchestrator/orchestrator.js` | Modified | Add `finish` to pipeline and default agents |
| `prompts/skills/SKILLS.md` | Modified | Add 6 new entries to skill index |

## Implementation Priority

1. `verification-before-completion` — additive only, no orchestrator changes, closes most dangerous failure mode
2. `requesting-code-review` — additive to build stage, `{{BUILD}}` context already wired
3. `receiving-code-review` — additive to review stage, closes FAIL-retry loop
4. `brainstorming` — additive to spec stage, highest impact on rejection rate
5. `finishing-a-development-branch` — requires new `finish` stage in orchestrator
6. `dispatching-parallel-agents` — requires parallel infrastructure; implemented first as planning/coordination, later as true dispatch
