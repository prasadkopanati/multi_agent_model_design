# Requirements Todo

## Feature: --version / -v flag
- [x] `bin/agenticspiq.js` — add `--version` / `-v` handler before existing subcommand guards

## Bug: SELECTED_SKILLS not injected into build/test
- [x] `orchestrator/orchestrator.js` — add plan.md fallback in SELECTED_SKILLS extraction (after `writePlanArtifacts`)

## Feature: AGENT_FIX config
- [x] `.env.example` — add `AGENT_FIX=opencode` after `AGENT_FAILURE=claude`
- [x] `utils/config-test.js` — add `"AGENT_FIX"` to `STAGE_AGENTS` array

## Bug: Finish step not using gh/glab
- [x] `prompts/skills/FINISHING_BRANCH.md` — replace hardcoded `gh pr create` with remote-URL detection (gh vs glab)
- [x] `utils/config-test.js` — add gh and glab CLI availability checks to `checkConfig()`

## Bug: Nested git repo + empty repo guards
- [x] `orchestrator/orchestrator.js` `setupWorktree()` — add nested-repo guard (rev-parse --show-toplevel check)
- [x] `orchestrator/orchestrator.js` `setupWorktree()` — add empty-repo guard (HEAD check before worktree add)

## Feature: Selective pipeline stages (--stages)
- [x] `bin/agenticspiq.js` — parse `--stages`, strip from forwardArgs, set `SPIQ_STAGES` env var
- [x] `bin/agenticspiq.js` — update help text with `--stages` option and examples (also added --help / -h)
- [x] `orchestrator/orchestrator.js` — add `stages: { type: "string" }` to `parseArgs`
- [x] `orchestrator/orchestrator.js` — add `persistSelectedStages(stages, cfg)` helper
- [x] `orchestrator/orchestrator.js` — add `validateStages(stages)` function
- [x] `orchestrator/orchestrator.js` — update `runPipeline` signature to accept `opts = {}`
- [x] `orchestrator/orchestrator.js` — compute `effectivePipeline` at top of `runPipeline`
- [x] `orchestrator/orchestrator.js` — replace all `PIPELINE` references with `effectivePipeline` inside `runPipeline`
- [x] `orchestrator/orchestrator.js` — guard test re-run in fix loop on `selectedStages.includes("test")`
- [x] `orchestrator/orchestrator.js` — thread `stages: values.stages` into `runPipeline` call at entry point
