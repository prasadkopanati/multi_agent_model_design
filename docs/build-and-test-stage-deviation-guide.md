# Build, Test, Fix, and Finish Stage Deviation Guide

> Created: 2026-04-30 — based on live agent output analysis across a full build → test pipeline run
> Updated: 2026-04-30 — extended with fix and finish stage deviations from two review-FAIL retry sessions

This guide documents every systematic deviation observed across the full pipeline — build, test, fix, review retry, and finish stages. Each issue is traced to its root cause in a prompt or runtime configuration, the fix applied is shown, and any remaining gaps are recorded as future improvements.

The guide is split by severity across all stages:

- [Build Stage Issues](#build-stage-issues) — what the agent did wrong, why, and what changed
- [Test Stage Issues](#test-stage-issues) — summary with links to the deeper dedicated guide
- [Fix Stage Issues](#fix-stage-issues) — deviations observed during the review-FAIL → fix retry loop
- [Finish Stage Issues](#finish-stage-issues) — Gemini-specific failures in the delivery stage
- [Fixes Summary](#fixes-summary) — all files changed and what each change addresses
- [Verification Checklist](#verification-checklist) — how to confirm fixes are working in a new run
- [Future Improvements](#future-improvements) — remaining gaps not yet addressed in code

---

## Build Stage Issues

### CRITICAL

---

#### C1 — EXECUTION SCOPE block never produced

**Severity:** Critical — agent writes files with no declared scope, making it impossible to audit whether changes are in-scope or detect scope creep early.

**What was observed:**

The build agent read `EXECUTION_DISCIPLINE.md` as its first action, then immediately began reading other files and running `npm install`, `mkdir`, and `git log` commands. No EXECUTION SCOPE block was ever output.

**Root cause:**

`prompts/build.md` said:

```
Before writing any code, read `.spiq/skills/EXECUTION_DISCIPLINE.md` and declare your execution scope.
```

The EXECUTION SCOPE template (the block the agent is supposed to print) lived only inside the skill file. The agent read the skill, retained the concept mentally, but never produced the required output. "Read and declare" is too abstract — the agent treated reading as sufficient.

**Fix applied — `prompts/build.md`:**

The EXECUTION SCOPE template is now inlined directly in the build prompt, placed immediately after the reference to EXECUTION_DISCIPLINE.md:

```markdown
Before writing any code, read `.spiq/skills/EXECUTION_DISCIPLINE.md` and output this block:

\```
EXECUTION SCOPE

Task:            [one sentence — what this build is implementing]
Files to CREATE: [list, or "none"]
Files to MODIFY: [list, or "none"]
Files to DELETE: [list, or "none"]
Files OFF-LIMITS: [everything not listed above — do not touch]
Max diff lines:  ~300
\```

Do not write a single line of code until this block is output.
```

The agent cannot miss or skip the block because the template is in the main instruction stream, not in a skill it might read-and-internalize without printing.

---

#### C2 — Duplicate commit confusion loop

**Severity:** Critical — wastes model requests and traps the agent in the RED phase instead of transitioning to implementation.

**What was observed:**

```
$ git add src/utils/budget.test.ts && git commit -m "test(utils): ..."
→ commit succeeds

$ npm test → 5 tests fail (expected RED)

$ git add src/utils/budget.test.ts && git commit -m "test(utils): ..."
→ "nothing added to commit but untracked files present"

$ npm test → same 5 failures
```

The agent attempted to re-commit already-committed test files, received a no-op git error, re-ran tests that produced identical output, and only then moved to implementation. Two wasted model requests.

**Root cause:**

`prompts/build.md` did not have an explicit transition signal. After confirming tests fail, there was no instruction saying "the RED gate is now met — stop re-running and move to step 4." The agent was stuck in an implicit loop with no exit condition.

**Fix applied — `prompts/build.md`:**

An explicit transition added after the test-run instruction in step 3:

```markdown
- **Once tests are confirmed failing, the RED gate is met. Do NOT re-commit the test files.
  Move immediately to step 4 — implementation. The loop is complete.**
```

The `Do NOT re-commit` clause directly addresses the observed failure mode.

---

#### C3 — TDD gate skipped for second task group (clients and sources)

**Severity:** Critical — 8 implementation files written with zero tests; final test run reports `5 passed (5)` — exactly the pre-existing count, giving zero signal about new code.

**What was observed:**

After the utils task completed (with TDD), the agent moved directly to writing 8 implementation files:

```
← Write src/clients/apify.ts       ← no preceding test(clients/apify): commit
← Write src/clients/tavily.ts      ← no preceding test(clients/tavily): commit
← Write src/clients/firecrawl.ts   ← no preceding test(clients/firecrawl): commit
← Write src/sources/upwork.ts      ← no preceding test(sources/upwork): commit
...

$ npm test → 5 passed (5)   ← same as before these 8 files were written
```

**Root cause:**

`prompts/build.md` described the flow as a linear numbered list. The TDD gate appeared once in that list. The agent interpreted the cycle as a one-time setup for the first task, not a gate that re-applies to every subsequent task.

**Fix applied — `prompts/build.md`:**

The flow is now framed as an explicit loop with a "return to step 1" instruction:

```markdown
**Repeat the following cycle for EVERY task in the plan. The TDD gate applies to every
task without exception — not just the first.**

For each task:
  1. Read the task's acceptance criteria
  2. Load context
  [TDD GATE — MANDATORY PER TASK — DO NOT SKIP OR REORDER]
  3. Write failing tests → commit → confirm RED
  4. Implement minimum code → commit → confirm GREEN
  5. Full test suite — no regressions
  6. Mark task complete. Return to step 1 for the next task.
```

"Return to step 1 for the next task" and "MANDATORY PER TASK" make the loop structure unambiguous.

---

#### C4 — Build stage handed off with 12 uncommitted files

**Severity:** Critical — test stage runs against code that differs from what is committed; corrupts the test → review audit trail.

**What was observed at the start of the test stage:**

```
$ git status --short
M  src/clients/apify.ts          ← staged, not committed
 M src/clients/firecrawl.ts      ← unstaged changes
 M src/pipeline/rank.test.ts     ← TEST FILE modified after its commit
M  src/pipeline/rank.ts          ← staged, not committed
 M tsconfig.json                 ← modified but not committed
?? .spiq
```

Twelve files had uncommitted changes — both staged and unstaged. Critically, `rank.test.ts` was modified _after_ its commit (` M` = unstaged working-tree changes), meaning the committed test and the file on disk were different. `tsconfig.json` was also modified but never committed.

**Root cause:**

`prompts/build.md` had no "verify clean git state" step before writing the handoff. The agent produced the BUILD HANDOFF SUMMARY and wrote `.spiq/handoff.md` while the working tree was dirty.

**Fix applied — `prompts/build.md`:**

A mandatory pre-handoff gate added as the last step before `BUILD HANDOFF SUMMARY`:

```markdown
**Pre-handoff git check — required before writing the handoff summary:**

$ git status --short

If any files appear (M, ??, A, D) that are not `.spiq`:
- Stage and commit any remaining implementation: `git add <files> && git commit -m "..."`
- Restore any out-of-scope modifications: `git checkout -- <file>`
- Only untracked `.spiq` entries are acceptable — those are pipeline state, not code.

A dirty working tree at handoff means the test stage will run against uncommitted code.
This corrupts the test → review audit trail.

Once the working tree is clean, produce a BUILD HANDOFF SUMMARY and write it to
`.spiq/handoff.md`.
```

---

#### C5 — Build stage exhausted 90% of context window; test stage started with reasoning-budget=0

**Severity:** Critical — test stage inherits near-full context and generates with zero thinking tokens.

**What was observed in llama.cpp inference logs at the start of the test stage:**

```
Requests    Processed    Generated    Tokens/Sec
120         120,346      32,787       11.52

slot update_slots: id  0 | task 33103 | n_past = 118225
slot update_slots: id  0 | task 33103 | prompt processing done, n_tokens = 118461, batch.n_tokens = 232
reasoning-budget: activated, budget=0 tokens
reasoning-budget: budget=0, forcing immediately
```

The build stage ran for 120 requests accumulating 118,461 tokens — 90.4% of the 131,072-token context window. OpenCode reuses the same server-side session across stages. The test stage prompt (compiled test.md, ~6K tokens) was appended to this history and the model was given 232 new tokens of room. `reasoning-budget: budget=0, forcing immediately` means the model had zero thinking tokens and had to generate its first response with no deliberation.

**Root cause (two contributing factors):**

1. `agent-cli/runners/opencode.js` had `compaction.reserved = 5000`. This means compaction triggers only when fewer than 5,000 tokens remain (at 126K used, 96% capacity). By then, quality is already severely degraded; compaction at this point cannot recover the session for the subsequent stage.

2. `prompts/build.md` had no instruction for the agent to monitor session length or proactively compact.

**Fix applied — `agent-cli/runners/opencode.js`:**

```js
const OPENCODE_CONFIG = JSON.stringify({
  compaction: {
    auto: true,
    prune: true,
    reserved: 25000,  // trigger compaction at ~81% of 131K window, not ~96%
  },
});
```

This triggers compaction at ~106K tokens used (81% capacity), preserving ~25K tokens for the remaining stage work and the subsequent stage start.

**Fix applied — `prompts/build.md`:**

```markdown
**Session length guard:** If you have submitted more than 80 model requests in this
session, run `/compact` before continuing. A build that accumulates 100+ requests
leaves the test stage with near-zero context and reasoning budget.
```

---

### HIGH

---

#### H1 — EXECUTION CHECK never produced after any commit

**Severity:** High — no per-commit scope audit; drift into out-of-scope changes goes undetected.

**What was observed:** Two commits made (scaffold, test files) with no EXECUTION CHECK block after either one.

**Root cause:** EXECUTION CHECK is defined only in `EXECUTION_DISCIPLINE.md`. The build.md commit steps say "commit the implementation" but never say "then run EXECUTION CHECK."

**Fix applied — `prompts/build.md`:**

EXECUTION CHECK block inlined after both the test commit (step 3) and the implementation commit (step 4):

```markdown
After committing, run this check before the next action:
\```
EXECUTION CHECK
  Files changed this commit: [list]
  All in declared scope?     [yes / no — if no, STOP and explain]
  Diff lines this commit:    [count]
  Single concern?            [yes / no — if no, split the commit]
  Tests updated/added?       [yes / no]
\```
```

---

#### H2 — `Co-Authored-By` trailer missing from every commit

**Severity:** High — breaks attribution; the commit log shows the OpenCode runner's environment identity but not the model's co-author line.

**What was observed:**

```
[spiq/run-... 092dcc4] chore(scaffold): initialize project scaffold...
 Author: OpenCode Agent <opencode-agent@agenticspiq.local>
 # No Co-Authored-By trailer
```

**Root cause:** `GIT.md` marks it as mandatory, but build.md commit examples did not include it. The agent follows examples, not skill files it read earlier.

**Fix applied — `prompts/build.md`:**

Every commit example now includes the trailer:

```markdown
git commit -m "test(<scope>): <description of what is being tested>

Co-Authored-By: OpenCode Agent <opencode-agent@agenticspiq.local>"
```

---

#### H3 — RED gate met via module resolution error, not assertion failure

**Severity:** High — the agent cannot tell if the test cases themselves are correct; wrong tests would pass the RED gate.

**What was observed:**

```
FAIL src/utils/checkpoint.test.ts
Error: Failed to load url ./checkpoint ... Does the file exist?
Tests: no tests   ← zero assertions ran
```

The module didn't exist yet, so the test file threw an import error before any assertion ran. The RED gate was technically met (tests failed) but no assertion was ever executed or verified.

**Root cause:** The TDD instructions did not distinguish between "test runner error" and "assertion failure." A test file that imports a non-existent module always fails with an import error, regardless of whether the assertions inside it are correct.

**Fix applied — `prompts/build.md`:**

Clarification added to the RED gate check in step 3:

```markdown
- Tests MUST fail at this point. If they fail due to module resolution (file does not
  exist), the RED gate is met — the module simply doesn't exist yet. Move to step 4.
- If tests pass before any implementation: your tests do not cover new behavior —
  rewrite them.
```

This explicitly names module-resolution failure as an acceptable RED state, preventing the agent from treating it as an error condition that needs to be "fixed" before proceeding.

---

#### H4 — `git diff --staged` pre-commit check never run

**Severity:** High — agent may commit unexpected files without realizing it; no audit trail before commit.

**What was observed:** Both commits used `git add [files] && git commit` without a preceding `git diff --staged`.

**Root cause:** `GIT.md` requires a staged-diff check before every commit, but build.md commit steps did not include it. The agent follows what's in the main prompt.

**Fix applied — `prompts/build.md`:**

Added to both the test commit and implementation commit steps:

```markdown
- Run `git diff --staged 2>&1 | tail -50` to confirm what you are staging before
  running git commit.
```

---

### MEDIUM

---

#### M1 — All implementation files written in one batch, not per-module increments

**Severity:** Medium — if a mid-batch module has a type error, all subsequent modules may be built on a broken foundation before the error is caught.

**What was observed:** The agent wrote `src/types/index.ts`, `budget.ts`, `date.ts`, `fuzzy.ts`, `checkpoint.ts`, and `markdown.ts` in sequence without running `npm test` between any of them, and committed all 6 in one shot.

**Root cause:** build.md step 4 said "implement the minimum code to make the failing tests pass" (singular, unqualified). The agent interpreted this as one implementation pass for all modules.

**Fix applied — `prompts/build.md`:**

Step 4 now explicitly names the per-module cycle:

```markdown
4. Implement the minimum code to make the failing tests pass — one module at a time:
   - Implement the minimum code for one module
   - Run `npm test 2>&1 | tail -50` — that module's tests must now pass
   - Run `git diff --staged 2>&1 | tail -50` to confirm what you are staging
   - Commit the implementation:
     git commit -m "feat(<scope>): <description>\n\nCo-Authored-By: ..."
   - Run EXECUTION CHECK
   - Move to the next module. Do not batch multiple modules into one commit.
```

---

#### M2 — LSP errors silently accumulated across 5 files

**Severity:** Medium — a reader of the build log cannot tell if the agent was aware of the errors or confused by them.

**What was observed:** After writing `budget.test.ts` (LSP: "Cannot find module './budget'"), the agent wrote four more test files — accumulating 5 LSP errors — without acknowledging them. The errors were expected (modules don't exist during the RED phase) but the silence makes the log unauditable.

**Root cause:** No instruction to acknowledge expected LSP errors as intentional during the RED phase.

**Not directly fixed in build.md** — this is an audit/observability concern rather than a correctness problem. The errors self-resolved once implementation was written. The M1 fix (per-module commits with intermediate `npm test`) partially addresses this because errors surface at compile time per module rather than silently across a batch.

---

#### M3 — Wrong library export name used (fastest-levenshtein)

**Severity:** Medium — self-corrected but required two extra edit passes; wastes model requests.

**What was observed:**

```
LSP: '"fastest-levenshtein"' has no exported member named 'getDistance'. Did you mean 'distance'?
```

**Root cause:** The agent wrote code using `getDistance` without checking the library's type definitions first.

**Fix applied — `prompts/build.md`:**

Step 2 (load relevant context) now includes:

```markdown
- Check installed package type definitions first:
  `ls node_modules/<pkg>/dist/*.d.ts` and read the `.d.ts` file before reaching for
  a web search. The answer is almost always in the local type definitions.
```

---

#### M4 — `.js` extensions on relative imports in a CommonJS project

**Severity:** Medium — breaks `ts-node` runtime execution for every application file; the agent loses the ability to smoke-test.

**What was observed:**

```
$ npx ts-node src/index.ts status
... code: 'MODULE_NOT_FOUND' ...
```

The agent wrote all source files using ESM-style explicit `.js` extensions:

```typescript
import { BudgetTracker } from './utils/budget.js';  // ← wrong for CJS
```

In a CommonJS project (`"module": "CommonJS"` in tsconfig, `"type": "commonjs"` in package.json), `ts-node` compiles TypeScript to `require('./utils/budget.js')`. Node then looks for a literal file named `budget.js` in the source tree — which doesn't exist (only `budget.ts` exists). This pattern is only correct in ESM projects (`"type": "module"`, `"module": "node16"/"nodenext"`).

**Fix applied — `prompts/build.md`:**

A module-system detection step added immediately after `npm install`:

```markdown
After `npm install`, determine the project's module system before writing any imports:

$ cat tsconfig.json | grep '"module"'
$ cat package.json | grep '"type"'

- If `module` is "CommonJS" (or absent) AND `type` is "commonjs" (or absent):
  → CJS project. Use bare relative imports: `import { Foo } from './utils/foo'`
    (no `.js` extension).
  → Do NOT use `ts-node` to run app files — use `npm test` and `npm run typecheck` only.
- If `module` is "node16" / "nodenext" / "ESNext" OR `type` is "module":
  → ESM project. Use explicit `.js` extensions: `import { Foo } from './utils/foo.js'`.
```

---

#### M5 — No `testTimeout` in vitest config causes 120-second pipeline hangs

**Severity:** Medium — one unmocked HTTP call hangs the entire test pipeline for 120 seconds with no useful error.

**What was observed:**

```
$ npm test 2>&1 | tail -15
<bash_metadata>
bash tool terminated command after exceeding timeout 120000 ms.
```

The `vitest.config.ts` created during scaffold had no `testTimeout`:

```typescript
export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.test.ts'],
    // ← no testTimeout
  },
});
```

When any test makes a real HTTP call or has an unresolved Promise, Vitest waits indefinitely. The pipeline's 120-second bash timeout is the only terminator — at enormous token cost and with no useful error message.

**Fix applied — `prompts/build.md`:**

```markdown
When creating or modifying `vitest.config.ts`, always include:

\```typescript
testTimeout: 10000,  // 10-second hard limit per test — hanging tests mean real HTTP calls
\```

HTTP client modules (anything calling `fetch()`, `axios()`, or a third-party SDK) **MUST**
be mocked in unit tests using `vi.mock()`. Real API calls from tests will hang indefinitely
without credentials and block the pipeline.
```

---

### LOW

---

#### L1 — Redundant git status/log calls

`git log --oneline -20` + `git status --short` run, then immediately repeated. ~1 extra model request wasted.

---

#### L2 — `tail` argument inconsistent with build.md

build.md says `2>&1 | tail -50`. Agent used `tail -20` on the first run, `tail -30` on subsequent runs. Minor — no functional impact.

---

#### L3 — npm audit vulnerabilities not addressed

`npm install` reported "5 moderate severity vulnerabilities." Ignored. Minor for dev context.

---

#### L4 — External web search used before reading local type definitions

**What was observed:**

```
⚙ firecrawl_firecrawl_search {"query":"@tavily/core TypeScript SDK constructor..."}
⚙ firecrawl_firecrawl_search {"query":"apify-client TypeScript actor call method..."}
→ Read node_modules/@tavily/core/dist/index.d.ts   ← answer was here all along
```

Three Firecrawl API calls used to look up SDK signatures that were fully available in local `node_modules/` type definitions. The M3 fix (check installed `.d.ts` before web search) addresses this.

---

#### L5 — Duplicate `ls node_modules` calls

`ls node_modules/@tavily/core/dist/` and `ls node_modules/apify-client/dist/` each run twice in immediate succession. Four calls where two were needed.

---

#### L6 — Redundant double `npm test` + `npm run typecheck` runs

After writing clients and sources, both commands run twice consecutively with no code changes between runs. ~10 seconds of wall time and two model requests wasted.

---

## Test Stage Issues

The test stage deviations are documented in detail in the dedicated guide:

**[`docs/test-stage-missing-context-guide.md`](test-stage-missing-context-guide.md)**

Brief summary of the seven issues and their status:

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Test prompt had zero project context — model explored workspace from scratch | Critical | Fixed — `{{HANDOFF}}` + "Start here" added to `prompts/test.md` |
| 2 | Handoff not loaded for test stage in orchestrator | Critical | Fixed — extended handoff injection to `test` stage in `orchestrator.js` |
| 3 | Context budget rules appeared after `{{SKILLS}}` — too late to prevent eager reads | High | Fixed — budget rules moved before `{{SKILLS}}` in `prompts/test.md` |
| 4 | `WIP_CHECKPOINT.md` in test base skills — irrelevant noise | Medium | Fixed — removed from `promptCompiler.js` test skill list |
| 5 | Qwen3.5 SWA KV cache invalidation — full prompt re-processing at every turn | Architecture | Partially mitigated — smaller initial context reduces frequency; model-level issue |
| 6 | Handoff file never written to disk — `{{HANDOFF}}` always empty | Critical | Fixed — `writeHandoffArtifact()` added to orchestrator post-build; skill updated to require direct `write_file` |
| 7 | 26,613 token initial context — test stage starts near SWA checkpoint boundary | Architecture | Documented — ~20K is unavoidable OpenCode overhead; see Future Improvements |
| T1 | Test stage ran tests on uncommitted code without detecting it — no git status check | High | Fixed — Uncommitted-Changes Gate added to `prompts/test.md`; blocks handoff summary if working tree is dirty |

### Why these issues compound

Issues 1, 2, and 6 form a cascade: the handoff skill told the agent to produce a summary (1), but nothing in the orchestrator wrote it to disk (6), so the test stage injector had nothing to inject (2). The fix required changes in all three places simultaneously.

Issues 5 and 7 are hardware/model-architecture constraints rather than prompt engineering gaps. Fixes 1–4 reduce the _rate_ at which context grows (fewer redundant reads), but cannot eliminate the underlying SWA cache miss on a Qwen3.5/llama.cpp deployment.

---

## Fix Stage Issues

> Source: session_1.md and session_2.md — two consecutive Review FAIL → fix → test → review retry cycles

### CRITICAL

---

#### F1 — Fix stage attempt 1 made zero commits

**Severity:** Critical — test stage ran against entirely uncommitted code; audit trail is broken.

**What was observed:**

The fix agent (OpenCode / Qwen3.5) edited 7+ files (`checkpoint.ts`, `scrape.ts`, `discover.ts`, `fuzzy.ts`, `rank.ts`, `rank.test.ts`, `scrape.test.ts`), ran the full test suite (49 tests pass), ran `npx tsc --noEmit` (clean), and then exited without calling `git add` or `git commit` once. The test stage that followed saw 15 modified files — a mix of staged and unstaged changes — with no new commit in the git log.

**Root cause:**

`prompts/fix.md` Step 2 item 5 read:

```
5. Commit each logical fix:
   `fix(<scope>): <what was wrong and what was changed>`
```

This instruction is ambiguous in two ways: "each logical fix" implies per-fix commits (which the agent then skipped when all fixes were applied at once), and there is no `git add` command specified. The agent applied all fixes in one pass, never received an explicit "now run `git add -A && git commit`" instruction, and exited.

**Fix applied — `prompts/fix.md`:**

Step 2 item 5 replaced with a mandatory end-of-fix commit block:

```markdown
After ALL fixes are applied and the full test suite is green, stage and commit everything in one shot:
\```bash
git add -A
git status --short          # verify the staged set is correct before committing
git commit -m "fix(<scope>): <summary of all issues resolved>"
git log --oneline -3        # confirm the commit appears in the log
\```

Do NOT commit file-by-file or use selective `git add <path>`. Using `git add -A` ensures no changed file is left unstaged.
```

`git add -A` (not selective staging) is required so that every modified tracked file — including files the agent touched indirectly — is included.

---

#### F2 — Fix stage attempt 2 committed partially — 7 files left uncommitted

**Severity:** Critical — the committed state diverged from what the review was evaluating; delivery would miss changes.

**What was observed:**

The second fix attempt committed `804886e` with the message "fix: resolve code review issues — firecrawl success check, fuzzy threshold normalization, budget throw on overdraft, rank Set dedup + double-count fix, tavily spread order, redundant budget assert, unused param, test isolation." But `git status` after the commit still showed 7 files modified and unstaged:

```
 M src/clients/apify.ts
 M src/pipeline/output.ts
 M src/pipeline/rank.test.ts
 M src/pipeline/scrape.test.ts
 M src/utils/checkpoint.ts
 M src/utils/markdown.ts
 M tsconfig.json
```

These were uncommitted edits from **fix attempt 1** (F1) that were never cleaned up. When attempt 2 committed, it selectively staged only its own new changes and left the accumulated dirty state from attempt 1 behind.

**Root cause:**

Same root cause as F1 (no `git add -A`), compounded by the O1 issue below — the working tree was not reset between attempts, so attempt 1's uncommitted changes blended into attempt 2's workspace. Attempt 2 used selective `git add` and missed the leftover files.

**Fix applied:** Same as F1 (`git add -A` in `fix.md`). Fully resolved only when combined with the O1 fix below.

---

### HIGH

---

#### O1 — No working-tree reset between fix attempts; dirty state accumulates

**Severity:** High — each fix attempt inherits uncommitted changes from all prior attempts, causing cross-contamination of changes and partial commits.

**What was observed:**

Between attempt 1 (which left 15 uncommitted files) and attempt 2 (which started the fix stage), no `git reset`, `git stash`, or `git checkout -- .` was run. Attempt 2's fix agent operated on top of attempt 1's dirty working tree. The commit from attempt 2 captured some — but not all — of the accumulated edits because the agent used selective staging and did not know which files came from which attempt.

**Root cause:**

The fix loop in `orchestrator/orchestrator.js` (lines ~566–581) increments `fix_attempts`, runs the fix stage, runs the test stage, then loops back to review. There was no working-tree cleanup step between iterations:

```js
console.log(`\n🔧 Review FAIL — running targeted fix (attempt ${fixAttempts + 1}/${retryLimit})...`);
appendEvent(cfg, "stage_start", "fix");
runStage("fix", workspace, context, cfg);  // ← runs on a potentially dirty working tree
```

**Fix applied — `orchestrator/orchestrator.js`:**

`git reset --hard HEAD` on the worktree is now run immediately before each fix stage invocation:

```js
// Reset any uncommitted changes left by a prior fix attempt so each attempt
// starts from a clean committed state and changes don't silently accumulate.
const execWs = context.execWorkspace || workspace;
spawnSync("git", ["-C", execWs, "reset", "--hard", "HEAD"], { stdio: "inherit" });
```

This is safe: the worktree is isolated from the main workspace, the last committed state is always correct (a prior passing state or the initial branch state), and any uncommitted changes from a failed fix attempt are by definition wrong — if they were correct, the review would have passed.

---

## Finish Stage Issues

> Source: session_2.md — Gemini CLI running the finish stage after a Review PASS

### CRITICAL

---

#### FINISH-1 — Gemini cannot read `FINISHING_BRANCH.md` — symlink traversal blocked

**Severity:** Critical — Gemini proceeds with no cleanup or delivery guidance, enabling arbitrary destructive behavior in yolo mode.

**What was observed:**

```
Error executing tool read_file: Path not in workspace: Attempted path
"/Users/kris/code/personal/mat_latest_voiceai_projs/.spiq-worktree/.spiq/skills/FINISHING_BRANCH.md"
resolves outside the allowed workspace directories:
/Users/kris/code/personal/mat_latest_voiceai_projs/.spiq-worktree
or the project temp directory: /Users/kris/.gemini/tmp/spiq-worktree
```

This error fired twice (Gemini retried once). Gemini then proceeded through the finish stage with no access to `FINISHING_BRANCH.md`.

**Root cause:**

`setupWorktree()` in `orchestrator/orchestrator.js` created `.spiq-worktree/.spiq` as a **symlink** pointing to the real `.spiq/` directory in the main workspace:

```js
fs.symlinkSync(cfg.stateDir, worktreeSpiq);
```

Gemini CLI resolves symlinks when validating file paths for its sandbox. The resolved canonical path of `.spiq-worktree/.spiq/skills/FINISHING_BRANCH.md` is `<main-workspace>/.spiq/skills/FINISHING_BRANCH.md` — which is **outside** the allowed workspace boundary (`.spiq-worktree/`). Gemini blocks the read.

OpenCode (used for build/test/fix stages) navigates relative paths (`../.spiq/skills/`) and is not subject to the same symlink resolver, so it was unaffected.

**Fix applied — `orchestrator/orchestrator.js`:**

The symlink is replaced with a physical copy. `fs.cpSync` copies the `skills/` directory tree into the worktree, and `fs.copyFileSync` copies individual state files (`SPEC.md`, `tasks/plan.md`, `handoff.md`) that agents need:

```js
const worktreeSpiq = path.join(worktreePath, ".spiq");
fs.mkdirSync(worktreeSpiq, { recursive: true });

const skillsSrc = path.join(cfg.stateDir, "skills");
if (fs.existsSync(skillsSrc)) {
  fs.cpSync(skillsSrc, path.join(worktreeSpiq, "skills"), { recursive: true });
}

for (const rel of ["SPEC.md", "tasks/plan.md", "handoff.md"]) {
  const src = path.join(cfg.stateDir, rel);
  if (fs.existsSync(src)) {
    const dst = path.join(worktreeSpiq, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}
```

All paths Gemini's `read_file` tool resolves are now real files inside `.spiq-worktree/` — no symlink traversal required.

**Note:** The copied skills snapshot is taken once at worktree setup time. The orchestrator does not re-sync skill files during the pipeline run, which is acceptable: skill files do not change between pipeline stages.

---

#### FINISH-2 — Gemini deleted the `src/` directory — direct consequence of FINISH-1

**Severity:** Critical — entire source tree destroyed by the delivery agent during cleanup.

**What was observed:**

After the FINISH-1 error blocked skill file access, Gemini proceeded with the finish stage in yolo mode. Without `FINISHING_BRANCH.md` guidance, Gemini interpreted "5. Clean up the workspace" (from `finish.md`) without any constraints and deleted the project's `src/` directory.

**Root cause (three layers):**

1. **FINISH-1** — `FINISHING_BRANCH.md` was inaccessible. The skill explicitly defines safe cleanup: only `.spiq/` build artifacts should be removed; source directories must not be touched.

2. **Permissive yolo policy** — `policies/yolo-allow-shell.toml` uses `commandRegex = ".*"` to bypass all of Gemini CLI's dangerous-command heuristics, including the `rm -rf` guard. This policy is needed for legitimate shell operations, but it means any destructive command runs unchecked.

3. **No in-prompt safety rule** — `prompts/finish.md` had no explicit prohibition on deleting source directories. The only constraints lived in `FINISHING_BRANCH.md`, which Gemini could not read.

**Fix applied — `prompts/finish.md`:**

A WORKSPACE SAFETY RULE blockquote added immediately after the HARD STOP CHECK, so it is visible even if skill files are inaccessible:

```markdown
> **WORKSPACE SAFETY RULE**: Never delete `src/`, `tests/`, or any source code directory.
> The only files you may remove are `.spiq/` build artifacts — and only after the delivery
> action (PR / merge / push) has completed successfully. The worktree directory is cleaned
> up by the orchestrator after you exit; do NOT run `git worktree remove` yourself.
```

**Fix applied — `prompts/skills/FINISHING_BRANCH.md`:**

A SAFETY block added at the start of Step 5 (Clean Up the Workspace):

```markdown
**SAFETY**: Only remove `.spiq/` build artifacts. Never delete `src/`, `tests/`,
`node_modules/`, or any project source directory. The worktree directory is removed
by the orchestrator after you exit — do NOT run `git worktree remove` yourself.
```

The `git worktree remove [worktree-path] --force` instruction was also removed from Step 5 — the orchestrator owns worktree lifecycle, not Gemini.

---

### HIGH

---

#### FINISH-3 — Skills referenced as `.spiq/skills/<file>` paths Gemini cannot access; no inline fallback

**Severity:** High — when the symlink issue occurs, Gemini has zero skill guidance; no error is shown to the operator until something goes wrong.

**What was observed:**

`promptCompiler.js:compileSkills()` emits a catalog block like:

```
- **finishing-a-development-branch** (`.spiq/skills/FINISHING_BRANCH.md`) — Complete the development lifecycle...
```

Gemini is told to read the file with `read_file`. When the read fails (FINISH-1), there is no fallback — the skill content is simply absent. The catalog still appears in the prompt, telling Gemini a skill exists that it cannot access, which is confusing and leads to retry attempts.

**Root cause:**

Skills are provided as catalog references (name + path) rather than inline content, to save context tokens. This is intentional for build/test/fix stages where OpenCode can follow symlinks. For Gemini in the finish stage, the path-reference pattern fails silently when the symlink is broken.

**Fix:** FINISH-1 fix (physical copy) resolves this. With real files at real paths, `read_file` succeeds and no inline fallback is needed. The catalog-reference pattern remains appropriate.

---

### MEDIUM

---

#### FINISH-4 — `FINISHING_BRANCH.md` did not prohibit `src/` deletion or worktree self-removal

**Severity:** Medium — even when the skill is readable, cleanup Step 5 lacked explicit safety constraints.

**What was observed:**

Step 5 of `FINISHING_BRANCH.md` described:

```bash
# If using git worktrees, remove the feature worktree
git worktree remove [worktree-path] --force
```

There was no prohibition on deleting project source directories and no note that the worktree is managed by the orchestrator. An agent following the skill literally would attempt `git worktree remove` from within the worktree — which causes git errors — and had no guidance distinguishing "source code directories" from "build artifacts."

**Fix applied — `prompts/skills/FINISHING_BRANCH.md`:**

Safety block and removal of the `git worktree remove` command from Step 5 (see FINISH-2 fix above).

---

## Fixes Summary

| File | Changes Made |
|------|-------------|
| `prompts/build.md` | Complete rewrite: inline EXECUTION SCOPE template (C1); explicit RED-gate transition (C2); per-task TDD loop with "return to step 1" (C3); pre-handoff `git status --short` gate (C4); session length guard — 80 req → `/compact` (C5); EXECUTION CHECK after each commit (H1); Co-Authored-By in all commit examples (H2); module-resolution RED gate clarification (H3); `git diff --staged` before each commit (H4); per-module implementation loop (M1); node_modules `.d.ts` check before web search (M3/L4); ESM/CJS detection step (M4); `testTimeout: 10000` requirement (M5); HTTP client mock rule (M5) |
| `agent-cli/runners/opencode.js` | `compaction.reserved` raised from 5,000 → 25,000 — triggers compaction at 81% capacity instead of 96% (C5) |
| `orchestrator/orchestrator.js` | (Round 1) Added `writeHandoffArtifact()` — extracts BUILD HANDOFF SUMMARY from build output and writes to `.spiq/handoff.md` after every build; extended handoff injection to cover test stage in addition to build retry (test Issues 2 and 6) |
| `orchestrator/orchestrator.js` | (Round 2) Replaced `.spiq/` symlink with `fs.cpSync` + `fs.copyFileSync` — copies skills directory and state files as real files into the worktree so Gemini's path resolver can access them without symlink traversal (FINISH-1, FINISH-3) |
| `orchestrator/orchestrator.js` | (Round 2) Added `git reset --hard HEAD` on the worktree immediately before each fix stage invocation — ensures each fix attempt starts from a clean committed state (O1) |
| `orchestrator/promptCompiler.js` | Removed `WIP_CHECKPOINT.md` from test stage base skills (test Issue 4) |
| `prompts/fix.md` | Replaced "commit each logical fix" with a mandatory end-of-fix block: `git add -A` → `git status --short` → `git commit` → `git log --oneline -3`; explicit prohibition on selective `git add <path>` (F1, F2) |
| `prompts/test.md` | (Round 1) Context budget rules moved before `{{SKILLS}}`; "Start here: read `.spiq/handoff.md` first" added; `{{HANDOFF}}` section added (test Issues 1, 2, 3) |
| `prompts/test.md` | (Round 2) Uncommitted-Changes Gate section added — requires `git status --short | grep -v '^?? \.spiq'` before handoff summary; blocks stage if any source files are uncommitted (T1) |
| `prompts/finish.md` | WORKSPACE SAFETY RULE blockquote added immediately after HARD STOP CHECK — prohibits deleting `src/`, `tests/`, or any source directory; prohibits `git worktree remove`; in-prompt so it is visible even when skill files are inaccessible (FINISH-2, FINISH-4) |
| `prompts/skills/FINISHING_BRANCH.md` | SAFETY block added at the start of Step 5; `git worktree remove [worktree-path] --force` removed — worktree lifecycle is managed by the orchestrator, not Gemini (FINISH-2, FINISH-4) |
| `prompts/skills/BUILD_HANDOFF_SUMMARY.md` | Skill overview updated to require direct `write_file` to `.spiq/handoff.md`; verification checklist entry added (test Issue 6) |
| `docs/test-stage-missing-context-guide.md` | New guide — detailed analysis of all 7 test stage issues with inference logs, code examples, fix details, and future improvements |

---

## Verification Checklist

Run a new build → test pipeline and confirm the following. Each item maps to one or more issues above.

**Build stage — first output:**
- [ ] EXECUTION SCOPE block is printed before any file read or write (C1)
- [ ] Block lists specific files, not generic placeholders

**Build stage — first task (utils or equivalent):**
- [ ] `test(<scope>):` commit appears before any `feat(<scope>):` commit (C3)
- [ ] `git diff --staged` output appears in the log before the commit command (H4)
- [ ] Commit message includes `Co-Authored-By: OpenCode Agent <opencode-agent@agenticspiq.local>` (H2)
- [ ] After commit, EXECUTION CHECK block is printed (H1)
- [ ] After confirming RED (tests fail), agent immediately moves to implementation without re-running tests or re-committing (C2)
- [ ] `npm test` run between each module implementation — not once after all modules (M1)

**Build stage — second and subsequent task groups:**
- [ ] TDD gate repeats: `test(<scope>):` commit before `feat(<scope>):` for each new task (C3)
- [ ] No batch of implementation files written without preceding test commits

**Build stage — pre-handoff:**
- [ ] `git status --short` output appears in the log (C4)
- [ ] Output shows only `?? .spiq` (or clean) — no `M` or `A` files outside `.spiq/` (C4)
- [ ] If dirty: commit or restore commands appear before handoff is written (C4)

**Session length:**
- [ ] If build runs >80 requests, `/compact` appears in the log (C5)
- [ ] llama.cpp logs show compaction before context reaches 110K tokens (C5)

**Test stage — first action:**
- [ ] Agent's first tool call is `read .spiq/handoff.md` — not `read .` or a glob (test Issue 1)
- [ ] No Explore Agent spawned at stage start (test Issue 1)
- [ ] No empty globs (`**/*.test.*`, `**/.spiq/**`) at stage start (test Issue 1)
- [ ] `n_tokens` at first inference call is below 30K (test Issues 5, 7)

**Test stage — uncommitted-changes gate (T1):**
- [ ] Before handoff summary is written, `git status --short | grep -v '^?? \.spiq'` produces no output
- [ ] If uncommitted files are present, stage prints "TEST BLOCKED: uncommitted source changes detected" and does not write the handoff

**vitest.config.ts (for new projects):**
- [ ] `testTimeout: 10000` present (M5)
- [ ] All client modules mocked with `vi.mock()` (M5)
- [ ] `npm test` completes within 30 seconds

**Fix stage — when a review FAIL triggers the retry loop:**
- [ ] Orchestrator log shows `git reset --hard HEAD` output before the fix stage starts (O1)
- [ ] Fix stage log ends with `git add -A` → `git status --short` → `git commit` (F1, F2)
- [ ] `git log --oneline -3` appears in the fix stage log, confirming the commit was created (F1)
- [ ] After the fix stage exits, `git status --short | grep -v '.spiq'` on the worktree is empty (F2)

**Finish stage:**
- [ ] No "resolves outside the allowed workspace" errors in the finish stage log (FINISH-1)
- [ ] Gemini reads `.spiq/skills/FINISHING_BRANCH.md` successfully — no retry errors (FINISH-1)
- [ ] `src/` directory exists and is intact after finish stage completes (FINISH-2)
- [ ] Finish stage log contains the DELIVERY SUMMARY block from `FINISHING_BRANCH.md` Step 2 (FINISH-1)
- [ ] Worktree cleanup (`git worktree remove`) does not appear in the finish stage log — orchestrator handles it (FINISH-4)

---

## Future Improvements

### Build stage

#### B-F1 — Detect and reject `.js` extensions at commit time (medium value)

A pre-commit hook (or a lint rule in the build prompt) could scan staged TypeScript files for relative imports ending in `.js` and fail the commit if the project is detected as CJS. This catches the M4 pattern mechanically rather than relying solely on the detection step in the prompt.

```bash
# Example pre-commit check for CJS projects
if grep -rn '"module": "CommonJS"' tsconfig.json > /dev/null 2>&1; then
  if git diff --staged --name-only | xargs grep -l "from '\..*\.js'" 2>/dev/null; then
    echo "ERROR: .js extensions in relative imports detected in a CJS project"
    exit 1
  fi
fi
```

#### B-F2 — Auto-detect testTimeout absence at scaffold time (medium value)

The scaffold step (`utils/scaffold.js`) or the build prompt could check for `testTimeout` in `vitest.config.ts` after scaffold and fail with a clear message if absent. This would catch M5 before the first `npm test` hangs.

#### B-F3 — Track per-task TDD compliance in `.spiq/tasks.json` (low priority)

Add a `tdd_gate_met: boolean` field per task in `tasks.json`. The build agent sets it to `true` after the test commit for that task; the review stage checks that every completed task has `tdd_gate_met: true`. This makes TDD compliance machine-verifiable rather than relying on log inspection.

#### B-F4 — Cap build stage requests with orchestrator enforcement (medium value)

Rather than relying on the agent to voluntarily run `/compact` at 80 requests, the orchestrator could inject a "COMPACT NOW" instruction into the next prompt when the build stage output JSON exceeds a token-count threshold (e.g. 80K tokens in the output accumulator). This is a runtime enforcement rather than a prompt reminder.

#### B-F5 — Per-task test coverage gate before marking complete (low priority)

Before an agent marks a task complete in `todo.md`, require that the new tests for that task provide >0% line coverage of the modules created in that task. This would have caught C3 (8 modules with zero tests) at the task-completion step rather than at the handoff.

---

### Test stage

The test stage future improvements are documented in detail in [`test-stage-missing-context-guide.md`](test-stage-missing-context-guide.md#future-improvements). In brief:

| # | Improvement | Value |
|---|-------------|-------|
| T-F1 | Structured `<!-- FILE_MANIFEST_START -->` block in handoff — survives prompt truncation | High |
| T-F2 | Per-stage `HANDOFF_CHAR_LIMIT` — allow 5K chars for test stage vs 2.5K for others | Medium |
| T-F3 | Inject `{{PLAN}}` into test stage prompt — acceptance criteria → test cases directly | Medium |
| T-F4 | Use non-SWA model for local executor — eliminates KV cache invalidation class | High (llama.cpp only) |
| T-F5 | `--tools` / sub-agent restriction flag in opencode runner — prevent Explore Agent | Long term |
| T-F6 | Handoff validation in orchestrator — warn before test stage if `.spiq/handoff.md` is missing or empty | Low |

---

### Fix stage

#### FIX-F1 — Re-sync `.spiq/` state files into worktree after each fix attempt (medium value)

The current worktree copy is made once at setup time. If the orchestrator updates `handoff.md`, `SPEC.md`, or `tasks/plan.md` between fix attempts (e.g. via `writeHandoffArtifact`), the worktree copy becomes stale. Adding a targeted sync step at the start of each fix attempt — just for the state files, not the skills — would keep agents working from fresh context.

#### FIX-F2 — FIX SUMMARY validation in orchestrator (low priority)

`fix.md` Step 3 requires the agent to output a `FIX SUMMARY` block (Critical resolved, Important resolved, etc.). Neither session log showed this block being produced, and the orchestrator ignores it. Adding a check that parses and logs the FIX SUMMARY after the fix stage would make it easier to audit whether all review findings were addressed before the test stage re-runs.

#### FIX-F3 — Inject the prior-attempt commit hash into the next fix prompt (medium value)

Currently each fix attempt starts from a `git reset --hard HEAD` baseline with no reference to what the previous attempt tried. Injecting a short `git log -1 --stat` of the last fix commit into the fix prompt would give the agent concrete context: "the previous attempt fixed X — your job is to fix the remaining Y."

---

### Finish stage

#### FINISH-F1 — Re-sync `.spiq/` into worktree immediately before finish stage (high value)

The worktree copy of skills and state files is made at build-stage setup. By the time the finish stage runs (after build → test → multiple fix/review cycles), `handoff.md` and the state directory will have been updated by the orchestrator but the worktree copy will be stale. A targeted resync — copying `handoff.md` and any other changed state files into the worktree `.spiq/` — immediately before the finish stage would ensure Gemini works from the most current handoff and spec.

#### FINISH-F2 — Validate `src/` integrity before and after finish stage (high value)

The orchestrator could snapshot the set of directories at the worktree root (e.g. `ls -d */`) before invoking the finish stage and diff it against the same snapshot afterwards. If any source directory disappears, the orchestrator could log a critical error, restore from the last git commit, and halt rather than silently continuing. This would catch FINISH-2 class incidents automatically.

#### FINISH-F3 — Narrow yolo-allow-shell.toml to a safer allowlist (medium value)

The current policy uses `commandRegex = ".*"` to bypass all of Gemini CLI's dangerous-command heuristics. A more targeted regex — e.g. allowing `git`, `gh`, `npm`, `npx`, `tsc`, `node` but blocking raw `rm`, `find -exec`, etc. — would provide yolo-mode convenience for legitimate operations while preserving guards against accidental deletion. The `rm -rf .spiq/` case (legitimate cleanup) could be explicitly allowlisted by pattern rather than opening all shell commands.

---

## Related Docs

- [`test-stage-missing-context-guide.md`](test-stage-missing-context-guide.md) — deep-dive on all 7 test stage issues
- [`context-optimization-guide.md`](context-optimization-guide.md) — context bloat analysis across all agents
- [`openclaude-context-size-guide.md`](openclaude-context-size-guide.md) — context tuning for local llama.cpp deployments
- [`executor-token-cost-reduction-plan.md`](executor-token-cost-reduction-plan.md) — token cost reduction strategies for the executor role
- [`build-failure-recovery-guide.md`](build-failure-recovery-guide.md) — pipeline state recovery after build failures
- [`model-selection-guide.md`](model-selection-guide.md) — choosing models for each pipeline role including SWA considerations
- [`review-fix-loop-guide.md`](review-fix-loop-guide.md) — how the review → fix → test retry cycle is orchestrated

**Session logs that informed the fix/finish stage sections:**
- `/Users/kris/code/personal/mat_latest_voiceai_projs/ai_debug/session_1.md` — first Review FAIL retry (fix attempt 1)
- `/Users/kris/code/personal/mat_latest_voiceai_projs/ai_debug/session_2.md` — second Review FAIL retry and finish stage (fix attempt 2 → PASS → finish)
