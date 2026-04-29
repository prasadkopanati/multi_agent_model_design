# Stoneforge → agenticspiq Feature Comparison

A structured analysis of Stoneforge's architecture and capabilities, evaluated for relevance and value to agenticspiq. Features are categorised by priority and accompanied by implementation notes and rationale.

---

## Context: Two Systems, Different Scopes

### Stoneforge

A **continuous, parallel multi-agent runtime** with a web dashboard. Designed for teams running 3–5 agents simultaneously against a persistent task pool. It manages branching, merging, inter-agent messaging, and document libraries as ongoing infrastructure. Token burn is high by design — it's the cost of running a parallel team.

Key characteristics:
- Persistent Director + Ephemeral Workers + Stewards running concurrently
- Dispatch daemon continuously assigns ready tasks to idle workers
- Event-sourced state: SQLite (cache) + JSONL (source of truth)
- Web dashboard with live agent output, kanban, metrics, code editor
- Designed to replace Linear, Notion, Slack, and GitHub PR workflow in one system

### agenticspiq

A **deterministic, single-feature pipeline CLI** for small teams. Designed for one developer running one feature through `spec → plan → build → test → review → finish` with human approval gates at spec and plan. Simplicity is a core design principle — not a limitation.

Key characteristics:
- Sequential pipeline with strict role separation: Claude thinks, OpenCode executes, Gemini finishes
- Artifact-driven state: everything in `.spiq/`, no hidden memory
- Human-in-the-loop at spec and plan approval gates
- One pipeline run per feature; not a persistent service
- Small-team scope: no concurrent agents, no web dashboard, no message broker

### The Right Lens for This Analysis

Not every Stoneforge feature is a good fit for agenticspiq — many would violate its simplicity principle or require architectural changes that undermine its core design. The right question for each feature is not *"does Stoneforge have this?"* but *"does agenticspiq's current failure mode justify adding this complexity?"*

The features below are evaluated against that standard. Where agenticspiq already has partial infrastructure for a feature, the analysis describes exactly where to build on it.

---

## Current Gap Analysis

Before examining Stoneforge features, it helps to name agenticspiq's concrete pain points:

| Pain Point | When It Happens | Current Behaviour |
|---|---|---|
| Dirty workspace on build failure | Build stage modifies files then fails | Developer manually reverts or stashes |
| Cold start after max retries | `retryStage()` calls `process.exit(1)` after 3 failures | Developer reads failure JSON, manually fixes, re-runs from scratch |
| No diagnostic tool | Any misconfiguration or stuck state | Developer reads error output and inspects files manually |
| No timing or cost data | Every run | Developer has no insight into which stages are slow or expensive |
| Fixed pipeline for all task types | Bug fixes, hotfixes, refactors | Spec and plan stages run even when they add no value |
| Prompts baked into package install | Per-project customisation needed | Developer forks or edits package files directly |
| Sequential execution despite wave structure | Plan agent produces parallel waves | Plan artifact describes parallelism; orchestrator ignores it |
| No cross-run context | Second run on same project | Spec stage starts from scratch, ignores prior sessions |

---

## MUST-HAVES

### 1. Git Worktree Isolation per Pipeline Run

**Source in Stoneforge:** Every worker executes in an auto-created git worktree — `agent/{worker-name}/{task-id}-{slug}`. The main branch stays clean regardless of what workers do.

**The problem it solves:** agenticspiq's build and test stages write directly to the developer's working directory — the same branch they are on. A failed build mid-way leaves the codebase in a partially-modified state. The developer must manually revert or stash changes before trying again. With complex builds that touch many files, this cleanup is error-prone and frustrating.

**Why it fits agenticspiq:** The README already mentions `worktrees/` in the architecture section and lists worktree-based parallel dispatch as a future enhancement. Worktree isolation is valuable independently of parallelism — even a sequential pipeline benefits from keeping `main` clean.

**Implementation sketch:**

The orchestrator creates a worktree before the build stage and tears it down after the finish stage (or on failure):

```js
// In orchestrator.js, before the build stage
const worktreeBranch = `agenticspiq/${Date.now()}`;
const worktreePath = path.join(cfg.stateDir, "worktree");
spawnSync("git", ["worktree", "add", "-b", worktreeBranch, worktreePath], { cwd: workspace });
cfg = { ...cfg, executionRoot: worktreePath };  // build/test agents use this as cwd
```

On success, the finish stage operates against the worktree branch (the feature branch already exists). On failure, the orchestrator runs:

```js
spawnSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: workspace });
spawnSync("git", ["branch", "-D", worktreeBranch], { cwd: workspace });
```

The main branch never sees partial changes. `workspace-config.js` already centralises path resolution — adding `worktreePath` as a key is the right place to store this. Agent runners already accept `cwd` as a parameter (see `claude.js` line: `cwd: workspace`) — this just changes what that value points to for build and test stages.

**Files to change:** `orchestrator/workspace-config.js`, `orchestrator/orchestrator.js`
**Estimated effort:** Half a day

