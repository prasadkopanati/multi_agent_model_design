# Test Stage Missing Context Guide

> Last updated: 2026-04-30 (updated same day — second pass after live testing)

This guide documents the root cause of excessive exploration and token waste at the start of the test stage, the five issues that drove it, the fixes applied, and future improvements that remain on the table.

---

## The Problem

When the pipeline resumes at the test stage, the executor (OpenCode / Qwen3.5) spends significant time and tokens before writing a single line of test code:

```
↩  Resuming from stage: test
▶ Running stage: test [opencode] (worktree)

> build · Qwen3dot6-27B

→ Read .
→ Read .spiq/skills/TEST_DRIVEN.md
✱ Glob "**/.spiq/**" 0 matches
→ Read src
→ Read package.json
→ Read vitest.config.ts
✱ Glob "**/*.test.*" 0 matches
✱ Glob "**/*.spec.*" 0 matches
• Explore source code structure Explore Agent
```

The model reads the root directory listing, eagerly loads skill files, runs broad globs that return nothing, and spawns an Explore sub-agent — all before touching test code. At the inference engine level this triggers KV cache invalidation and forced full context re-processing:

```
forcing full prompt re-processing due to lack of cache data
  (likely due to SWA or hybrid/recurrent memory)
erased invalidated context checkpoint (size = 149.626 MiB)
cache size limit reached, removing oldest entry (size = 1351.152 MiB)
```

Context grows from ~16K tokens at the start of the stage to ~28K–34K tokens before any test is written, causing repeated cache evictions and compounding latency.

---

After the first fix pass, two additional problems surfaced during live testing:

```
✗ read failed
Error: File not found: /path/to/.spiq-worktree/.spiq/handoff.md
✱ Glob "**/handoff.md" in . · 0 matches
→ Read .spiq
→ Read .spiq/tasks.json
...
```

And the initial context question:

```
slot update_slots: id  0 | task 11 | prompt processing done, n_tokens = 26613
```

These are documented below as Issues 6 and 7.

---

## Root Cause Analysis

### Issue 1 — Test prompt had zero project context

**File:** `prompts/test.md`

The test stage template contained only one template variable:

```markdown
{{SKILLS}}

**Context budget — follow these rules ...**
```

`{{SKILLS}}` renders as a one-liner pointer catalog (e.g. `- **test-driven-development** (.spiq/skills/TEST_DRIVEN.md) — ...`). It does not inject the spec, plan, build output, or any handoff describing what was just built.

The model therefore arrives at the test stage with no knowledge of:
- Which files were created or modified during build
- What test scaffolding already exists
- Which test runner or framework is in use
- What the feature requirements are

This forces the model to reconstruct all of that from first principles — hence the workspace exploration.

### Issue 2 — Handoff never loaded for the test stage

**File:** `orchestrator/orchestrator.js:503–511` (before fix)

The build stage writes a handoff summary to `.spiq/handoff.md` via the BUILD_HANDOFF_SUMMARY skill. This file contains a structured description of what was built, what files were modified, and what still needs work. However, the orchestrator only loaded it for the build stage:

```js
// Before fix
if (stage === "build" && !context.handoff) {
  const handoff = loadHandoff(cfg);
  ...
}
```

The test stage received `context.handoff = undefined`, so `{{HANDOFF}}` (when it eventually was added to the template) would have rendered as an empty string.

### Issue 3 — Context budget rules appeared after the skills block

**File:** `prompts/test.md` (before fix)

The original ordering was:

```
{{SKILLS}}                         ← line 5: skill catalog
**Context budget — ...**           ← line 7: read files at most once, use tail-50
```

Models read prompts top-to-bottom. An eager model sees the skill catalog first and begins reading `.spiq/skills/TEST_DRIVEN.md` before it encounters the constraint "read skill files only when the task explicitly requires that skill, each file at most once." By then, the skill has already been loaded, growing the context before any work begins.

### Issue 4 — `WIP_CHECKPOINT` in the test stage base skills

