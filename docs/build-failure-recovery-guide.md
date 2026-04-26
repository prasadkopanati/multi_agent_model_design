# Build Failure Recovery Guide

This guide explains what `tasks.json` looks like after a build stage failure, and how to restart the pipeline from the build stage.

---

## How Pipeline State Works

The orchestrator uses `.spiq/tasks.json` as the single source of truth for pipeline state. When a stage starts, `current_stage` is written immediately — so a failure always leaves it pointing at the failed stage. On the next run, the orchestrator reads `current_stage` and resumes automatically from that stage, pre-loading context from all prior completed stages.

---

## Sample tasks.json: Build Failure States

### Scenario A — First build failure (retries still available)

The build stage has failed once. `current_stage` stays at `"build"`. The orchestrator will retry automatically on the next run.

```json
{
  "current_stage": "build",
  "mode": "normal",
  "retry_limit": 3,
  "failure_state": {
    "count": 1,
    "last_stage": "build",
    "last_error": {
      "stage": "build",
      "error": "Error: opencode exited with code 1 — build agent failed to produce output",
      "timestamp": 1745462400000,
      "workspace": "/Users/kris/projects/my-feature"
    },
    "history": [
      {
        "stage": "build",
        "error": "Error: opencode exited with code 1 — build agent failed to produce output",
        "time": 1745462400000
      }
    ]
  },
  "human_required": false,
  "token_budget": {
    "total": 200000,
    "used": 41500
  }
}
```

### Scenario B — Escalated to human (retry_limit exceeded)

After 4 build failures (`> retry_limit` of 3), `shouldEscalate()` returns true, `human_required` is set to `true`, and the process exits. Human intervention is required before re-running.

```json
{
  "current_stage": "build",
  "mode": "normal",
  "retry_limit": 3,
  "failure_state": {
    "count": 4,
    "last_stage": "build",
    "last_error": {
      "stage": "build",
      "error": "Error: TypeScript compilation failed — module 'src/api.ts' not found",
      "timestamp": 1745465200000,
      "workspace": "/Users/kris/projects/my-feature"
    },
    "history": [
      { "stage": "build", "error": "Error: opencode exited with code 1", "time": 1745462400000 },
      { "stage": "build", "error": "Error: Missing dependency 'express'", "time": 1745462900000 },
      { "stage": "build", "error": "Error: TypeScript compilation failed — undefined variable", "time": 1745463500000 },
      { "stage": "build", "error": "Error: TypeScript compilation failed — module 'src/api.ts' not found", "time": 1745465200000 }
    ]
  },
  "human_required": true,
  "token_budget": {
    "total": 200000,
    "used": 98400
  }
}
```

---

## Escalation Threshold

`shouldEscalate()` triggers when `history.filter(h => h.stage === "build").length > retry_limit`.

With the default `retry_limit: 3`, escalation happens on the **4th failure** for the same stage. Clearing `failure_state.history` resets the per-stage counter.

---

## Commands to Restart at the Build Stage

### Case 1: Automatic resume (retries still available)

Just re-run. The orchestrator reads `current_stage: "build"` and resumes automatically, pre-loading spec and plan context from prior artifacts.

```bash
agenticspiq --workspace /path/to/your/project

# Or directly via node:
node bin/agenticspiq.js --workspace /path/to/your/project
```

Console output confirms resume:
```
↩  Resuming from stage: build
```

### Case 2: After escalation (human_required: true)

**Step 1 — Diagnose the failure:**

```bash
cat /path/to/project/.spiq/artifacts/failures/build-*.json
cat /path/to/project/.spiq/artifacts/output/build.json
```

**Step 2 — Fix the underlying issue** (edit source files, update dependencies, patch the plan, etc.)

**Step 3 — Reset the escalation flag in `.spiq/tasks.json`:**

```json
{
  "current_stage": "build",
  "human_required": false,
  "failure_state": {
    "count": 0,
    "last_stage": null,
    "last_error": null,
    "history": []
  }
}
```

**Step 4 — Re-run:**

```bash
agenticspiq --workspace /path/to/your/project
```

### Case 3: Force restart from build (skip re-running spec/plan)

If spec and plan are already complete and you only want to re-run from build onward:

1. Set `current_stage` to `"build"` in `.spiq/tasks.json` (leave `spec.json` and `plan.json` artifacts in place)
2. Run normally — the orchestrator pre-loads spec and plan context, then starts at build:

```bash
agenticspiq --workspace /path/to/your/project
```

---

## Resume Logic (How It Works)

The orchestrator's resume logic in `orchestrator/orchestrator.js`:

```
current_stage = "build"
  → find "build" in PIPELINE (index 2)
  → startIdx = 2
  → pre-load context from spec.json and plan.json (stages 0 and 1)
  → log: "↩  Resuming from stage: build"
  → run build stage with inherited context
```

The full pipeline order is: `spec (0) → plan (1) → build (2) → test (3) → review (4) → finish (5)`.

To resume from a specific stage, set `current_stage` to that stage name and re-run. All prior stage artifacts must be present in `.spiq/artifacts/output/`.

`current_stage` is written at the **start** of each stage (before execution), so a failure always leaves it pointing at the failed stage — making automatic resume work correctly on the next run.

---

## Key Files for Diagnosis

| File | Purpose |
|------|---------|
| `.spiq/tasks.json` | Pipeline state — edit `current_stage` and `human_required` to control resume |
| `.spiq/artifacts/failures/build-{ts}.json` | Full failure record: stage, error string, timestamp, workspace path |
| `.spiq/artifacts/output/build.json` | Last build agent JSON output (may be partial or absent on failure) |
| `.spiq/artifacts/compiled/build.md` | Compiled prompt that was sent to the build agent |
| `.spiq/artifacts/output/spec.json` | Spec context reloaded on resume |
| `.spiq/artifacts/output/plan.json` | Plan context reloaded on resume |
| `.spiq/artifacts/output/review.json` | Review verdict — passed to finish stage as context |
| `.spiq/artifacts/output/finish.json` | Finish stage output — PR URL or delivery status |