---

### 2. Task Handoff with Context Preservation

**Source in Stoneforge:** When a worker cannot complete a task, it returns the task to the pool with context notes. The next worker picks it up with the existing branch and context intact — it does not start from scratch.

**The problem it solves:** After 3 failures, `retryStage()` in `retry.js` calls `process.exit(1)` and sets `human_required: true`. The developer is left with failure JSON files scattered across `.spiq/artifacts/failures/` and a Claude-generated analysis in `.spiq/artifacts/output/failure.json`. The next run starts the failed stage cold — no awareness of what was attempted, what failed, or what the analysis concluded.

**Why it fits agenticspiq:** The failure analysis infrastructure is already 80% complete. `analyzeFailure()` in `retry.js` already calls Claude to produce structured `{ root_cause, fix_strategy, affected_files, confidence }` JSON. The gap is that this analysis is abandoned on final failure rather than being persisted as a handoff document.

**Implementation sketch:**

On final failure (when `shouldEscalate()` returns true), write a handoff file before exiting:

```js
// In retry.js, inside retryStage(), before process.exit(1)
if (shouldEscalate(task, stage)) {
  const analysis = analyzeFailure(workspace, failure, executeDirect, cfg.outputDir);
  writeHandoff(stage, failure, analysis, cfg);
  task.human_required = true;
  fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
  console.log("🚨 Escalating to human. Handoff saved to .spiq/handoff.md");
  process.exit(1);
}
```

The `writeHandoff()` function generates `.spiq/handoff.md`:

```markdown
# Handoff — build stage

**Date:** 2026-04-28 14:32:11
**Attempts:** 3
**Last error:** agent-cli exited with status 1

## Failure Analysis

**Root cause:** Missing null check in `src/api/users.js` line 47
**Fix strategy:** Add guard clause before accessing `user.profile`
**Affected files:** `src/api/users.js`, `tests/api/users.test.js`
**Confidence:** 0.82

## What Was Attempted

[partial diff or description from the last attempt]

## Next Steps

Re-run `agenticspiq` after addressing the root cause above.
The orchestrator will detect this handoff and inject it as context into the next build attempt.
```

On the next run, `runPipeline()` checks for a handoff file before entering the build stage:

```js
const handoffPath = cfg.handoffFile;
if (fs.existsSync(handoffPath)) {
  const handoff = fs.readFileSync(handoffPath, "utf-8");
  context = { ...context, handoff };
  console.log("📋 Handoff detected — injecting prior failure context into build stage.");
  fs.unlinkSync(handoffPath);  // consume the handoff so it doesn't persist indefinitely
}
```

The build prompt template gets a `{{HANDOFF}}` placeholder that injects this context. The build agent starts aware of what failed and why.

**Files to change:** `orchestrator/retry.js`, `orchestrator/workspace-config.js` (add `handoffFile`), `prompts/build.md` (add `{{HANDOFF}}`), `orchestrator/promptCompiler.js` (add `{{HANDOFF}}` replacement)
**Estimated effort:** Half a day

---

### 3. `agenticspiq doctor` — System Health Check

**Source in Stoneforge:** `sf doctor` checks system health — tool availability, workspace configuration, authentication state.

**The problem it solves:** When something goes wrong, developers spend significant time on manual diagnosis: is the CLI installed? Is it authenticated? Is the `.env` configured correctly? Is `tasks.json` in a valid state? Is the pipeline stuck because the process was killed? There is no single command that answers these questions.

**Why it fits agenticspiq:** This is the highest-value-per-line-of-code improvement available. It requires no changes to the orchestrator and no new dependencies. It is a standalone command that reads existing state.

**What it checks:**

```
agenticspiq --doctor

Checking system health...

CLIs
  ✅  claude        3.2.1
  ✅  opencode      1.4.0
  ✅  gemini        1.1.0

Authentication
  ✅  claude        authenticated (anthropic)
  ⚠️  opencode      OPENCODE_API_KEY not set — will attempt interactive auth at runtime
  ✅  gemini        authenticated (google)

Environment (.env)
  ✅  CLAUDE_MODEL  sonnet
  ✅  OPENCODE_MODEL opencode/qwen3.5-plus
  ✅  GEMINI_MODEL  gemini-2.5-flash-preview
  ✅  FINISH_ACTION pr

Workspace (.spiq/)
  ✅  .spiq/         exists
  ✅  tasks.json     valid JSON
  ✅  req.md         present
  ⚠️  current_stage  "build" — pipeline may be stuck (no process detected)
  ✅  skills/        41 skill files present

Git
  ✅  git            detected
  ✅  branch         main (clean)
  ✅  .spiq/         not in .gitignore ✓

Summary: 1 warning, 0 errors
  ⚠️  Pipeline appears stuck at "build". Run `agenticspiq` to resume or
     `agenticspiq --reset` to clear state and start over.
```

**Implementation sketch:**