**File:** `orchestrator/promptCompiler.js:21` (before fix)

```js
test: [
  "SKILLS.md", "TEST_DRIVEN.md", "VERIFICATION_BEFORE_COMPLETION.md",
  "WIP_CHECKPOINT.md",   // ← not relevant during test
  "BUILD_HANDOFF_SUMMARY.md"
]
```

`WIP_CHECKPOINT` covers checkpoint commit discipline during iterative development: making a save-point commit before risky changes, recovering after tool failures, etc. This is a build-phase concern. The test stage does not iterate on code in the same way; including this skill in the catalog is noise that a thorough model may follow unnecessarily.

### Issue 6 — Handoff file is never written to disk

**Discovered:** live test after Fix 1 was applied

The `BUILD_HANDOFF_SUMMARY` skill tells the build agent to produce a handoff as its final output. The orchestrator captures this as the build stage output JSON. However, `loadHandoff()` reads from `cfg.handoffFile` (`.spiq/handoff.md`) — a file that nothing in the system ever actually writes. The orchestrator pattern for persisting stage artifacts (e.g. `writePlanArtifacts()` writing the plan to `tasks/plan.md`) was never applied to the handoff.

Result: `loadHandoff()` always returns null. `{{HANDOFF}}` in the test prompt renders as an empty section. The model reads `.spiq/handoff.md` per the "Start here" instruction, gets a file-not-found error, and falls back to the same workspace exploration pattern as before.

### Issue 7 — 26,613 token initial context for the test stage

**Source:** llama.cpp inference logs

```
slot update_slots: id  0 | task 11 | prompt processing done, n_tokens = 26613
reasoning-budget: activated, budget=0 tokens
reasoning-budget: budget=0, forcing immediately
```

The initial context breaks down approximately as:

| Layer | Tokens | Controllable? |
|-------|--------|---------------|
| OpenCode system prompt + all tool definitions | ~20,000 | No — fixed per OpenCode |
| agenticspiq compiled test.md (skills catalog + instructions) | ~6,000 | Partially |
| **Total** | **~26,613** | — |

The ~20K OpenCode overhead is unavoidable — it is the full set of tool definitions and system instructions OpenCode loads on every session start regardless of task. The ~6K agenticspiq portion covers the skill pointer catalog, context budget rules, TDD workflow instructions, and the browser testing snippet (including the inline Playwright script).

**Is 26K acceptable?**

- **For cloud models (Claude/Gemini/OpenAI via API):** Yes. 26K starting tokens leaves 105K+ remaining in a 131K context window. Each tool call adds 500–2,000 tokens; a 50-tool-call test session would use 25–100K more, which fits.
- **For local SWA models (Qwen3.5 on llama.cpp):** Problematic. The first KV cache checkpoint boundary is ~14–16K tokens. The 20K OpenCode overhead already exceeds this before agenticspiq adds anything. Every first request in a test session forces full prompt re-processing, typically costing 2–3 extra seconds. Reducing the agenticspiq portion from 6K to 3K would not fix this — the 20K overhead is the bottleneck. The real mitigation is using a non-SWA model for the executor role.

### Issue 5 — KV cache invalidation from Qwen3.5 SWA architecture

**Source:** llama.cpp inference server logs

```
slot update_slots: id  0 | task 422 | forcing full prompt re-processing due to lack of
  cache data (likely due to SWA or hybrid/recurrent memory,
  see https://github.com/ggml-org/llama.cpp/pull/13194)
slot update_slots: id  0 | task 422 | erased invalidated context checkpoint
  (pos_min = 13923, n_tokens = 13924, size = 149.626 MiB)
```

Qwen3.5's Sliding Window Attention (SWA) / hybrid-recurrent memory architecture does not checkpoint the KV cache the same way a standard transformer does. When the conversation grows past the first checkpoint boundary (~14K tokens), llama.cpp cannot reuse the cached state and must reprocess the entire prompt from token 0 on every new request. The exploration behaviour in issues 1–4 drives the context from ~16K to ~28K–34K tokens rapidly, hitting this boundary multiple times per stage run.

