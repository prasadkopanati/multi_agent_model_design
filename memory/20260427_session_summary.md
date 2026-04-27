# Session Summary — 2026-04-27

## Overview

Two major work streams: (1) root-cause and fix a Gemini CLI 0.39 headless YOLO mode breakage, and (2) a systematic upgrade of the agenticspiq skill system — 6 new skills added, 3 core prompt files rewritten, and 2 infrastructure bugs fixed to make skills actually trigger.

---

## Work Stream 1: Gemini CLI 0.39 Shell Command Fix

### Problem
`run_shell_command` was throwing "Tool execution for 'Shell' requires user confirmation, which is not supported in non-interactive mode" even with `--approval-mode yolo` set, breaking the finish stage of every pipeline run.

### Root Cause (deep)
Gemini CLI 0.39 introduced a shell heuristics layer inside its policy engine. The bundled `yolo.toml` wildcard rule (`toolName = "*"`) matches every tool call — including `run_shell_command` — which means the fast-exit YOLO shortcut (fired only when no rule matches) never fires. After the wildcard rule matches, `applyShellHeuristics()` runs because the rule has no `commandPrefix` or `argsPattern`. That function classifies `rm -rf`, `find -exec`, `sudo`, and others as dangerous and forces `ASK_USER`. In headless non-interactive mode (`-p`), `ASK_USER` throws immediately.

### Fix
Created `policies/yolo-allow-shell.toml` with `commandRegex = ".*"`. Setting `commandRegex` causes the policy compiler to set `argsPattern` on the compiled rule object, which is the exact condition checked by the heuristics gate (`!rule.argsPattern`). Our rule is evaluated first (user-tier priority 4.999 vs bundled 1.998), matches, and returns ALLOW before heuristics run.

Updated `agent-cli/runners/gemini.js` to pass `--policy <path>` on every Gemini invocation.

### Documentation
`docs/gemini-cli-039-shell-confirmation-fix.md` — full guide with priority arithmetic, affected versions, dangerous commands list, alternative approaches, and verification command.

---

## Work Stream 2: Skill System Upgrade

### Why Skills Weren't Triggering

**Bug 1 — `ensureSkills()` early exit** (`utils/scaffold.js`):
```js
// Before (broken)
if (fs.existsSync(dest)) return;   // never syncs new skills to existing workspaces
```
Fixed to an idempotent per-file sync: writes only when file is missing or content differs.

**Bug 2 — `DISPATCHING_PARALLEL_AGENTS` in wrong stage** (`orchestrator/promptCompiler.js`):
Was in the `build` stage (OpenCode), which has no subprocess-spawning capability. Moved to `plan` stage (Claude Code), where wave-grouped parallel task design actually makes sense.

**Bug 3 — TDD not enforced** (`prompts/build.md`):
TDD was listed as step 3 of 9 with no gate. OpenCode could — and did — write all implementation code without a single `test(...)` commit. Fixed by making the TDD gate explicit, named, and structurally mandatory (test commit must precede feat commit, tests must fail before implementation begins).

**Bug 4 — `TEST_DRIVEN` not in `plan` stage**:
TDD ordering must be established at plan time, not just during build. Added `TEST_DRIVEN` and `PLAN_QUALITY_GATE` to the plan stage skill catalog.

### New Skills Written

| File | Stage | Purpose |
|------|-------|---------|
| `PLAN_QUALITY_GATE.md` | plan | 5-gate self-check before plan.md reaches the executor: requirement coverage, scope reduction scan, task completeness, TDD ordering, scope sanity (≤4 tasks) |
| `FAILURE_CONTEXT_CONTINUITY.md` | failure | Structured failure handoff block (root_cause, last_fix_attempt, affected_files, confidence); confidence < 0.7 triggers human escalation |
| `EXECUTION_DISCIPLINE.md` | build | Scope declaration before every build; surgical-changes-only; 300-line diff cap; forbidden patterns (git add -A, speculative code, squashing test commits) |
| `BUILD_HANDOFF_SUMMARY.md` | build/test | Structured end-of-build output block; requires TDD audit field in test stage |
| `SPEC_TRACED_DELIVERY.md` | finish | Requirement trace matrix before PR creation; blocks shipping on missing requirements |
| `PIPELINE_INTEGRITY_CHECK.md` | finish | 7-point workspace health check: clean tree, artifacts present, state consistency, no open failure records, branch state, final test run, review verdict |

### Prompt File Changes

**`prompts/build.md`**:
- TDD gate is now a named mandatory step, not a soft suggestion
- `test(<scope>):` commit must precede `feat(<scope>):` commit per task
- Tests must fail before implementation begins
- BUILD HANDOFF SUMMARY required as the final output

**`prompts/plan.md`** (full rewrite):
- Wave dependency structure: tasks grouped by dependency level, same-wave tasks flagged as parallelizable
- TDD task ordering: plan itself must include `test:` tasks immediately before each non-visual logic task
- Task spec fields enforced: files / action / verify / done
- Plan quality gate check required before saving plan.md

**`prompts/spec.md`**:
- Autonomous Q&A protocol: every clarifying question must be explicitly answered with a reasoned choice when no human is available
- ASSUMPTION REGISTER produced and included in the spec, carrying forward to plan and build stages

### `promptCompiler.js` STAGE_SKILLS Changes

```
plan:    added TEST_DRIVEN, PLAN_QUALITY_GATE, DISPATCHING_PARALLEL_AGENTS
build:   removed DISPATCHING_PARALLEL_AGENTS, added EXECUTION_DISCIPLINE, BUILD_HANDOFF_SUMMARY
test:    added BUILD_HANDOFF_SUMMARY
finish:  added SPEC_TRACED_DELIVERY, PIPELINE_INTEGRITY_CHECK
failure: added FAILURE_CONTEXT_CONTINUITY
```

---

## Files Created or Modified

| File | Type | Change |
|------|------|--------|
| `policies/yolo-allow-shell.toml` | new | Gemini policy fix |
| `docs/gemini-cli-039-shell-confirmation-fix.md` | new | Gemini fix guide |
| `docs/gsd-inspired-skill-recommendations.md` | new | Skill recommendations analysis |
| `agent-cli/runners/gemini.js` | modified | Pass `--policy` flag |
| `orchestrator/promptCompiler.js` | modified | STAGE_SKILLS map updated |
| `utils/scaffold.js` | modified | ensureSkills idempotent sync |
| `prompts/build.md` | modified | Hard TDD gate |
| `prompts/plan.md` | modified | Wave structure + TDD ordering |
| `prompts/spec.md` | modified | Autonomous Q&A protocol |
| `prompts/skills/PLAN_QUALITY_GATE.md` | new | Plan quality gate skill |
| `prompts/skills/FAILURE_CONTEXT_CONTINUITY.md` | new | Failure handoff skill |
| `prompts/skills/EXECUTION_DISCIPLINE.md` | new | Build scope discipline skill |
| `prompts/skills/BUILD_HANDOFF_SUMMARY.md` | new | Build handoff summary skill |
| `prompts/skills/SPEC_TRACED_DELIVERY.md` | new | Spec trace at delivery skill |
| `prompts/skills/PIPELINE_INTEGRITY_CHECK.md` | new | Pipeline integrity gate skill |