```js
// bin/agenticspiq.js — add --doctor flag handling
if (values.doctor) {
  runDoctor(workspace);
  process.exit(0);
}
```

```js
// utils/doctor.js
function checkCli(name, versionFlag = "--version") { ... }
function checkTasksJson(cfg) { ... }
function checkStuckPipeline(cfg) { ... }   // tasks.json has stage != "complete" + no lockfile
function checkGitState(workspace) { ... }
function runDoctor(workspace) { ... }
```

**Files to change:** `bin/agenticspiq.js`, new file `utils/doctor.js`
**Estimated effort:** Half a day

---

### 4. Append-Only JSONL Event Log

**Source in Stoneforge:** Its JSONL storage is the source of truth — append-only, git-tracked, diff-friendly, human-readable. Every state change is recorded.

**The problem it solves:** During a run, there is no unified chronological trace of what happened and when. `tasks.json` is mutated in place. The session vault in `prompt_vault/` captures a good summary at the end, but reconstructs timing from file `mtimeMs` — approximate and fragile. When something breaks mid-run, the developer must piece together what happened from scattered JSON files.

**Why it fits agenticspiq:** This is 20 lines of code added to `orchestrator.js` and the foundation for almost every analytics feature that follows. The session vault in `persist-session.js` already tries to reconstruct stage timing — with an event log, that reconstruction is exact.

**Event format:**

```json
{ "ts": 1714320000000, "event": "pipeline_start", "stage": null }
{ "ts": 1714320001000, "event": "stage_start", "stage": "brainstorm" }
{ "ts": 1714320031000, "event": "stage_complete", "stage": "brainstorm", "durationMs": 30000 }
{ "ts": 1714320031000, "event": "skill_selected", "skills": ["WEB_DEV", "API_DESIGN"] }
{ "ts": 1714320032000, "event": "stage_start", "stage": "spec" }
{ "ts": 1714320089000, "event": "stage_complete", "stage": "spec", "durationMs": 57000 }
{ "ts": 1714320090000, "event": "human_approved", "stage": "spec" }
{ "ts": 1714320091000, "event": "stage_start", "stage": "plan" }
{ "ts": 1714320145000, "event": "stage_complete", "stage": "plan", "durationMs": 54000 }
{ "ts": 1714320146000, "event": "human_approved", "stage": "plan" }
{ "ts": 1714320147000, "event": "stage_start", "stage": "build" }
{ "ts": 1714320247000, "event": "failure", "stage": "build", "attempt": 1, "error": "...", "confidence": 0.82 }
{ "ts": 1714320248000, "event": "retry", "stage": "build", "attempt": 2 }
{ "ts": 1714320398000, "event": "stage_complete", "stage": "build", "durationMs": 151000 }
{ "ts": 1714320399000, "event": "stage_start", "stage": "test" }
{ "ts": 1714320441000, "event": "stage_complete", "stage": "test", "durationMs": 42000 }
{ "ts": 1714320442000, "event": "stage_start", "stage": "review" }
{ "ts": 1714320460000, "event": "review_result", "stage": "review", "verdict": "PASS" }
{ "ts": 1714320461000, "event": "stage_start", "stage": "finish" }
{ "ts": 1714320490000, "event": "stage_complete", "stage": "finish", "durationMs": 29000 }
{ "ts": 1714320490000, "event": "pipeline_complete", "durationMs": 490000 }
```

**Implementation sketch:**

```js
// utils/event-log.js
function appendEvent(cfg, event) {
  const logPath = path.join(cfg.stateDir, "artifacts", "logs", "pipeline.jsonl");
  const line = JSON.stringify({ ts: Date.now(), ...event }) + "\n";
  fs.appendFileSync(logPath, line);
}
module.exports = { appendEvent };
```

In `orchestrator.js`, call `appendEvent()` at every stage transition — start, complete, failure, human approval, review verdict. Each call is one line. The event log accumulates across all runs in the same `.spiq/` workspace; each entry is self-describing.

