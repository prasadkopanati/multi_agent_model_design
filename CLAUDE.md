# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## System Overview

This is an **agentic coding system** that orchestrates a deterministic, multi-stage workflow using two CLI agents:

| Agent | Model | Role |
|-------|-------|------|
| **Controller** | Claude Code (configurable via `CLAUDE_MODEL`, default `sonnet`) | Spec, plan, review, failure analysis |
| **Executor** | OpenCode (configurable via `OPENCODE_MODEL`, default `opencode/qwen3.5-plus`) | Build, test, fix loops |

### Core Design Principle

> **Separate thinking from doing.** Controller decides. Executor executes. Orchestrator enforces.

---

## Architecture

```
bin/agenticspiq.js
      │
      ├── utils/scaffold.js          ← first-run: creates .spiq/, sources req.md
      │
      └── orchestrator/orchestrator.js
            │
            ├── Claude Code (Controller)
            │     ├── spec   → .spiq/SPEC.md
            │     ├── plan   → .spiq/tasks/plan.md
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
spec → plan → build → test → review
```

Each stage:
- Has a dedicated agent owner
- Produces artifacts in `.spiq/artifacts/`
- Can retry up to 3 times on failure (with Claude-guided failure analysis)
- Escalates to human after max retries exceeded

---

## Key Files & Directories

| Path | Purpose |
|------|--------|
| `bin/agenticspiq.js` | CLI entry point; runs scaffold then spawns orchestrator |
| `utils/scaffold.js` | First-run workspace setup: creates `.spiq/`, sources `req.md` |
| `orchestrator/orchestrator.js` | Main state machine, stage routing, pipeline execution |
| `orchestrator/workspace-config.js` | Single authority for all path resolution (always `.spiq/`-based) |
| `orchestrator/failure.js` | Failure capture and persistence |
| `orchestrator/retry.js` | Retry logic with escalation |
| `orchestrator/promptCompiler.js` | Compiles prompts from templates + skills |
| `agent-cli/agent-cli.js` | CLI dispatcher for agent runners |
| `agent-cli/runners/claude.js` | Claude Code runner (model from `CLAUDE_MODEL`) |
| `agent-cli/runners/opencode.js` | OpenCode runner (model from `OPENCODE_MODEL`) |
| `agent-cli/runners/gemini.js` | Gemini runner (model from `GEMINI_MODEL`) |
| `prompts/*.md` | Stage prompt templates (spec, plan, build, test, review, failure) |
| `prompts/skills/` | Reusable skill modules (SKILLS.md, DEBUGGING.md, GIT.md, etc.) |

## Workspace State (`.spiq/` directory)

All framework state lives in `workspace/.spiq/`. The workspace root is never written to.

```
workspace/.spiq/
├── req.md              ← feature requirements (sourced on first run)
├── SPEC.md             ← written by spec agent
├── tasks.json          ← pipeline state
├── tasks/
│   ├── plan.md         ← written by plan agent
│   └── todo.md
└── artifacts/
    ├── compiled/       ← compiled stage prompts
    ├── output/         ← raw agent JSON output per stage
    ├── failures/       ← persisted failure records
    └── logs/
```

---

## State Management (`.spiq/tasks.json`)

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

---

## Agent Contract

All agents are invoked via `agent-cli/agent-cli.js`:

```bash
node agent-cli/agent-cli.js \
  --agent <claude|opencode|gemini> \
  --stage <stage> \
  --input <absolute-path-to-compiled-prompt> \
  --output <absolute-path-for-json-output> \
  --workspace <path>
```

The `--workspace` flag sets `cwd` for the agent process so it can read and edit the actual source code. Input/output paths always resolve into `.spiq/artifacts/`.

---

## Model Configuration

Models are configured via environment variables in `.env`:

| Env var | Default | Used by |
|---|---|---|
| `CLAUDE_MODEL` | `sonnet` | `agent-cli/runners/claude.js` |
| `OPENCODE_MODEL` | `opencode/qwen3.5-plus` | `agent-cli/runners/opencode.js` |
| `GEMINI_MODEL` | `gemini-2.5-flash-preview` | `agent-cli/runners/gemini.js` |

Override at runtime: `CLAUDE_MODEL=opus agenticspiq`

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

This is injected into the next build attempt as context.

---

## Human-in-the-Loop Triggers

Human intervention is required when:
- Spec or plan stage completes (approval prompt before continuing)
- Repeated failures (> retry_limit for a stage)
- Low confidence (< 0.7) from failure analysis

### Escalation Flow

```
Executor stuck → Orchestrator → Claude (failure analysis) → Human → Resume
```

---

## Design Principles

1. **Strict role separation** — Controller never writes code; Executor never plans
2. **Artifact-driven state** — No hidden memory; everything persisted in `.spiq/`
3. **Constrained execution** — Minimal diffs, explicit fix scopes
4. **Failure-guided iteration** — Learn without fine-tuning

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
