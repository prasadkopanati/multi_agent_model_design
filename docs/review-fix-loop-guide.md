# Review Fix Loop Guide

## Overview

Prior to this feature, a failed code review permanently stopped the pipeline:

```
review FAIL → ⛔ "Fix issues and re-run from the build stage."
```

The human had to manually fix the code and restart the entire `build → test → review` sequence from scratch — even when the reviewer had already identified exactly which files and lines needed attention.

The **review fix loop** replaces that dead end with an automated, targeted fix cycle:

```
review FAIL → fix (executor) → test → review
                  ↑________________________________|  (loops up to retry_limit)
```

When review fails, the orchestrator:
1. Compiles a targeted fix prompt from the review output
2. Runs the executor agent to apply surgical fixes
3. Re-runs the test stage to catch regressions introduced by the fix
4. Re-runs the review stage to verify the fixes resolved the flagged issues
5. Repeats up to `retry_limit` times before escalating to a human

This avoids a full build re-run. The executor already has working code — it just needs precise, scoped corrections based on the reviewer's findings.

---

## Pipeline Position

The fix stage is not a linear entry in the pipeline. It is a sub-loop triggered exclusively by a review FAIL verdict, invisible to the normal stage sequence:

```
brainstorm → spec → plan → build → test → review → finish
                                              │
                                          [FAIL]
                                              ↓
                                    fix (executor)
                                              ↓
                                    test (regression check)
                                              ↓
                                          review
                                              │
                              ┌──────────────┘
                          [FAIL again, attempts < retry_limit]
                              ↓
                          (loop repeats)
                              │
                          [PASS] → finish
                          [FAIL, attempts ≥ retry_limit] → ⛔ human required
```

---

## Configuration

### Agent selection

The fix stage uses the executor agent (same role as `build` and `test`). Configure it via `.env`:

```env
AGENT_FIX=openclaude    # or opencode, claude, gemini
```

**Default** (when `AGENT_FIX` is not set): `opencode`

The default is defined in `orchestrator/orchestrator.js`:

```js
const DEFAULT_AGENTS = {
  ...
  fix: "opencode",
};
```

### Retry limit

The maximum number of fix attempts before the pipeline escalates to a human is controlled by `retry_limit` in `.spiq/tasks.json`:

```json
{
  "retry_limit": 3
}
```

If `retry_limit` is absent, the orchestrator defaults to `3`. Each `fix → test → review` cycle counts as one attempt. On exhaustion:

```
⛔ Review failed after 3 fix attempt(s). Human intervention required.
```

The `human_required` flag is set to `true` in `tasks.json`, and the pipeline exits with status 1.

### Attempt tracking

The orchestrator persists the fix attempt counter in `tasks.json` under the key `fix_attempts`:

```json
{
  "fix_attempts": 1
}
```

This survives process restarts. If the pipeline crashes mid-loop and is re-run, the counter is not reset — the retry budget is accurately preserved across restarts.

When review eventually passes, `fix_attempts` is reset to `0` so the next pipeline run starts with a clean slate.

---

## How It Works — Step by Step

### 1. Review FAIL detected

After the review stage runs, `isReviewPass()` inspects the output for a `verdict: pass` pattern (case-insensitive). On FAIL:

```
REVIEW SUMMARY
Verdict: FAIL
...
🔧 Review FAIL — running targeted fix (attempt 1/3)...
```

### 2. Fix stage

The orchestrator compiles `prompts/fix.md` with the current context (including `{{REVIEW}}` — the full review output) and dispatches it to the executor agent via `agent-cli`.

The fix prompt instructs the executor to:

- **Triage** the review output into three severity buckets: Critical, Important, Suggestions
- **Fix Critical and Important** issues in order of severity, making minimal targeted changes only to files mentioned in the review
- **Commit** each logical fix separately: `fix(<scope>): <what was wrong and what was changed>`
- **Skip** suggestions that require architectural changes
- **Output a FIX SUMMARY** as the final message

The compiled prompt is written to:
```
.spiq/artifacts/compiled/fix.md
```

The agent's output is written to:
```
.spiq/artifacts/output/fix.json
```

#### Skills loaded for the fix stage

The fix stage loads the following skills (defined in `orchestrator/promptCompiler.js`):

| Skill | Purpose |
|-------|---------|
| `SKILLS.md` | Core operating principles |
| `INCREMENTAL_IMPLEMENTATION.md` | Make changes in small, verifiable steps |
| `DEBUGGING.md` | Systematic error diagnosis |
| `GIT.md` | Correct commit hygiene |
| `EXECUTION_DISCIPLINE.md` | Declare scope before touching code |

### 3. Test re-run

Immediately after the fix stage completes, the test stage is re-run to catch any regressions introduced by the fix:

```
🧪 Re-running test after fix...
```

The test output is read back and injected into `context.test`, so the subsequent review has access to the latest test results.

### 4. Review re-run

```
🔍 Re-running review...
```

The pipeline loops back to the review stage (the orchestrator decrements the loop index, causing the PIPELINE iterator to re-execute the review entry). The reviewer evaluates the fixed code from scratch.

