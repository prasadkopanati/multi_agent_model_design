# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Overview

This is an **agentic coding system** that orchestrates a deterministic, multi-stage workflow using two CLI agents:

| Agent | Model | Role |
|-------|-------|------|
| **Controller** | Claude Code (Sonnet 4.5) | Spec, plan, review, failure analysis |
| **Executor** | OpenCode (Qwen3.5-27B) | Build, test, fix loops |

### Core Design Principle

> **Separate thinking from doing.** Controller decides. Executor executes. Orchestrator enforces.

---

## Architecture

```
orchestrator.js
      │
      ├── Claude Code (Controller)
      │     ├── spec
      │     ├── plan
      │     ├── review
      │     └── failure-analysis
      │
      └── OpenCode (Executor)
            ├── build
            ├── test
            └── fix loops
```

### Stage Pipeline

```
/spec → /plan → /build → /test → /review
```

Each stage:
- Has a dedicated agent owner
- Produces artifacts in `artifacts/`
- Can retry up to 3 times on failure
- Escalates to human after max retries exceeded

---

## Key Files & Directories

| Path | Purpose |
|------|--------|
| `orchestrator/orchestrator.js` | Main state machine, stage routing, pipeline execution |
| `orchestrator/failure.js` | Failure capture and persistence |
| `orchestrator/retry.js` | Retry logic with escalation |
| `orchestrator/promptCompiler.js` | Compiles prompts from templates + skills |
| `agent-cli/agent-cli.js` | CLI entry point for agent invocation |
| `prompts/*.md` | Stage prompt templates (spec, plan, build, test, review, failure) |
| `prompts/skills/` | Reusable skill modules (SKILLS.md, DEBUGGING.md, GIT.md, etc.) |
| `tasks.json` | Single source of truth for system state |
| `artifacts/failures/` | Persisted failure records |
| `worktrees/` | Git worktrees for isolated execution per task |

---

## State Management (`tasks.json`)

```json
{
  "current_stage": "spec",
  "mode": "normal",
  "retry_limit": 3,
  "failure_state": {
    "count": 0,
    "last_stage": null,
    "last_error": null,
    "history": []
  },
  "human_required": false,
  "token_budget": {
    "total": 200000,
    "used": 0
  }
}
```

### Mode Behavior

| Feature | Normal | YOLO |
|---------|--------|------|
| Human prompts | yes | no |
| Auto-merge | no | yes |
| Risk tolerance | low | higher |

---

## Agent Contract

All agents are invoked via:

```bash
agent-cli run \
  --stage <stage> \
  --model <model> \
  --input <file> \
  --output <file> \
  --workspace <path>
```

---

## Failure Analysis Loop

The system uses **structured failure analysis** instead of blind retries:

```
failure → analyze (Claude) → structured summary → guided fix
```

### Failure Analysis Output Format

```json
{
  "root_cause": "Missing null check",
  "fix_strategy": "Add guard clause",
  "affected_files": ["src/api.js"],
  "confidence": 0.82
}
```

This is injected into the next `/build` step as context.

---

## Git Integration

### Worktrees for Isolation

```bash
git worktree add worktrees/wt-<id> -b feature/<id>
```

Each task runs in its own worktree to prevent cross-contamination.

### Commit Convention

Commits are made per stage:
```
agent: spec complete
agent: plan complete  
agent: build complete
```

---

## Human-in-the-Loop Triggers

Human intervention is required when:
- Ambiguity detected in spec
- Repeated failures (≥ retry_limit)
- Low confidence (< 0.7) from analysis
- Security-sensitive changes detected

### Escalation Flow

```
Executor stuck → Orchestrator → Claude → Human → Resume
```

---

## Design Principles

1. **Strict role separation** — Controller never writes code; Executor never plans
2. **Artifact-driven state** — No hidden memory; everything persisted
3. **Constrained execution** — Minimal diffs, explicit fix scopes
4. **Failure-guided iteration** — Learn without fine-tuning

---

## Model Strategy

### Controller (Reasoning)
- Primary: Claude Sonnet 4.5
- Fallback: Gemini Pro 3
- Backup: GLM 5.1

### Executor (Implementation)
- Default: Qwen3.5-27B
- Heavy tasks: Kimi K2.5
- Fallback: GLM 5.1

---

## Safety Constraints

- Max diff size: ~300 lines
- File scope restriction: `src/`, `tests/`
- Token budget enforcement per task
- Timeout per stage

---

## Future Enhancements (Not Yet Implemented)

- CI auto-fix loop
- Failure memory dataset for fine-tuning
- Dynamic model routing based on task complexity
- Parallel task execution
