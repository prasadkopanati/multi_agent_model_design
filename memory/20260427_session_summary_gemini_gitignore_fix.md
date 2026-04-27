# Session Summary — 2026-04-27 (Gemini Finish Stage / Gitignore Fix)

## Problem

The `finish` stage, which runs via Gemini CLI in headless YOLO mode, was failing on every pipeline run in a test workspace (`multi_agent_test_new_skills_qwen36`). Three distinct errors appeared:

```
Error executing tool read_file: File not found.
Error running gemini for stage finish: ENOENT: no such file or directory, open '...finish.json'

Error executing tool activate_skill: params/name must be equal to one of the allowed values
Error executing tool read_file: File path '.../.spiq/skills/FINISHING_BRANCH.md' is ignored by configured ignore patterns.
```

The YOLO shell-confirmation fix documented in `docs/gemini-cli-039-shell-confirmation-fix.md` was already correctly applied and was not the cause.

---

## Root Cause Analysis

### 1. `.spiq/` was gitignored
The executor agent (OpenCode/qwen) creates a `.gitignore` during the build stage as part of project scaffolding (directed by `GIT.md`'s instruction to "have a `.gitignore`"). It added `.spiq/` and `.spiq/tasks.json` to that file, treating `.spiq/` as a framework-internal/build directory. Gemini CLI respects `.gitignore` when using its `read_file` tool, so it could not access `.spiq/skills/FINISHING_BRANCH.md` or any other skill file.

### 2. `activate_skill` called with invalid names
Gemini CLI has a built-in `activate_skill` tool that only accepts a predefined enum of Gemini's own skill names. The compiled prompt's skills catalog listed names like `finishing-a-development-branch`. Gemini tried to call `activate_skill("finishing-a-development-branch")`, which failed immediately. Gemini then fell back to `read_file` — which also failed due to issue #1.

### 3. ENOENT for `finish.json` on first run
Root cause not fully determined from static analysis. Defensive fix applied: ensure the output directory exists before writing.

---

## Fix — 4 Files Changed

### `prompts/skills/GIT.md`
- Added a bullet to "Handling Generated Files": **Never add `.spiq/` to `.gitignore`** — it holds pipeline state that every agent must read and write.
- Added to "Red Flags": `.spiq/` added to `.gitignore` as an explicit named red flag.
- This prevents executor agents from repeating the mistake on future runs.

### `utils/scaffold.js`
- Added `assertSpiqNotIgnored(workspace)` function, called from `scaffold()` after `ensureDirs`.
- Uses `git check-ignore -q .spiq` to evaluate the full ignore chain (handles all forms: literal `.spiq/`, wildcards like `.*`, nested `.gitignore` files, global gitconfig).
- If `.spiq/` is ignored: halts immediately with a clear error message naming the exact file to edit and the lines to remove. Does NOT modify the user's `.gitignore` — that is the user's responsibility.
- Skips the check if `.git/` does not exist yet (pre-init state).

### `orchestrator/promptCompiler.js`
- Updated the skills catalog header to say: "Read the relevant `.spiq/skills/` file using the `read_file` tool. Do not call `activate_skill` — it does not support these skill names."
- This steers Gemini away from its built-in `activate_skill` tool.

### `agent-cli/runners/gemini.js`
- Added `fs.mkdirSync(path.dirname(output), { recursive: true })` before `fs.writeFileSync(output, result.stdout)` as a defensive guard.

---

## Key Design Decisions

- **Halt, don't repair**: The scaffold detects a bad `.gitignore` and stops with a user-facing error rather than silently modifying the file. Modifying a user's `.gitignore` on their behalf is presumptuous and could break workflows where the exclusion was intentional.
- **`git check-ignore` over regex**: The git command evaluates the complete ignore chain. A regex only catches known patterns and would miss wildcards or global gitconfig entries.
- **Source fix over workaround**: The preferred fix is to prevent `.spiq/` from being gitignored rather than inlining skills for Gemini. Inlining was considered but rejected — it treats the symptom and loses the context-optimization benefit for Claude/OpenCode.

---

## Files Modified

| File | Change type |
|------|-------------|
| `prompts/skills/GIT.md` | New rules added |
| `utils/scaffold.js` | New `assertSpiqNotIgnored` function |
| `orchestrator/promptCompiler.js` | Catalog header updated |
| `agent-cli/runners/gemini.js` | Defensive `mkdirSync` added |
