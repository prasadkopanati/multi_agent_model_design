# Executor Token Cost Reduction Plan

## Diagnosis

**Root cause: context accumulation within a single OpenCode session**

Input tokens grow monotonically from ~24K → ~117K across ~70 API calls in a single session. Every tool execution — file reads, bash outputs, diffs, test failures — gets appended to the model's conversation history and paid for on every subsequent turn. OpenCode's compaction config only fires when the context window fills up; by then the damage is done.

Three compounding problems:

| Problem | Evidence | Tokens wasted |
|---|---|---|
| Build stage loads 17 skills, agent reads 4+ immediately | Log shows `→ Read .spiq/skills/EXECUTION_DISCIPLINE.md` etc. at turn 1 | ~33K tokens (4 × 8K avg) added before any code work |
| Verbose shell output captured in context | Full HTML DOM dump from a test failure visible in session logs | 5–15K per failure |
| Compaction fires too late | `reserved: 20000` keeps 20K reserved but triggers only at model limit | Pays for all accumulated tokens before any pruning |

---

## Fix 1: Shell output truncation rules in build/test prompts

**Status: Implemented**  
**Files:** `prompts/build.md`, `prompts/test.md`

Added a mandatory context budget block at the top of each prompt:
- Append `2>&1 | tail -50` to all test/build commands — covers ~80% of cases with sufficient output
- If output is insufficient to diagnose a failure, the model re-runs with `tail -100` or higher (self-correction for the remaining ~20% of cases)
- Read skill files only if the task explicitly requires that skill, each file once only
- Read source files with `offset` + `limit` parameters — never full files unless writing to them

**Why `tail -50` and not lower:** The model is capable of recognizing when it has insufficient output (e.g., seeing only HTML with no assertion details) and will re-run the command with a larger tail. `tail -5` would push that self-correction to too many cases and risk poorly-informed fixes. `tail -50` covers the common cases — simple assertion errors, build errors, lint output — while keeping the instruction simple. No HTML stripping or other filtering is applied; added complexity isn't worth it when the model can ask for more.

**Iteration history:** Initially set to `tail -80`, revised down to `tail -50` after analysis showed the model can self-correct for the minority of cases needing more output.

---

## Fix 2: Trim skill file content

**Status: Implemented**  
**Files:** `prompts/skills/TEST_DRIVEN.md`, `GIT.md`, `DEBUGGING.md`, `INCREMENTAL_IMPLEMENTATION.md`, `BROWSER_TESTING.md`

**Why the original approach (reducing the catalog list) was wrong:** Each skill in the catalog is a single one-liner (~100 bytes). 17 vs 8 entries = ~900 bytes difference — negligible. The real cost hits when the model reads the full skill file (8–14KB). Trimming the catalog only reduces discoverability, not the cost of reading.

**Approach:** Stripped each heavy skill file to just the mandatory process steps, rules, and verification checklists. Removed: code examples, ASCII diagrams, "Common Rationalizations" sections, verbose explanations. The rules and process steps are what the agent needs; the prose and examples are not.

| File | Before | After | Reduction |
|---|---|---|---|
| TEST_DRIVEN.md | 14,469 bytes | 2,711 bytes | 81% |
| BROWSER_TESTING.md | 13,469 bytes | 3,185 bytes | 76% |
| GIT.md | 12,323 bytes | 2,338 bytes | 81% |
| DEBUGGING.md | 10,604 bytes | 2,741 bytes | 74% |
| INCREMENTAL_IMPLEMENTATION.md | 8,469 bytes | 2,522 bytes | 70% |

**Total saved per read event:** ~44KB → ~13KB (70% reduction). Since the build agent reads 4–5 of these files in the first few turns, that's ~155K fewer tokens accumulated in the first 5 turns of every build session.

---

## Fix 3: Lower compaction reserved threshold

**Status: Implemented**  
**File:** `agent-cli/runners/opencode.js`

Changed `reserved: 20000` → `reserved: 5000`. This makes compaction prune more aggressively when it triggers, retaining less stale history. Combined with fixes 1 and 2, this reduces the baseline context that compaction has to manage.

---

## Fix 4: Add `--variant minimal` for executor stages

**Status: Future implementation**

OpenCode's `--variant` flag controls reasoning effort. For build/test stages, the executor needs reliable execution, not deep reasoning. Adding `--variant minimal` to the `spawnSync` args in `agent-cli/runners/opencode.js` would reduce per-turn reasoning token cost.

**How to apply:** Add `"--variant", "minimal"` to the opencode `run` args for non-check invocations. Verify the target model (e.g. kimi-k2.5) supports the `minimal` variant before enabling.

---

## Fix 5: Per-task session isolation

**Status: Future implementation**

The fundamental driver of context growth is one long session accumulating all tasks in a build stage. Each new task inherits the full history of all prior tasks.

**Proposed approach:**
1. Parse `tasks/plan.md` into individual task items in the orchestrator
2. Loop over them, invoking OpenCode once per task with a focused single-task prompt
3. Each session starts at ~5K tokens instead of inheriting 80K+ of accumulated history
4. Collect handoff summaries and feed only the summary (not the full session) into the next task

This requires orchestrator changes to `orchestrator/orchestrator.js` to split the build/test stage into per-task iterations. It is the highest-leverage structural fix and should be revisited after measuring the impact of fixes 1–3.