**Downstream value:**
- **Debugging:** First thing to read when something breaks. Chronological, complete.
- **Session vault:** `persist-session.js` reads the log for exact timestamps instead of `mtimeMs`.
- **Fine-tuning dataset:** The README lists this as a future enhancement — this log is the training signal. Each run generates `{ requirement, spec, plan, selected_skills, failure_history, success }` for analysis.
- **Doctor command:** The stuck-pipeline check (Must-Have #3) reads the log for a `stage_start` without a corresponding `stage_complete`.
- **Token tracking:** Token counts from Claude's JSON output can be written as `stage_tokens` events.

**Files to change:** New file `utils/event-log.js`, `orchestrator/orchestrator.js` (add `appendEvent` calls), `orchestrator/workspace-config.js` (ensure `logs/` path exists)
**Estimated effort:** Two hours

---

## NICE-TO-HAVES

### 5. True Parallel Wave Dispatch

**Source in Stoneforge:** The dispatch daemon detects ready (unblocked, unassigned) tasks and assigns them to idle workers in parallel. Workers execute concurrently in separate worktrees.

**The problem it solves:** The plan agent produces wave-structured tasks with explicit parallelism — tasks in the same wave have no inter-dependency and can execute simultaneously. The `DISPATCHING_PARALLEL_AGENTS.md` skill exists in the skills library. But `orchestrator.js` executes build tasks sequentially. The wave structure is documented but not honoured.

**Why it fits agenticspiq:** The README explicitly flags this: *"True parallel subprocess dispatch (infrastructure for dispatching-parallel-agents skill; currently executes in dependency order but not concurrently)"*. This is the highest-impact performance improvement available. A 6-task plan with 3 waves of 2 parallel tasks each could halve execution time from 90 minutes to 45 minutes.

**Prerequisite:** Must-Have #1 (worktree isolation). Parallel workers cannot share a working directory.

**Implementation sketch:**

After the plan stage, the orchestrator parses the wave structure from `plan.md`:

```js
// utils/wave-parser.js
function parseWaves(planMd) {
  // Parses wave sections from plan.md:
  // Wave 1: [task-1, task-2]
  // Wave 2: [task-3, task-4]
  const waveRegex = /^Wave\s+(\d+):\s*\[([^\]]+)\]/gm;
  const waves = [];
  let match;
  while ((match = waveRegex.exec(planMd)) !== null) {
    waves.push(match[2].split(",").map(t => t.trim()));
  }
  return waves;
}
```

During the build stage, instead of calling `runStage("build")` once, the orchestrator iterates over waves:

```js
// In orchestrator.js, build stage handling
for (const wave of waves) {
  console.log(`▶ Wave ${waveIndex}: running ${wave.length} task(s) in parallel`);
  await Promise.all(wave.map(task => runTaskInWorktree(task, workspace, context, cfg)));
}
```

Each `runTaskInWorktree()` creates a worktree, injects task-specific context (which task from `todo.md`), spawns `agent-cli.js`, waits for completion, and either commits the result or captures a failure. If any task in a wave fails, the wave fails and the pipeline enters the retry/failure-analysis loop for that task.

**Files to change:** New file `utils/wave-parser.js`, `orchestrator/orchestrator.js`
**Estimated effort:** 2–3 days (includes worktree management per task)

---

### 6. Automated CI Polling and Auto-Merge Loop

**Source in Stoneforge:** The merge steward runs tests on the worker's branch, squash-merges on pass, creates a task handoff to a new worker on fail.

**The problem it solves:** After the finish stage creates a PR, the developer must wait for CI to pass and then manually merge. This is the last human-dependent step in what should be a fully autonomous pipeline. agenticspiq approves at spec and plan — the two stages where architectural decisions are locked in. Everything after that should be autonomous, but the CI-wait breaks that.

**Implementation sketch:**

A post-finish polling loop using the `gh` CLI:

```js
// In orchestrator.js, after finish stage
if (process.env.FINISH_ACTION === "pr" && process.env.CI_AUTO_MERGE === "true") {
  await pollCiAndMerge(workspace, cfg);
}

async function pollCiAndMerge(workspace, cfg) {
  const prUrl = readPrUrl(cfg);  // extracted from finish stage output
  const maxWaitMs = parseInt(process.env.CI_TIMEOUT_MS || "1800000");  // 30 min default
  const pollIntervalMs = 30000;  // 30 seconds
  const start = Date.now();

  console.log(`⏳ Polling CI for PR: ${prUrl}`);

  while (Date.now() - start < maxWaitMs) {
    const result = spawnSync("gh", ["pr", "checks", prUrl, "--json", "state"], { encoding: "utf-8" });
    const checks = JSON.parse(result.stdout);
    const allPassed = checks.every(c => c.state === "SUCCESS");
    const anyFailed = checks.some(c => c.state === "FAILURE");

    if (allPassed) {
      spawnSync("gh", ["pr", "merge", prUrl, "--squash", "--delete-branch"]);
      console.log("✅ CI passed — PR merged.");
      appendEvent(cfg, { event: "ci_merged", prUrl });
      return;
    }

    if (anyFailed) {
      console.log("❌ CI failed — re-entering build stage with CI failure context.");
      appendEvent(cfg, { event: "ci_failed", prUrl });
      // inject CI log into context and re-run from build
      context = { ...context, handoff: readCiFailureLog(prUrl) };
      updateCurrentStage("build", cfg);
      return runPipeline(workspace, { resumeFrom: "build", context });
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  console.log("⏰ CI polling timed out — manual merge required.");
}
```

Opt-in via `CI_AUTO_MERGE=true` in `.env`. The feature is invisible unless explicitly enabled, preserving the current behaviour by default.

**Files to change:** `orchestrator/orchestrator.js`, `.env.example`
**Estimated effort:** 1 day

---

### 7. Custom Prompt Overrides per Workspace

**Source in Stoneforge:** `.stoneforge/prompts/` overrides built-in role prompts per project. `director.md`, `worker.md`, `steward-merge.md`, etc.

**The problem it solves:** All prompts in agenticspiq live in the package installation directory. Customising any prompt requires editing the package itself — customisations are lost on upgrade and cannot be project-specific. A Rails team has different conventions than a Python team. Enterprise teams have compliance constraints. Today, every customisation means forking the package.

**Implementation sketch:**

One change to `promptCompiler.js`:

```js
function compilePrompt(stage, context = {}) {
  // Check workspace override first, fall back to package default
  const overridePath = path.join(context.workspace || "", ".agenticspiq", "prompts", `${stage}.md`);
  const defaultPath  = path.join(PROMPTS_DIR, `${stage}.md`);
  const templatePath = fs.existsSync(overridePath) ? overridePath : defaultPath;

  let template = fs.readFileSync(templatePath, "utf-8");
  // ... rest of compilation unchanged
}
```

A workspace-level `.agenticspiq/prompts/build.md` completely overrides the build stage prompt. Teams can also use a partial-override pattern by including `{{DEFAULT_PROMPT}}` in their override, which gets substituted with the package default — enabling extension rather than replacement:

```markdown
# Our Company Build Guidelines

Always use our internal ESLint config at `.eslintrc.company.json`.
Never use `console.log` — use our `logger` utility instead.
All database queries must go through the `QueryBuilder` class, never raw SQL.

---

{{DEFAULT_PROMPT}}
```

Workspace structure:
```
your-project/
└── .agenticspiq/
    └── prompts/
        ├── build.md     ← overrides build stage (optional)
        ├── spec.md      ← overrides spec stage (optional)
        └── plan.md      ← overrides plan stage (optional)
```

**Files to change:** `orchestrator/promptCompiler.js` (add `workspace` to context, check override path)
**Estimated effort:** 2 hours

---

### 8. Workflow Playbooks (Pipeline Modes)

**Source in Stoneforge:** Playbook templates define reusable task sequences with durable state. If a step fails, the workflow resumes from that step.

**The problem it solves:** agenticspiq runs one pipeline: `spec → plan → build → test → review → finish`. This is correct for new feature development but suboptimal for other common task types. A bug fix doesn't need a spec written from scratch. A hotfix needs neither spec nor plan. A refactor needs a modified spec but not a full re-specification. Forcing the full pipeline on every task type adds unnecessary latency and token cost.

**Planned playbooks:**

| Playbook | Stages | Approvals | Use For |
|---|---|---|---|
| `feature` (default) | spec → plan → build → test → review → finish | spec, plan | New feature development |
| `bugfix` | plan → build → test → review → finish | plan | Bug fixes with known root cause |
| `hotfix` | build → test → review → finish | none | Emergency fixes, skip planning |
| `refactor` | spec → plan → build → test → review → finish | spec, plan | Refactoring with spec revision |
| `docs` | spec → finish | spec | Documentation only |

**Implementation sketch:**

Playbooks as JSON in `playbooks/` (built-in) or `.agenticspiq/playbooks/` (workspace-level override):

```json
// playbooks/bugfix.json
{
  "name": "bugfix",
  "description": "For bug fixes — skips spec, starts at plan",
  "stages": ["plan", "build", "test", "review", "finish"],
  "approvals": ["plan"]
}
```

In `orchestrator.js`, the `PIPELINE` constant (currently hardcoded) becomes dynamically constructed from the playbook:

```js
function buildPipeline(playbook) {
  return playbook.stages.map(stage => ({
    stage,
    contextKey: stage === "finish" ? null : stage,
    requiresApproval: playbook.approvals.includes(stage),
    isBrainstorm: stage === "brainstorm",
  }));
}
```

Invoked with:
```bash
agenticspiq --playbook bugfix
agenticspiq --playbook hotfix --workspace /path/to/project
```

The brainstorm stage is automatically included before spec in the `feature` playbook and any playbook that starts with `spec`. It is omitted in `bugfix` and `hotfix` playbooks where no spec is needed.

**Files to change:** `orchestrator/orchestrator.js`, `bin/agenticspiq.js`, new directory `playbooks/`
**Estimated effort:** 1 day

---

## GOOD-TO-HAVES

### 9. Dynamic Model Routing by Complexity

**Source in Stoneforge:** Per-agent provider and per-session provider selection. Better models are assigned to more complex tasks.

**The problem it solves:** Model selection is global via `CLAUDE_MODEL`. A simple CRUD feature runs on the same model as a complex distributed system design. The smarter model is most valuable at spec and plan — the stages where architectural decisions are made. Build and test stages are less sensitive to model quality; they benefit more from speed.

**Why it's ready to implement:** The brainstorm stage introduced in the previous session already produces a `complexity` verdict (`"simple"` or `"complex"`) and stores it in `context.brainstormSkills`. The routing signal already exists in the pipeline — it just isn't used for model selection yet.

**Implementation sketch:**

```js
// In orchestrator.js, getAgentForStage() or executeStage()
function getModelForStage(stage, context) {
  const isComplex = context.complexity === "complex";
  const thinkingStages = ["spec", "plan", "review"];

  if (isComplex && thinkingStages.includes(stage)) {
    return process.env.CLAUDE_MODEL_COMPLEX || "opus";  // stronger model for thinking stages
  }
  return process.env.CLAUDE_MODEL || "sonnet";          // default for all other cases
}
```

The `.env` file gains two new optional variables:

```bash
CLAUDE_MODEL=sonnet           # default for all stages
CLAUDE_MODEL_COMPLEX=opus     # used for spec/plan/review when complexity=complex
```

This is three lines of code once the brainstorm complexity signal is available in context, which it already is.

**Cost impact example:** A complex feature — brainstorm says `complexity: "complex"`. Spec and plan run on `opus` (higher quality, higher cost). Build and test run on `sonnet` (sufficient quality, lower cost). A simple CRUD feature — brainstorm says `complexity: "simple"`. Everything runs on `sonnet`. Teams spend more only when the complexity warrants it.

**Files to change:** `orchestrator/orchestrator.js` (update model selection logic), `.env.example`
**Estimated effort:** 1 hour

---

### 10. Stuck Task Auto-Detection and Recovery

**Source in Stoneforge:** The recovery steward cleans up stuck merges and orphaned tasks automatically.

**The problem it solves:** If a pipeline process is killed (Ctrl+C, OOM kill, laptop closed), `tasks.json` shows `current_stage: "build"` but no process is running. On the next run, the orchestrator detects this and tries to resume — but if the agent was killed before writing its output JSON artifact, the resume attempt reads a missing artifact and fails in a confusing way.

**Prerequisite:** The JSONL event log (Must-Have #4). The stuck detection algorithm checks for a `stage_start` event without a corresponding `stage_complete` — definitive evidence the stage was interrupted mid-execution.

**Implementation sketch:**

In the doctor command (Must-Have #3) and at pipeline startup:

```js
function detectStuckStage(cfg) {
  const logPath = path.join(cfg.stateDir, "artifacts", "logs", "pipeline.jsonl");
  if (!fs.existsSync(logPath)) return null;

  const events = fs.readFileSync(logPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const lastStart    = [...events].reverse().find(e => e.event === "stage_start");
  const lastComplete = [...events].reverse().find(e => e.event === "stage_complete");

  if (!lastStart) return null;
  if (lastComplete && lastComplete.ts > lastStart.ts) return null;

  return lastStart.stage;  // this stage started but never completed
}
```

At startup, if a stuck stage is detected:

```
⚠️  Pipeline appears stuck at "build" — the process may have been killed mid-execution.

Options:
  [r] Retry the build stage from scratch (re-run agent, previous partial output discarded)
  [s] Skip the build stage and continue from test (use if build artifact already exists)
  [q] Quit and investigate manually

Choice [r/s/q]:
```

**Files to change:** `utils/doctor.js` (add stuck detection), `orchestrator/orchestrator.js` (add startup check)
**Estimated effort:** Half a day (after event log is in place)

---

### 11. Token Usage Tracking per Stage

**Source in Stoneforge:** Analytics page shows task throughput, agent efficiency, and queue health over configurable time ranges.

**The problem it solves:** agenticspiq users spend real money per run — a complex build stage with 3 retries can cost $5–15 in API credits. Without per-stage cost visibility, developers cannot optimise their model selection, identify expensive stages, or understand whether using `opus` for spec reduces downstream retries enough to net-save tokens.

**agenticspiq's current state:** `tasks.json` has a `token_budget` field with `total: 200000, used: 0` — explicitly noted in CLAUDE.md as "not actively enforced." The data required to fill this is already available: Claude's `--output-format json` response includes token usage metadata in the JSON output.

**Implementation sketch:**

In `agent-cli/runners/claude.js`, after `spawnSync`:

```js
// Parse token usage from Claude's JSON output before writing to file
const output = JSON.parse(result.stdout.toString());
const usage = output.usage || {};  // { input_tokens, output_tokens, cache_read_tokens, ... }
fs.writeFileSync(outputFile, result.stdout);

// Append token event to JSONL log
appendEvent(cfg, {
  event: "stage_tokens",
  stage,
  input_tokens: usage.input_tokens || 0,
  output_tokens: usage.output_tokens || 0,
  cache_read_tokens: usage.cache_read_input_tokens || 0,
});
```

The session vault (`persist-session.js`) already renders a summary table — adding a token cost column is one additional row per stage once the data exists in the event log.

**Session vault output enhancement:**

```
| Stage     | Duration | Input Tokens | Output Tokens | Cache Hit |
|-----------|----------|--------------|---------------|-----------|
| spec      | 57s      | 12,340       | 3,210         | 43%       |
| plan      | 54s      | 15,890       | 4,100         | 61%       |
| build     | 151s     | 28,440       | 9,830         | 22%       |
| test      | 42s      | 9,200        | 2,100         | 55%       |
| review    | 18s      | 11,100       | 980           | 71%       |
| finish    | 29s      | 8,900        | 1,200         | 68%       |
| TOTAL     | 8m 11s   | 85,870       | 21,420        | 53%       |
```

**Files to change:** `agent-cli/runners/claude.js`, `utils/persist-session.js`
**Estimated effort:** Half a day (after event log is in place)

---

### 12. Knowledge Base from Prior Sessions

**Source in Stoneforge:** Versioned document libraries with FTS5 and semantic search. Agents always have up-to-date project context. Documents survive across sessions and are shared across agents.

**The problem it solves:** When agenticspiq runs a second feature on the same project, the spec stage starts from scratch — it has no awareness of established patterns, technology choices, or architectural decisions from previous runs. The developer's requirements doc may not capture everything that was decided during the previous pipeline.

**agenticspiq's current state:** The session vault (`prompt_vault/`) already saves winning prompts and SPEC.md from every successful run. The infrastructure exists — it just isn't read back at the start of a new run.

**Implementation sketch:**

At the start of the spec stage, search `prompt_vault/` for prior sessions from the same workspace:

```js
// utils/knowledge.js
function findRelevantPriorSpecs(workspace, currentRequest, limit = 3) {
  const vaultDir = path.join(workspace, "prompt_vault");
  if (!fs.existsSync(vaultDir)) return [];

  const entries = fs.readdirSync(vaultDir)
    .filter(f => f.endsWith(".md"))
    .map(f => ({
      file: f,
      content: fs.readFileSync(path.join(vaultDir, f), "utf-8"),
      mtime: fs.statSync(path.join(vaultDir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);   // most recent first

  // Simple overlap scoring — no FTS5 or semantic embeddings required at this scale
  const requestWords = new Set(currentRequest.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  return entries
    .map(e => ({
      ...e,
      score: [...requestWords].filter(w => e.content.toLowerCase().includes(w)).length,
    }))
    .filter(e => e.score > 2)
    .slice(0, limit)
    .map(e => e.content);
}
```

Inject into the spec stage context as `{{PRIOR_CONTEXT}}`:

```markdown
{{PRIOR_CONTEXT}}
<!-- If populated: -->
## Project Context (from prior sessions)

Prior pipeline runs on this workspace established these patterns:
- PostgreSQL as the primary database
- Jest for testing, with fixtures in `tests/fixtures/`
- Express 5.x for HTTP routing
- snake_case for database columns, camelCase for JavaScript

Do not re-open these decisions unless the current requirement explicitly changes them.
```

No SQLite, no FTS5, no semantic embeddings needed. Simple word overlap scoring is sufficient for the scale of a small team's prompt vault. Five prior sessions with three relevant results caps the context injection at a manageable size.

**Files to change:** New file `utils/knowledge.js`, `orchestrator/orchestrator.js` (inject prior context into spec stage), `orchestrator/promptCompiler.js` (add `{{PRIOR_CONTEXT}}` placeholder), `prompts/spec.md` (add `{{PRIOR_CONTEXT}}`)
**Estimated effort:** 1 day

---

## SKIP — Not Applicable

The following Stoneforge features were evaluated and excluded. The rationale is included because the answer to "why not?" is as important as the answer to "why?".

### Web Dashboard (live agent output, kanban, metrics, Monaco editor)

**Why skip:** agenticspiq is intentionally a CLI tool. The approval gates are readline prompts — not a UI paradigm. Adding a web server changes the deployment model (a persistent process must run) and the mental model (a browser must be open). The JSONL event log (Must-Have #4) and the doctor command (Must-Have #3) provide the visibility that matters at agenticspiq's scale. A dashboard would add significant maintenance surface area for features that small teams don't need.

### Event-Sourced SQLite + JSONL Dual Storage

**Why skip:** The dual-storage model is the right architecture for Stoneforge because it must support concurrent web dashboard reads, full-text search, and materialised views — all querying the same data simultaneously. agenticspiq's access pattern is single-process and sequential. A mutated JSON file (`tasks.json`) is the correct data model for a sequential pipeline — the simplicity is a feature, not a compromise. The append-only JSONL event log (Must-Have #4) captures the valuable pattern (immutable history, git-trackable, human-readable) without requiring a SQLite dependency or a sync layer.

### Persistent Multi-Role Agents Running Simultaneously

**Why skip:** Stoneforge's Director + Worker + Steward model requires a persistent process orchestrating multiple concurrent agents. agenticspiq's core design principle is the opposite: the pipeline is stateless between stages. The Controller (Claude) completes before the Executor (OpenCode) begins. Introducing a persistent Director that runs while workers execute would dissolve the thinking/doing separation that makes agenticspiq predictable and debuggable. This is a fundamentally different product, not a feature addition.

### Cross-Agent Messaging Channels

**Why skip:** In agenticspiq, agents communicate through artifacts in `.spiq/` — they do not need to send messages to each other because they run sequentially. The brainstorm stage passes context to spec via `{{BRAINSTORM}}`; the plan stage passes context to build via `{{PLAN}}`. Artifact-mediated communication is more reliable than message passing because it is durable, inspectable, and requires no running message broker. The only inter-agent communication agenticspiq needs is already happening through the file system.

### Agent Pools and Concurrency Limits

**Why skip:** Relevant only for teams running multiple pipelines simultaneously or managing many parallel workers. agenticspiq targets one pipeline per developer session. Even with wave-level parallelism (Nice-to-Have #5), concurrency is scoped to a single run and can be controlled with a `--max-parallel N` flag at invocation. A pool management system solves a coordination problem that does not exist at agenticspiq's scale.

### Multi-Plan Scaling (Multiple Claude MAX Accounts)

**Why skip:** This is a rate-limit workaround for teams burning through Claude MAX quotas by running agents continuously. A single agenticspiq pipeline run is unlikely to hit rate limits. If it does, reducing the model size (`CLAUDE_MODEL=haiku`) or adding retry backoff is the appropriate tool — not multi-account orchestration.

### Docs Steward

**Why skip:** A background agent that continuously scans and corrects documentation accuracy is a maintenance runtime concern. agenticspiq is a one-shot feature pipeline. Documentation updates are handled by the finish stage as part of delivery. A standalone docs steward could be a useful external tool, but adding it to agenticspiq's pipeline would conflate feature delivery with project maintenance.

---

## Priority Roadmap

### Phase 1 — Reliability (immediate, high return, low risk)

These four features eliminate the most common failure modes and require no architectural changes to the core pipeline.

| # | Feature | Effort | Impact |
|---|---|---|---|
| 1 | JSONL event log | 2 hours | Foundation for all analytics; enables exact timing in session vault |
| 2 | `agenticspiq doctor` | Half day | Eliminates diagnostic time; improves onboarding experience |
| 3 | Task handoff with context | Half day | Closes hard-stop at max retries; builds on existing failure analysis |
| 4 | Git worktree isolation | Half day | Eliminates workspace pollution on every failed build |

### Phase 2 — Capability (next, meaningful new features)

These features unlock new workflows and cost optimisations. Phase 1 must be complete first (worktrees are prerequisite for parallel dispatch; event log is prerequisite for stuck detection and token tracking).

| # | Feature | Effort | Impact |
|---|---|---|---|
| 5 | Dynamic model routing | 1 hour | Cost optimisation; signal already exists from brainstorm |
| 6 | Custom prompt overrides | 2 hours | Per-project customisation without forking |
| 7 | Workflow playbooks | 1 day | Right-sizes pipeline for task type (bugfix, hotfix, etc.) |
| 8 | Token usage tracking | Half day | Cost visibility per stage; surfaces model selection trade-offs |
| 9 | Stuck task auto-detection | Half day | Handles killed-process edge cases gracefully |

### Phase 3 — Performance and Intelligence (later, higher investment)

These features require more implementation time and have the right preconditions only after Phase 1 and 2 are stable.

| # | Feature | Effort | Impact |
|---|---|---|---|
| 10 | Parallel wave dispatch | 2–3 days | Halves execution time for multi-task plans |
| 11 | Automated CI merge loop | 1 day | Closes last human-dependent step post-review |
| 12 | Knowledge base from prior sessions | 1 day | Accumulates project context across features |

---

## Implementation Notes

### What agenticspiq Must Not Become

The value of this analysis is as much in what to exclude as what to include. Stoneforge is an excellent system for its target users — teams running many agents in parallel against a continuous backlog. For that use case, the web dashboard, event-sourced storage, and persistent agent roles are not over-engineering; they are requirements.

agenticspiq's target user is different: a developer on a small team who wants to run a well-structured, repeatable pipeline against one feature at a time, with human approval where it matters. For that user, a web server is friction, a SQLite database is a dependency to manage, and a persistent Director is complexity they didn't ask for.

Every feature recommendation above was evaluated against this: *does adding this make agenticspiq more useful to its actual target user, or does it make agenticspiq into a smaller, less polished version of Stoneforge?*

The must-haves and nice-to-haves make agenticspiq more resilient and efficient without changing what it is. The skips preserve what it is.

### Dependency Order

Some features have hard dependencies on others:

```
JSONL event log (Must-Have #4)
    ├── Stuck task detection (Good-to-Have #10)
    └── Token tracking (Good-to-Have #11)

Git worktree isolation (Must-Have #1)
    └── Parallel wave dispatch (Nice-to-Have #5)

Doctor command (Must-Have #3)
    └── Stuck task detection (Good-to-Have #10)

Brainstorm complexity signal (already implemented)
    └── Dynamic model routing (Good-to-Have #9)
```

Implement in dependency order. The event log is the foundation most downstream features build on.

---

*Last updated: 2026-04-28*
*Based on: Stoneforge README at `/Users/kris/code/personal/stoneforge/README.md`*
*Evaluated against: agenticspiq at `/Users/kris/code/personal/multi_agent_model_design/`*
