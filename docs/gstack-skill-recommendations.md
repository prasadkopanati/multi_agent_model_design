# gstack-Inspired Skill Recommendations for agenticspiq

**Source material:** [gstack](https://github.com/garrytan/gstack) — Garry Tan's (President & CEO of Y Combinator) open-source software factory. Built from two years of shipping production software at 810× his 2013 pace: 3 production services and 40+ features in 60 days, part-time, while running YC full-time. Twenty-three specialist roles and eight power tools, all slash commands, all Markdown, MIT license.

**Unique perspective:** gstack is not a theoretical framework. It is the documented workflow of a person who has shipped at YC scale, advised Coinbase/Instacart/Rippling at founding stage, and now ships real products faster than traditional teams. Every skill in gstack exists because a real production failure or slowdown prompted it. The recommendations below carry that provenance — they are battle-tested patterns, not thought experiments.

**Method:** Each recommendation identifies a specific gap in the current agenticspiq pipeline, explains the gstack mechanism that addresses it, and describes precisely what the new skill should encode. Recommendations are mapped to the agent that owns the relevant stage — not as general improvements, but as targeted additions to the Controller, Executor, and Finisher roles.

---

## How gstack Maps to agenticspiq

| gstack Role | agenticspiq Agent | Pipeline Stage |
|---|---|---|
| YC Office Hours + CEO Review + Eng Review | Claude Code (Controller) | `spec → plan → review → failure-analysis` |
| Builder — Implements, tests, commits | OpenCode (Executor) | `build → test → fix loops` |
| Release Engineer + SRE | Gemini (Finisher) | `finish` |

The mapping is tighter than it first appears. gstack's workflow is `Think → Plan → Build → Review → Test → Ship → Reflect`. agenticspiq's pipeline is `spec → plan → build → test → review → finish`. They are the same sprint model with different agent topology. gstack runs all roles in one Claude Code session; agenticspiq routes each role to the most capable model for that kind of work. The skills that gstack uses to enforce process discipline in a single session translate directly into prompts for each agent's stage.

---

## Claude Code (Controller) — Two Additions

Claude Code's role in agenticspiq: **decide**. It writes the spec, locks the plan, issues the review verdict, and diagnoses failures. It never writes product code. The two gstack patterns below address the two places where Controller decisions have the highest downstream cost: the beginning of the pipeline (spec quality) and the failure recovery loop (failure analysis quality).

---

### 1. Forcing-Question Spec Interrogation — `SPEC_CEO_CHALLENGE.md`

**gstack source:** `/office-hours` — Six forcing questions that challenge the *framing* of a product request before any spec is written. The `/plan-ceo-review` skill extends this: it finds the 10-star product hiding inside the stated request, running through Expansion, Selective Expansion, Hold Scope, and Reduction modes to pressure-test scope from every angle. The design doc that `/office-hours` produces feeds every downstream skill automatically.

**The gap in agenticspiq today:** The `spec.md` prompt asks Claude to identify ambiguous or missing information and answer each question conservatively. This is *incremental clarification* — it fills gaps in a stated request without questioning whether the request itself is correct. The ASSUMPTION REGISTER that results is a list of resolved ambiguities, not a list of challenged premises. When a request is fundamentally misframed (the user asked for a "daily briefing app" but actually needs a "personal chief of staff AI," in gstack's famous example), conservative gap-filling produces a spec that is internally consistent but strategically wrong. That misframing becomes a plan, a build, a test cycle, and a review — at which point the cost to correct it is maximum.

**The principle gstack encodes:** The cheapest time to challenge a problem framing is before the spec is written. Product failures almost never come from bad implementation of the right idea. They come from high-quality implementation of the wrong idea. A forcing-question pass at the spec stage surfaces the delta between what was asked and what is actually needed, before any work is done.

**What the new skill should encode:**

```
SPEC_CEO_CHALLENGE.md — run at the start of the spec stage, before Step 2 (writing the spec)
```

Instruct Claude to apply five forcing questions to the feature request before producing the ASSUMPTION REGISTER:

1. **The Framing Test** — "You said `[X]`. Is that the problem, or is `[X]` a symptom of a deeper problem? What is the user actually trying to accomplish?"
2. **The Narrowest Wedge** — "What is the smallest implementation that would test whether this idea works? What scope exists solely because it seems complete, not because it is necessary for the hypothesis?"
3. **The Deferred Scope Scan** — "Which requirements can be built in a Phase 2 without invalidating the Phase 1 delivery? Flag each as CORE or DEFERRABLE."
4. **The Wrong Assumption** — "What is the assumption in this request that is most likely to be wrong? State it explicitly and note what the spec should do if the assumption turns out to be false."
5. **The 10-Star Version** — "If this product were extraordinary, not just complete, what one thing would make it so? Note whether it is in scope or out of scope, and why."

Each question should be answered by Claude (operating autonomously), with the answer recorded in the ASSUMPTION REGISTER under a new section: `CHALLENGED PREMISES`. The downstream stages (plan, build, review) read this section and can flag when implementation diverges from the challenge findings.

**Why this adds value to agenticspiq specifically:**

agenticspiq is an autonomous pipeline. There is no product manager at the spec → plan transition asking "wait, is this the right problem?" The Controller is the only thing that can challenge the framing, and only at the spec stage. If it doesn't, the pipeline will faithfully execute the wrong thing at full speed. The forcing-question pass costs one LLM call at the cheapest point in the pipeline. The alternative — discovering the misframing at review — costs a full spec → plan → build → test → review cycle.

---

### 2. Iron Law Failure Investigation — `FAILURE_INVESTIGATION.md`

**gstack source:** `/investigate` — Systematic root-cause debugging with an "Iron Law: no fixes without investigation." The skill traces data flow from the failure point backward, forms explicit hypotheses, tests each hypothesis against the evidence before committing to a fix, and hard-stops after 3 failed attempts (escalating rather than thrashing). It auto-freezes scope to the module being investigated so the agent cannot introduce new changes while debugging.

**The gap in agenticspiq today:** The failure analysis loop in `retry.js` works as follows: Claude reads the error string and produces `{root_cause, fix_strategy, affected_files, confidence}` in a single pass. This JSON is injected into the retry context. There is no trace-the-data-flow step, no hypothesis formation, no test-before-fix verification. The result is that the failure analysis can produce high-confidence but structurally wrong diagnoses. A common failure pattern: the error message points to where the failure *surfaced* (the test assertion), not where it *originated* (the function that produced the wrong value three calls up). The analysis blames the wrong file, the retry builds in the wrong place, and the second failure is different but equally wrong.

The existing `failure.md` prompt + `FAILURE_CONTEXT_CONTINUITY.md` skill provide good structural continuity between retries — they prevent the executor from forgetting what was tried. But they don't enforce an investigative discipline before a fix is proposed. The output shape `{root_cause, fix_strategy, affected_files, confidence}` is right; the methodology that fills it is too shallow.

**The principle gstack encodes:** Confidence is not a substitute for investigation. An LLM pattern-matching on an error message can produce 0.9 confidence for the wrong root cause. The Iron Law — no fix without an explicit trace from symptom to origin, with competing hypotheses ruled out — converts "I think I know what's wrong" into "I have traced why this is wrong and confirmed one hypothesis against the others."

**What the new skill should encode:**

```
FAILURE_INVESTIGATION.md — replaces or extends the current failure stage prompt
```

Restructure the failure stage around four explicit steps:

**Step 1 — Trace (not guess):** Starting from the error message, trace data flow backward. Where did the failing value originate? Which function set it? Which call site invoked that function? The trace must end at a root event (a write, a parse, an assumption), not at the error site (a read, an assertion, a throw).

**Step 2 — Form competing hypotheses:** State at least two candidate root causes before proposing any fix. For each hypothesis: (a) what evidence supports it, (b) what evidence contradicts it, (c) what one check would definitively confirm or rule it out.

**Step 3 — Score and commit:** Evaluate each hypothesis against the evidence. Pick the highest-scoring one. If two hypotheses are equally plausible, pick the one whose fix has the smaller blast radius (fewer files, less behavioral change).

**Step 4 — Declare fix scope:** Before the retry, state exactly: which files will change, which functions will change, what the before-state is, what the after-state should be, and what test command confirms the fix worked. This declaration becomes the `fix_strategy` and `affected_files` in the failure JSON — derived from investigation, not from pattern-matching.

**Hard stop rule:** If 3 consecutive failure cycles produce different root causes for the same stage failure (i.e., each analysis contradicts the previous one), confidence is zero and human escalation is correct. The current `shouldEscalate` logic in `retry.js` counts failures; the enhanced version should also detect contradictory analyses as an escalation signal.

**Why this adds value to agenticspiq specifically:**

The retry loop is the most expensive part of the pipeline — each retry burns token budget, invokes agents, and adds latency. Most wasted retries don't happen because the executor can't implement a fix; they happen because the failure analysis pointed at the wrong root cause and the retry built the wrong thing. Better failure analysis is a direct multiplier on pipeline efficiency. In the current system, `retry_limit: 3` means three attempts are available. With Iron Law investigation, each attempt is meaningfully better-informed than the last rather than being a variation on the same wrong diagnosis.

---

## OpenCode (Executor) — Two Additions

OpenCode's role: **do**. It writes code, runs tests, fixes failures, commits work. It operates within the scope defined by the plan and the constraints set by the Controller. The two gstack patterns below address the Executor's two most impactful failure modes: losing work to mid-build failures, and not guarding against the bugs it finds.

---

### 3. WIP Checkpoint Commits with Structured Context — `WIP_CHECKPOINT.md`

**gstack source:** Continuous checkpoint mode — auto-commits in-progress work with a `WIP:` prefix and a structured `[gstack-context]` body containing three fields: `decisions made so far`, `remaining work`, `failed approaches already tried`. If the session crashes or the context limit is hit, `/context-restore` reads those commits and reconstructs session state. Before `/ship`, WIP commits are squash-filtered so the final PR history is clean.

**The gap in agenticspiq today:** The build stage can take a long time — multiple tasks, multiple test iterations, multiple fix loops. When the build stage fails and `retryStage` is called, the retry invokes `runStage` with the *original* build context: the full plan, the full spec, no knowledge of what was already completed. The executor restarts from scratch. If task 1 and task 2 were already committed before the failure on task 3, the executor might attempt to implement task 1 again (creating conflicts), skip task 3 entirely (missing the failed task), or retry the same broken approach on task 3 (because it has no record of what it already tried). The `BUILD_HANDOFF_SUMMARY.md` skill produces a summary at the *end* of a successful build — it is not available if the build fails mid-way.

The token budget in agenticspiq is `200,000` tokens (`tasks.json: token_budget.total`). Long builds push against this limit. When the context is exhausted, work in progress is lost. There is currently no mechanism to preserve partial progress.

**The principle gstack encodes:** Commits are save points. An AI agent working on a multi-step build should treat each completed step as a commit, not an in-memory accumulation. The structured context body converts each WIP commit from a raw snapshot into a resumable state document that a fresh agent instance can read and continue from.

**What the new skill should encode:**

```
WIP_CHECKPOINT.md — added to the build and test stage skills catalog
```

Instruct OpenCode to operate in explicit checkpoint discipline:

**After every completed task:** Commit all changes with message `WIP(build): task-N complete — <task title>`. The commit body should contain:

```
[gstack-context]
completed: [task-1, task-2, task-N]
remaining: [task-N+1, task-N+2, ...]
failed_approaches: []
notes: <any decisions made that aren't obvious from the code>
```

**After every failed test run:** Before attempting a fix, commit the current state with message `WIP(fix): attempt-N — <what was tried>`. Append the attempted approach to `failed_approaches` in the body:

```
[gstack-context]
...
failed_approaches:
  - attempt-1: added null check on line 42 — error changed but not resolved
  - attempt-2: moved validation to call site — same error
```

**On retry:** The orchestrator's `analyzeFailure` function (in `retry.js`) should be extended to read the most recent WIP commit body from the workspace before calling Claude for analysis. The `failed_approaches` field from the commit body becomes additional context for the failure JSON, alongside the error string. This gives the Controller concrete history ("we already tried X and Y") rather than starting each failure analysis cold.

**On completion:** The final build commit squashes all WIP prefixes into a clean history. The `BUILD_HANDOFF_SUMMARY.md` skill already produces a terminal summary — WIP checkpoint context feeds into that summary rather than competing with it.

**Why this adds value to agenticspiq specifically:**

agenticspiq is designed for autonomous operation. When a build fails, no human reviews what was partially done before deciding how to retry. The WIP checkpoint pattern gives the retry loop institutional memory inside the build stage itself — the executor leaves a trail of breadcrumbs that the failure analysis and the next retry attempt can follow. The direct beneficiary is the `failed_approaches` field: currently the failure JSON has no history of what was tried before the final error. With checkpoint context, it always does.

---

### 4. Regression Test Auto-Generation — `REGRESSION_GUARD.md`

**gstack source:** `/qa` — Test the app, find bugs, fix them with atomic commits, re-verify, auto-generate regression tests for every fix. The invariant: every bug found during a test run must result in a test that would have caught it. Not "fix the bug and move on" but "write the test that fails without the fix, then apply the fix, then verify the test passes." This is the TDD loop applied specifically to discovered bugs, not just to planned features.

**The gap in agenticspiq today:** The test stage (`test.md`) runs the existing test suite and fixes failures. The executor writes tests during the build stage for the features it just implemented — tests that cover the behavior the executor intended. But there are two gaps:

1. **Bugs discovered during testing have no test guard.** When a test fails and the executor applies a fix, the fix is committed but no new test is written to ensure the fixed behavior doesn't regress. The next build stage is free to reintroduce the same bug.

2. **No browser/interaction pass for web deliverables.** The test stage runs whatever tests were written — typically unit and integration tests. For web projects, the critical interaction paths (does the UI render correctly? does clicking this button do what it should?) are untested unless the executor explicitly wrote browser tests during the build stage. `BROWSER_TESTING.md` is already in the test stage skills catalog, but it is not required — the executor can declare the test stage complete with only unit tests passing.

The TDD ordering in `test.md` and the build stage is well-enforced for *planned* behavior. It is entirely absent for *discovered* behavior.

**The principle gstack encodes:** A bug found once and fixed without a test is a bug you will fix again. The regression test is not overhead — it is the long-term value extracted from the work of finding and fixing the bug. In an automated pipeline that will run repeatedly on the same codebase, a growing regression suite is the cumulative safety net that makes each subsequent run faster and more reliable.

**What the new skill should encode:**

```
REGRESSION_GUARD.md — added to the test stage skills catalog
```

Establish a mandatory protocol for every fix applied during the test stage:

**The Regression Rule:** For every fix applied to make a failing test pass, or to resolve a bug discovered during testing:

1. Before applying the fix: write a new test that specifically targets the broken behavior and confirms it fails without the fix. Commit this test with prefix `test(regression): <description of the broken behavior>`
2. Apply the fix
3. Verify the new regression test now passes alongside the original suite
4. Commit the fix with prefix `fix(<scope>): <description>` referencing the regression test

This extends the existing TDD gate (which applies to planned features in the build stage) to cover discovered bugs in the test stage.

**The Browser Gate for web deliverables:** For any project that includes HTML, CSS, or JavaScript output:

Before declaring the test stage complete, the executor must open a browser (using Playwright, already available via `BROWSER_TESTING.md`) and navigate through the primary user flow described in the spec. This is not a full QA audit — it is a smoke test of the golden path. The minimum bar: the feature exists in the UI, the primary interaction works, and no console errors appear. If this browser pass fails, the test stage is not complete.

The acceptance condition for the browser gate should be explicit in the test stage output: `BROWSER GATE: PASS — navigated to [URL], [primary action] worked, 0 console errors` or `BROWSER GATE: FAIL — [what failed]`.

**Why this adds value to agenticspiq specifically:**

agenticspiq runs pipelines that build production software. Each pipeline run is likely to introduce the same class of bugs on the same type of code. Without regression tests, the failure analysis → fix → retry loop in the build stage may converge correctly on a fix, but the same failure will recur in a future pipeline run on the same codebase. The regression test is the mechanism by which each pipeline run makes future pipeline runs more reliable. Over many runs, the test suite becomes a direct record of every failure the pipeline has encountered and resolved.

The browser gate closes the most common gap: a feature that passes its own tests but fails when a user actually uses it. For web projects built by agenticspiq, the primary interaction path must be verified by something with eyes, not just by the tests the executor wrote for itself.

---

## Gemini (Finisher) — Two Additions

Gemini's role: **deliver**. Run final verification, produce the delivery summary, execute the PR/merge/keep/discard action, and clean up. Gemini sees the pipeline from a different vantage point than the Controller or Executor — it has access to all prior stage artifacts (spec, plan, review, build output) and is responsible for the quality of the handoff to the rest of the world. The two gstack patterns below address what happens after the code is shipped: documentation drift and production verification.

---

### 5. Documentation Drift Repair — `DOCUMENTATION_RELEASE.md`

**gstack source:** `/document-release` — reads every documentation file in the project, cross-references it against the diff of what was just shipped, and updates everything that drifted: README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md, TODOs. gstack's `/ship` auto-invokes it, so documentation stays current without requiring an explicit command. The key insight: the agent knows exactly what changed (the diff) and exactly what the docs currently say (the files). It can identify precisely where they diverge.

**The gap in agenticspiq today:** The finish stage produces a delivery summary (from `FINISHING_BRANCH.md`) — an excellent PR description. But it produces nothing for the project's persistent documentation. When a pipeline runs and builds a new feature from spec through tests, the codebase changes substantially: new functions, new API endpoints, new configuration options, new file structures. The README that was accurate before the pipeline ran is stale after it. The ARCHITECTURE document doesn't reflect the new data flows. CONTRIBUTING may not mention new patterns introduced during the build. This documentation debt accumulates silently across pipeline runs.

The finish stage already has everything needed to do this work. Gemini reads the spec, the plan, and the review verdict to produce the delivery summary. The incremental cost of also reading the project's documentation files and identifying divergences is low — the context is already loaded. The PR that includes updated documentation is a fundamentally more complete deliverable than one where the reviewer must mentally reconcile stale README instructions with the new code.

**The principle gstack encodes:** Documentation debt is not a style issue — it is a communication failure. When a project's docs don't match its code, the next developer (or agent) to work on the project starts from wrong assumptions. In an agentic pipeline, where the next run of agenticspiq on the same workspace will read the existing docs as context, stale documentation directly degrades the quality of the next pipeline run's spec.

**What the new skill should encode:**

```
DOCUMENTATION_RELEASE.md — added to the finish stage skills catalog
```

After producing the delivery summary and before executing the delivery action:

**Step 1 — Inventory the docs:** Find every markdown file in the workspace that is not inside `.spiq/` (README.md, ARCHITECTURE.md, CONTRIBUTING.md, docs/, etc.). These are the project's persistent documentation.

**Step 2 — Cross-reference against the delivery:** Using the spec (`SPEC.md`), the plan (`tasks/plan.md`), and the commit history for this pipeline run, identify what changed: new features, new API surface, new configuration, new file structure, removed functionality. This is the "what changed" manifest.

**Step 3 — Identify drift:** For each documentation file, check: does it accurately describe the current state of the project given the "what changed" manifest? Specific checks:
- Does the README mention the new feature?
- Do setup instructions reflect any new dependencies or configuration?
- Does ARCHITECTURE reflect new data flows or new modules?
- Are any code examples in the docs now pointing at renamed or removed functions?

**Step 4 — Update atomically:** For each doc file that needs updates, apply the minimum necessary changes to make it accurate. Commit each update with prefix `docs(<filename>): update for [feature name] delivery`. Do not rewrite docs — only update the sections that are now inaccurate.

**Step 5 — Include in PR:** These documentation commits are part of the branch before the PR is created. The PR diff includes the code changes and the documentation updates together. The reviewer sees the complete picture.

**Why this adds value to agenticspiq specifically:**

agenticspiq is a pipeline that runs repeatedly on the same workspace. Each run reads context from the workspace — including docs. If the docs are stale from a previous run, the spec stage in the next run will brainstorm against wrong information. The forcing-question spec interrogation (recommendation 1) specifically asks Claude to check documented assumptions against reality — but only if the docs are accurate. Documentation drift repair is the maintenance task that keeps the whole pipeline's context trustworthy over time.

---

### 6. Post-Deploy Canary Verification — `POST_DEPLOY_CANARY.md`

**gstack source:** `/canary` — After deployment, runs a monitoring loop that watches for console errors, performance regressions, and page failures. Operates post-PR-merge: after CI passes and the deploy completes. Converts the delivery from "code shipped" to "code verified working in production." The `/land-and-deploy` skill uses it automatically: merge the PR, wait for CI and deploy, verify production health — one command from "approved" to "verified in production."

**The gap in agenticspiq today:** The finish stage ends at the boundary between "code shipped" and "code verified working." For `FINISH_ACTION=pr`, the PR is created and the pipeline reports `✅ Pipeline complete`. Whether the PR gets merged, whether CI passes, and whether the deploy succeeds are outside the pipeline's view. For `FINISH_ACTION=merge`, the code is merged directly to main — and again, the pipeline reports complete as soon as the merge command succeeds, not as soon as the deploy is verified healthy. There is no agent watching what happens after the merge.

This matters because agenticspiq is designed for autonomous operation. When a human ships code, they watch the deploy and notice if the site goes down. When an agent ships code, nobody is watching. A deploy that breaks production is not detected until a user hits the broken page — unless an automated check is in place.

**The principle gstack encodes:** Ship means deployed, not just merged. The delivery is not complete until production is verified. In a human-operated team, this is a post-deploy ritual ("check the dashboards, watch for errors"). In an automated pipeline, it must be encoded as a step, not left to chance.

**What the new skill should encode:**

```
POST_DEPLOY_CANARY.md — added to the finish stage skills catalog, conditionally invoked based on FINISH_ACTION
```

The canary logic is conditional on the delivery action:

**For `FINISH_ACTION=pr` (default):** The PR is created but not merged. The canary is not applicable yet — the code has not been deployed. The skill notes the PR URL in the delivery summary and adds an instruction for the human reviewer: "After merging, run: `node agent-cli/agent-cli.js --agent gemini --stage canary --workspace <path>`." No automatic canary; the merge is a human decision.

**For `FINISH_ACTION=merge`:** After the merge succeeds, the canary runs automatically:

1. **Wait for CI:** Poll the repository's CI status (via `gh run list` or similar) until the pipeline triggered by the merge either passes or fails. Timeout: configurable via `CANARY_TIMEOUT` env var, default 10 minutes.

2. **Health check:** If a `HEALTH_URL` is configured in `.env`, hit it and verify a 200 response. If not configured, detect the project type from the spec and attempt a reasonable default (e.g., `localhost:3000/health` for Node.js services, the primary route from the spec for web apps).

3. **Smoke verification:** For web projects, run a minimal Playwright pass: navigate to the root URL, confirm the page loads without console errors, confirm the primary UI element described in the spec is present.

4. **Outcome recording:** Write the canary result to `.spiq/artifacts/output/canary.json`:
   ```json
   {
     "status": "PASS" | "FAIL",
     "ci_status": "passed" | "failed" | "timeout",
     "health_check": "200 OK" | "<error>",
     "smoke_check": "PASS" | "FAIL — <what failed>",
     "verified_at": "<timestamp>",
     "production_url": "<url>"
   }
   ```

5. **On FAIL:** Capture the canary failure as a new failure record in `.spiq/artifacts/failures/canary-<timestamp>.json` and exit non-zero so the orchestrator can alert the human. The pipeline's `✅ Pipeline complete` message should only appear after the canary passes.

**For `FINISH_ACTION=keep` or `discard`:** No canary is applicable. The skill is a no-op.

**Why this adds value to agenticspiq specifically:**

`FINISH_ACTION=merge` is the highest-stakes delivery mode in agenticspiq — it bypasses the PR review step entirely. It is also the mode where a post-deploy canary adds the most value, precisely because there is no human reviewer between "code merged" and "code in production." The canary converts `FINISH_ACTION=merge` from "the agent merged and hoped for the best" to "the agent merged, waited for CI, verified production is healthy, and then reported complete." For an autonomous pipeline, that distinction is the difference between automation you can trust and automation you must babysit.

---

## Implementation Priority

These six skills are not equal in implementation effort or in the leverage they provide. A suggested priority order based on impact-to-effort ratio:

| Priority | Skill | Why First |
|---|---|---|
| 1 | `WIP_CHECKPOINT.md` (OpenCode) | Purely a prompt instruction. No orchestrator changes. Immediately reduces the cost of mid-build failures and enriches failure context. |
| 2 | `REGRESSION_GUARD.md` (OpenCode) | Purely a prompt instruction. Directly extends the existing TDD gate to cover discovered bugs. Compounds in value across multiple pipeline runs. |
| 3 | `FAILURE_INVESTIGATION.md` (Claude Code) | Updates the existing `failure.md` prompt. Higher value for complex failures; lower value for simple ones. No orchestrator changes needed. |
| 4 | `DOCUMENTATION_RELEASE.md` (Gemini) | New prompt section in `finish.md`. Medium effort. Creates compounding value as pipeline runs accumulate — each run's docs stay accurate for the next. |
| 5 | `SPEC_CEO_CHALLENGE.md` (Claude Code) | New section in `spec.md`. Highest strategic value but also most likely to produce verbose output that requires tuning. Start narrow (3 questions, not 5). |
| 6 | `POST_DEPLOY_CANARY.md` (Gemini) | Requires orchestrator integration and env var conventions. Highest effort. Most valuable for `FINISH_ACTION=merge` pipelines specifically. |

---

## Relationship to Existing Skills

These additions are additive, not replacements. They slot into the existing skill catalog:

| New Skill | Stage | Skills already in catalog |
|---|---|---|
| `SPEC_CEO_CHALLENGE.md` | spec | `BRAINSTORMING.md`, `SPEC_DRIVEN.md` |
| `FAILURE_INVESTIGATION.md` | failure | `DEBUGGING.md`, `FAILURE_CONTEXT_CONTINUITY.md` |
| `WIP_CHECKPOINT.md` | build, test | `EXECUTION_DISCIPLINE.md`, `BUILD_HANDOFF_SUMMARY.md` |
| `REGRESSION_GUARD.md` | test | `TEST_DRIVEN.md`, `BROWSER_TESTING.md`, `VERIFICATION_BEFORE_COMPLETION.md` |
| `DOCUMENTATION_RELEASE.md` | finish | `FINISHING_BRANCH.md`, `SPEC_TRACED_DELIVERY.md` |
| `POST_DEPLOY_CANARY.md` | finish | `FINISHING_BRANCH.md`, `PIPELINE_INTEGRITY_CHECK.md` |

In each case, the existing skills define the stage's standard workflow. The new skill adds a specific discipline to one moment in that workflow: before the spec is written, before a fix is proposed, after each task is completed, after a bug is fixed, after the PR is created, after the merge is executed.

---

## Why gstack's Provenance Matters

Most prompt engineering frameworks are theoretical. gstack is documented production behavior from a builder who shipped 240× his full 2013 output in the first four months of 2026, while running one of the world's most demanding jobs. The skills above are not invented from principles — they emerge from patterns that Garry Tan hit, felt the cost of, and built explicit workflow enforcement around.

`/investigate`'s Iron Law exists because someone tried to fix a bug without a trace and made it worse. `/document-release` exists because a PR was merged with stale README instructions that caused the next developer to be confused. `/canary` exists because a deploy was verified only by "tests passed" and broke in production. Checkpoint mode exists because a session crashed mid-build and the work was lost.

When these patterns are encoded into agenticspiq's skills, they carry that same provenance: each one is a hard-won constraint that prevents a known and painful failure mode from recurring.