This is partially a model/hardware constraint, not something the orchestrator can fully solve in software. However, keeping the initial context small and preventing redundant exploration meaningfully reduces how often the boundary is crossed.

---

## Fixes Applied

### Fix 1 — Inject handoff into the test stage prompt

**`prompts/test.md`** now includes `{{HANDOFF}}` and a "start here" directive placed before the skills catalog:

```markdown
**Context budget — follow these rules on every command or costs spiral:**
- **Start here:** Read `.spiq/handoff.md` first — it contains the file manifest and test
  targets from the build stage. Do NOT explore the workspace structure or run broad globs
  before reading it.
- Append `2>&1 | tail -50` to all test/build commands. ...
- Read skill files only when the task explicitly requires that skill. Each file at most once.
- Read source files using `offset` + `limit` parameters — never the entire file unless
  you are about to write to it.

{{SKILLS}}

## Build Handoff

{{HANDOFF}}
```

The handoff block gives the model a concrete starting point: the list of files built, the test runner in use, and any open items noted during build. The "start here" directive at the very top — before the skill catalog — ensures the model reads `.spiq/handoff.md` as its first action rather than exploring the workspace.

### Fix 2 — Load handoff for both build and test stages

**`orchestrator/orchestrator.js`** — the handoff guard was extended from `build`-only to cover `test` as well:

```js
// After fix
if ((stage === "build" || stage === "test") && !context.handoff) {
  const handoff = loadHandoff(cfg);
  if (handoff) {
    context = { ...context, handoff };
    if (stage === "build") console.log("📋 Prior handoff context injected into build stage.");
    appendEvent(cfg, "handoff_injected", stage);
  }
}
```

The `console.log` is intentionally kept only for the build stage (where the handoff represents a _prior failed run_ and is noteworthy). For the test stage, injecting it is expected behaviour and needs no user-visible log line.

### Fix 3 — Remove `WIP_CHECKPOINT` from the test stage base skills

**`orchestrator/promptCompiler.js`:**

```js
// Before
test: ["SKILLS.md", "TEST_DRIVEN.md", "VERIFICATION_BEFORE_COMPLETION.md",
       "WIP_CHECKPOINT.md", "BUILD_HANDOFF_SUMMARY.md"],

// After
test: ["SKILLS.md", "TEST_DRIVEN.md", "VERIFICATION_BEFORE_COMPLETION.md",
       "BUILD_HANDOFF_SUMMARY.md"],
```

`BUILD_HANDOFF_SUMMARY.md` is retained because the test stage produces its own handoff for the review stage.

### Fix 4 — Write the handoff to disk after the build stage completes

**`orchestrator/orchestrator.js`** — New `writeHandoffArtifact()` function added alongside `writePlanArtifacts()`:

```js
function writeHandoffArtifact(cfg, rawOutput) {
  try {
    const text = extractText(rawOutput);
    if (!text) return;
    // Prefer the structured handoff block; fall back to the full output text.
    const match = text.match(/BUILD HANDOFF SUMMARY[\s\S]*/i);
    const content = (match ? match[0] : text).trim();
    if (content) fs.writeFileSync(cfg.handoffFile, content);
  } catch { /* non-fatal */ }
}
```

Called immediately after the build stage output is read:

```js
if (stage === "build") writeHandoffArtifact(cfg, output);
```

This is the **primary** mechanism — it works whether or not the build agent follows the skill instruction, and it runs on every build completion including the fix-loop re-runs. The regex extracts the `BUILD HANDOFF SUMMARY` block if present; if the build agent produced a different format, the full output text is used as a fallback.

**`prompts/skills/BUILD_HANDOFF_SUMMARY.md`** — The skill overview now explicitly states:

> Write the handoff block to `.spiq/handoff.md` using `write_file`. The orchestrator reads this file at the start of the next stage — if it is missing, the next agent explores the workspace from scratch.

