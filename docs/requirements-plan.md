# Requirements Plan — New Features & Bug Fixes

## Context

This plan addresses 5 items from `requirement.md` (2 features, 3 bugs) plus a larger `--stages` selective-pipeline feature. All bugs were reproduced in live runs. The `--stages` feature has a complete implementation spec in `requirement.md`.

**Naming note**: `requirement.md` uses "iramas" in places — the actual binary/codebase uses `agenticspiq` / `.spiq/`. All changes use codebase names.

---

## Item 1 — Feature: `--version` / `-v` flag

**File**: `bin/agenticspiq.js`

Add before the existing `check` / `doctor` / `changemodel` guards at the top of `main()`:

```js
if (rawArgs[0] === "--version" || rawArgs[0] === "-v") {
  const pkg = require("../package.json");
  console.log(pkg.version);
  process.exit(0);
}
```

---

## Item 2 — Bug: SELECTED_SKILLS Not Injected into Build/Test

**File**: `orchestrator/orchestrator.js` (around line 568)

**Root cause**: The plan prompt instructs the agent to write `SELECTED_SKILLS: [...]` into `plan.md` via `write_file`. The orchestrator's `extractSelectedSkills(output)` reads from the agent's *stdout JSON*, not from `plan.md`. If the agent writes the line only to the file (not echoing it in its response text), extraction fails and the warning fires.

**Fix**: After `writePlanArtifacts`, fall back to reading `SELECTED_SKILLS` from `plan.md` if the stdout JSON didn't contain it:

```js
if (stage === "plan") {
  writePlanArtifacts(cfg, output);
  let selectedSkills = extractSelectedSkills(output);
  // Fallback: agent may have written SELECTED_SKILLS only to plan.md
  if (selectedSkills.length === 0 && fs.existsSync(cfg.planFile)) {
    selectedSkills = extractSelectedSkills(fs.readFileSync(cfg.planFile, "utf-8"));
  }
  ...
}
```

---

## Item 3 — Feature: AGENT_FIX Config

**`.env.example`**: Add `AGENT_FIX=opencode` after `AGENT_FAILURE=claude`.

**`utils/config-test.js`**: Add `"AGENT_FIX"` to the `STAGE_AGENTS` array so `agenticspiq check` validates it.

---

## Item 4 — Bug: Finish Step Not Using gh/glab

**`prompts/skills/FINISHING_BRANCH.md`**: Replace hardcoded `gh pr create` in the `pr` action (Step 4) with remote-URL detection:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -q "github.com"; then
  gh pr create --title "..." --body "..." --base main
elif echo "$REMOTE_URL" | grep -q "gitlab.com\|gitlab\."; then
  glab mr create --title "..." --description "..." --target-branch main --yes
else
  echo "⚠  Unknown remote host — push succeeded but MR/PR must be created manually."
fi
```

**`utils/config-test.js`**: Add `gh` and `glab` CLI availability checks to `checkConfig()`.

---

## Item 5 — Bug: Nested Git Repo + Empty Repo Guards

**File**: `orchestrator/orchestrator.js` — `setupWorktree()` (line 175)

Add two guards after the initial `gitCheck` passes:

**Guard A — nested repo** (workspace git root differs from workspace path):
```js
const topLevel = spawnSync("git", ["-C", workspace, "rev-parse", "--show-toplevel"],
  { stdio: "pipe", encoding: "utf-8" }).stdout.trim();
if (topLevel && path.resolve(topLevel) !== path.resolve(workspace)) {
  console.warn(`⚠  Workspace is nested inside a parent git repo (${topLevel}).`);
  console.warn(`   Commits will go to the parent repo, not ${workspace}.`);
  console.warn(`   Run agenticspiq from the repo root, or initialize a separate .git in ${workspace}.`);
  return null;
}
```

**Guard B — empty repo** (before `git worktree add`, after stale-worktree cleanup):
```js
const headCheck = spawnSync("git", ["-C", workspace, "rev-parse", "HEAD"], { stdio: "pipe" });
if (headCheck.status !== 0) {
  console.warn("⚠  Workspace git repo has no commits — worktree isolation requires at least one commit.");
  console.warn("   Run: git commit --allow-empty -m 'init'  in the workspace, then re-run agenticspiq.");
  return null;
}
```

---

## Item 6 — Feature: Selective Pipeline Stages (`--stages`)

### `bin/agenticspiq.js`
- Parse `--stages <comma-list>` from `rawArgs`
- Strip `--stages` and its value from `forwardArgs`
- Set `process.env.SPIQ_STAGES = stagesValue` before spawning the orchestrator
- Add help text with `--stages` option and usage examples

### `orchestrator/orchestrator.js`
- `parseArgs`: add `stages: { type: "string" }` option
- New `persistSelectedStages(stages, cfg)`: writes `selected_stages` array to `tasks.json`
- New `validateStages(stages)`:
  - Error if `spec` or `plan` missing
  - Error if `finish` present but not last
  - Warning if `build` present without `review`
  - Warning if `review` present without `test`
- `runPipeline(workspace, opts = {})`: add `opts` parameter
- Compute `effectivePipeline` at top of `runPipeline`:
  - Check `tasks.json` for persisted `selected_stages` (resume path)
  - Else parse `opts.stages` or `process.env.SPIQ_STAGES`
  - Else use full `PIPELINE`
  - Validate, persist, then filter: `effectivePipeline = PIPELINE.filter(p => selected.includes(p.stage))`
- Replace all `PIPELINE` references inside `runPipeline` with `effectivePipeline`
- Fix loop guard: wrap test re-run in `if (selectedStages.includes("test")) { ... }`
- Entry point: thread `stages: values.stages` into `runPipeline` call

---

## Files Modified

| File | Changes |
|------|---------|
| `bin/agenticspiq.js` | `--version`/`-v` flag; `--stages` parse + env set; help text |
| `orchestrator/orchestrator.js` | SELECTED_SKILLS fallback; nested/empty repo guards; `--stages` full implementation |
| `.env.example` | Add `AGENT_FIX=opencode` |
| `utils/config-test.js` | Add `AGENT_FIX` to STAGE_AGENTS; add gh/glab CLI checks |
| `prompts/skills/FINISHING_BRANCH.md` | Remote-URL detection for gh vs glab in `pr` action |

---

## Verification

- `agenticspiq --version` prints `1.0.0` and exits 0
- `agenticspiq -v` same
- `agenticspiq check` reports AGENT_FIX status + gh/glab availability
- Nested-repo workspace: `setupWorktree` warns and returns null
- Empty-repo workspace: warns and returns null
- After plan stage: SELECTED_SKILLS injected even when agent wrote to plan.md only
- `agenticspiq run --stages spec,plan,finish` runs exactly 3 stages
- `agenticspiq run` (no flag) runs all 8 stages unchanged
- Resume after interrupt reads `selected_stages` from `tasks.json`
- Missing `spec` → error; `finish` not last → error
- GitLab remote: finish uses `glab mr create`; GitHub: `gh pr create`