If the verdict is now PASS, `fix_attempts` is reset and the pipeline proceeds to `finish`. If FAIL, the cycle repeats (up to `retry_limit`).

### 5. Worktree behavior

The fix and test re-run stages automatically execute inside the active git worktree. No additional worktree setup is needed — `context.execWorkspace` is already set from when `build` first ran, and `executeStage()` uses it transparently:

```js
const execWorkspace = context.execWorkspace || workspace;
```

All fix commits land on the same feature branch (`spiq/run-<timestamp>`) that build started.

---

## The Fix Prompt Template

**File:** `prompts/fix.md`

The template uses standard context variables:

| Variable | Content |
|----------|---------|
| `{{SKILLS}}` | Compiled skill references for the fix stage |
| `{{REVIEW}}` | Full review agent output (the failed review JSON) |
| `{{SPEC_FILE}}` | Path to `.spiq/SPEC.md` — for reference |
| `{{PLAN_FILE}}` | Path to `.spiq/tasks/plan.md` — for reference |

The executor is instructed to produce a `FIX SUMMARY` block as its final output:

```
FIX SUMMARY
Critical resolved: 3/3
Important resolved: 7/9
Suggestions addressed: 1/3
Files changed: index.html, style.css, script.js
```

This block is currently informational — it appears in `fix.json` but is not parsed by the orchestrator. See [Future Improvements](#future-improvements).

---

## State in `tasks.json`

After a fix cycle begins, `tasks.json` tracks:

```json
{
  "current_stage": "review",
  "retry_limit": 3,
  "fix_attempts": 1,
  "human_required": false
}
```

`current_stage` is always set to `"review"` during the fix loop — `fix` and the test re-run are internal sub-steps, not independently resumable pipeline stages. If the process crashes during a fix or test re-run, resuming will re-run `review` (which evaluates whatever state the code is in — correct behavior).

---

## Observability

Every sub-step in the fix loop emits events to `.spiq/artifacts/logs/pipeline.jsonl`:

| Event | Meaning |
|-------|---------|
| `review_verdict` | `{ verdict: "fail" }` — review returned FAIL |
| `stage_start` (fix) | Fix stage beginning |
| `stage_complete` (fix) | Fix stage completed without error |
| `stage_start` (test) | Test re-run beginning |
| `stage_complete` (test) | Test re-run completed |
| `stage_start` (review) | Review re-run beginning |
| `review_verdict` | `{ verdict: "pass" \| "fail" }` — result of re-review |

To inspect the event log:

```bash
cat workspace/.spiq/artifacts/logs/pipeline.jsonl | grep '"type":"review_verdict"'
```

---

## Files Changed by This Feature

| File | Change |
|------|--------|
| `prompts/fix.md` | New executor prompt template for targeted review fixes |
| `orchestrator/orchestrator.js` | Added `fix: "opencode"` to `DEFAULT_AGENTS`; replaced review FAIL exit with the fix→test→review loop |
| `orchestrator/promptCompiler.js` | Added `fix` entry to `BASE_SKILLS` |
| `.env` | Added `AGENT_FIX=openclaude` (and commented `#AGENT_FIX=opencode` in ideal-setup block) |
| `CLAUDE.md` | Updated pipeline diagram to show the fix loop branch |

---

## Future Improvements

### Parse and display the FIX SUMMARY

The `FIX SUMMARY` block in `fix.json` is currently not parsed. A `printFixSummary()` function (modeled on the existing `printReviewSummary()`) could extract and display it in the terminal after the fix stage completes, giving the operator visibility into what the executor actually resolved before the review re-runs.

### Per-issue confidence scoring

The review agent currently produces a flat list of Critical / Important / Suggestions. If the review output were extended with a `confidence` field per issue (similar to the failure analysis output), the fix agent could deprioritize or skip low-confidence findings and the orchestrator could make smarter decisions about when to escalate.

### Selective test re-run

The test re-run after fix currently re-runs the full test stage. For large test suites, a smarter approach would be to extract the `Files changed` list from the FIX SUMMARY and run only the tests that cover those files. This requires the fix stage to produce machine-readable output and the test stage to accept a file scope parameter.

### Separate fix retry budget from build retry budget

Currently, `retry_limit` is shared across all retry mechanisms (build failures via `retryStage`, and the fix loop). A dedicated `fix_retry_limit` key in `tasks.json` would let operators tune the two budgets independently — for example, allowing 5 fix attempts while keeping build retries at 3.

### Inject FIX SUMMARY into subsequent review context

When the fix loop iterates, the second review agent has no memory of what the first fix attempt resolved. Injecting the FIX SUMMARY from the previous fix run into the review context would let the reviewer acknowledge already-resolved issues and focus its FAIL verdict on remaining problems — reducing noise across iterations.

### Human approval checkpoint after N failures

After a configurable number of failed fix attempts (e.g., 2 out of 3), prompt the human for confirmation before the final attempt rather than silently exhausting the budget. This gives the operator a chance to review the review output and steer the fix manually without a full restart.