And the verification checklist now requires:

> `[ ]` Handoff summary has been written to `.spiq/handoff.md` using `write_file`

This is the **belt-and-suspenders** mechanism — if the build agent writes directly, the file exists even before the orchestrator extraction runs, and it will also be present when a pipeline is resumed from a prior session where the orchestrator extraction may have already completed.

### Fix 5 — 26,613 token initial context (no code change — documented as expected)

The initial 26,613 tokens are expected and acceptable for cloud models. The breakdown:
- ~20K: OpenCode fixed overhead (system prompt + all tool definitions). Unavoidable.
- ~6K: agenticspiq compiled test.md. Lean but non-trivial (skill catalog + instructions + Playwright snippet).

For local SWA models, this is above the effective KV cache checkpoint boundary (~14–16K). Reducing the agenticspiq portion from 6K to 3K would not help because the 20K OpenCode overhead already exceeds the boundary on its own. See the Future Improvements section for the non-SWA model recommendation.

---

## Effect of Fixes

| Symptom | Before | After |
|---------|--------|-------|
| Model's first action | `Read .` / broad glob / Explore Agent | `Read .spiq/handoff.md` |
| Empty globs | `**/.spiq/**`, `**/*.test.*`, `**/*.spec.*` — 0 matches each | Eliminated (file paths from handoff used directly) |
| Skill reads at stage start | TEST_DRIVEN.md read immediately | Deferred until explicitly needed |
| Handoff file at pipeline resume | Always missing — exploration fallback triggered | Written by orchestrator after every build; also written by build agent directly |
| Initial context at first inference call | ~26K tokens + growing fast (exploration) | ~26K tokens + grows slowly (handoff-guided, no workspace rediscovery) |
| KV cache invalidation | Context crosses SWA boundary within first few turns | Boundary crossed later; fewer full re-processes |

---

## What the Handoff File Contains

The build stage writes `.spiq/handoff.md` via the BUILD_HANDOFF_SUMMARY skill. A typical handoff looks like this:

```markdown
## Build Handoff Summary

### Files Created / Modified
- `src/api/users.ts` — new endpoint GET /users/:id
- `src/api/users.test.ts` — placeholder test file (test stage should fill in)
- `src/db/schema.ts` — added `users` table migration

### Test Runner
- Framework: Vitest
- Config: `vitest.config.ts`
- Run command: `npm test`

### Test Status at Build End
- No tests written yet — test stage responsible for all test authoring
- Known edge case: null `userId` param not yet validated

### Open Items for Test Stage
- Test GET /users/:id happy path
- Test 404 when user not found
- Test null/missing userId → 400 response
```

When this is injected into the test stage prompt via `{{HANDOFF}}`, the model knows exactly which files to open, which runner to use, and what scenarios to cover — no discovery required.

---

## Remaining Issue: SWA KV Cache Invalidation

The llama.cpp KV cache invalidation from Qwen3.5's SWA architecture is **not fully resolved** by these fixes. Fixes 1–5 reduce the rate of context growth, but a long test session (many tool calls) will still eventually push the context past checkpoint boundaries. Additionally, the 20K OpenCode fixed overhead already exceeds the first checkpoint boundary (~14–16K), meaning cold-start re-processing on the first request is unavoidable with this model/executor combination.

Observed cache eviction pattern from inference logs:
```
srv  update: - cache state: 3 prompts, 3017.324 MiB (limits: 4096.000 MiB, 131072 tokens)
srv  update: - cache size limit reached, removing oldest entry (size = 1351.152 MiB)
```

The cache holds up to 4096 MiB and 131072 tokens across all slots. When a new prompt doesn't fit within existing checkpoint spans, the entire slot's KV state is evicted and rebuilt. Each eviction costs 2–3 seconds of extra processing time (observed: 2.3s for 1549 tokens at 670 tok/s).

### Partial mitigations available today

- Reducing initial prompt size (done by fixes 1–3) keeps more budget for conversation history before the boundary is hit.
- The `compaction: { auto: true, prune: true, reserved: 5000 }` setting in `agent-cli/runners/opencode.js` triggers OpenCode's own context pruning when the context grows too large. Lowering `reserved` (e.g. to `3000`) gives compaction more room to act, at the cost of slightly less headroom for output.

---

## Future Improvements

### 1. Include a compact file manifest in every build handoff (high value)

The BUILD_HANDOFF_SUMMARY skill currently leaves the structure of the handoff up to the model. If the build agent produces a verbose handoff, the 2,500-character truncation in `promptCompiler.js:107` may cut the file list. The skill should be updated to require a **structured manifest block at the top**:

```markdown
<!-- FILE_MANIFEST_START -->
src/api/users.ts | created
src/api/users.test.ts | created (empty)
src/db/schema.ts | modified
<!-- FILE_MANIFEST_END -->
```

The orchestrator or promptCompiler could then extract just this block when context is tight, guaranteeing the file list survives truncation.

### 2. Increase the handoff character limit for the test stage (medium value)

`HANDOFF_CHAR_LIMIT = 2500` in `promptCompiler.js:107` was set conservatively to avoid bloating every stage. The test stage specifically benefits from a richer handoff. Consider a per-stage limit:

```js
const HANDOFF_CHAR_LIMIT = {
  build: 2500,   // prior-run handoff; keep short
  test:  5000,   // build-to-test handoff; can afford more detail
};
```

### 3. Inject `{{PLAN}}` into the test stage prompt (medium value)

The plan contains the task breakdown with explicit acceptance criteria. If the model has access to the plan, it can derive test cases directly from the acceptance criteria rather than inferring them from the code. This is especially useful when the handoff is sparse or the feature is complex. Add `{{PLAN}}` to `prompts/test.md` and pass `context.plan` (already loaded by the orchestrator) into the test stage.

### 4. Use a non-SWA model for the executor at local inference (low overhead, high impact for llama.cpp users)

The SWA cache invalidation is specific to models with sliding-window or hybrid attention (Qwen3.5, Mistral variants, etc.). For local llama.cpp deployments, using a standard full-attention model (e.g. Llama 3.x, Phi-3, Mistral full-attention) as the executor eliminates this class of cache miss entirely. This is a model selection concern, not a code change, but it should be documented as an option in the model selection guide.

### 5. Add a `--no-explore` or `--tools` restriction flag to the opencode runner (long term)

The Explore Agent spawning (`• Explore source code structure Explore Agent`) is a built-in OpenCode behaviour that cannot currently be suppressed from the prompt alone — the model calls it when it doesn't have enough context to proceed. Long term, if OpenCode exposes a flag to restrict which tools (including sub-agents) are available, the test runner could disable the Explore Agent explicitly. This would force the model to work only from the injected context, preventing the worst-case exploration spiral.

As a near-term alternative, the "Start here" directive added to `prompts/test.md` is intended to satisfy the model's context-seeking behaviour before it reaches for the Explore Agent.

### 6. Write a handoff validation step into the orchestrator (low priority)

Before the test stage starts, the orchestrator could check that `.spiq/handoff.md` exists and is non-empty. If it is missing (e.g. the build agent failed to write one), the orchestrator could emit a warning and inject a fallback prompt fragment:

```
⚠  No handoff found at .spiq/handoff.md — test stage will explore workspace.
```

This makes the failure mode visible rather than silently allowing the exploration spiral.

---

## Related Docs

- [`context-optimization-guide.md`](context-optimization-guide.md) — general context bloat analysis across all agents
- [`openclaude-context-size-guide.md`](openclaude-context-size-guide.md) — context tuning for the OpenClaude runner and local llama.cpp
- [`executor-token-cost-reduction-plan.md`](executor-token-cost-reduction-plan.md) — token cost reduction strategies for the executor role
- [`build-failure-recovery-guide.md`](build-failure-recovery-guide.md) — how pipeline state is recovered after build failures
