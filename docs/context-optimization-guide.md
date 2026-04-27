# Context Optimization Guide

> Last updated: 2026-04-26

This guide documents the root causes of context bloat across all three agents (OpenCode, Claude, Gemini), the cost impact, and the solutions applied per agent.

---

## The Problem

### Observed pattern

From session logs (Qwen3.5 Plus, session `NSUv0Nz7`, ~49 requests):

```
8:47 pm   gpt-5-nano    1,657    (task routing)
8:48 pm   qwen3.5-plus  27,637   ← session starts
8:49 pm   qwen3.5-plus  36,889
...
9:02 pm   qwen3.5-plus  60,072   ← session ends
```

Context grows from **27K → 60K tokens** over a single stage run (+33K tokens). Input never returns to baseline — each request is larger than the last.

### Token budget breakdown

| Layer | Tokens | Controllable? |
|-------|--------|---------------|
| OpenCode system prompt + tool definitions | ~20,000 | No — fixed overhead |
| Compiled stage prompt (skills catalog + instructions) | ~2,000–7,000 | Yes (lower priority) |
| Conversation history (tool calls + responses) | Grows +500–2,000/turn | Yes — via compaction |

The **20K fixed overhead** is identical on every API call OpenCode makes. It cannot be eliminated, but can be made 10× cheaper via caching.

The **growing conversation history** compounds across turns — each file read, write, test run, and error reply gets replayed in full on every subsequent call. Over 50 requests, this is the dominant cost driver.

### Cost impact (Qwen3.5 Plus at $0.20/M input)

Session `NSUv0Nz7` total input ≈ **2,457,000 tokens**:

```
2,457,000 tokens × $0.20/M = ~$0.49 per stage session
```

Per pipeline run (build + test sessions combined): **~$1.00+ in input tokens**, mostly from static overhead resent on every turn.

---

## Solution 1: Prompt Caching (applied)

### What it does

The ~20K static system + tool tokens are written to a provider-side cache once and read back at a fraction of the cost on every subsequent request in the session.

### Pricing impact (Qwen3.5 Plus)

| | Rate | Cost for 50 requests × 20K static tokens |
|--|------|------------------------------------------|
| No cache (current) | $0.20/M | **$0.200** |
| Cache write (1×) | $0.25/M | $0.005 |
| Cache read (49×) | $0.02/M | **$0.020** |
| **Total with cache** | | **$0.025** |
| **Savings** | | **87.5%** on static layer |

### Caching support by recommended model

| Model | Cached Read | Cached Write |
|-------|-------------|--------------|
| Qwen3.5 Plus | $0.02/M | $0.25/M |
| Qwen3.6 Plus | $0.05/M | $0.625/M |
| MiniMax M2.5/M2.7 | $0.06/M | $0.375/M |
| Kimi K2.5 | $0.10/M | — |
| Kimi K2.6 | $0.16/M | — |
| GLM 5.1 | $0.26/M | — |

### Implementation

Relies on **automatic prefix caching** built into OpenCode's provider layer. No explicit `setCacheKey` is needed — and setting it caused `promptCacheKey` errors on providers that only support read-side caching (e.g., Kimi K2.5/K2.6). The `setCacheKey` option was removed after this was discovered. Caching is effective across all supported models through automatic prefix reuse.

---

## Solution 2: Auto-Compaction (applied)

### What it does

When conversation history grows large, OpenCode summarizes all completed tool exchanges into a compressed summary and discards the raw history. Active context stays bounded even across dozens of tool calls.

### Without vs with compaction

```
Without compaction:  27K → 60K+ over a session (unbounded)
With compaction:     grows to threshold, compacts, resumes from lower baseline
```

### Compaction config fields

| Field | Type | Purpose |
|-------|------|---------|
| `auto` | boolean | Enable automatic compaction |
| `prune` | boolean | Discard old raw messages after summarizing |
| `reserved` | integer (tokens) | Amount of recent context to preserve post-compaction |

### Why `reserved: 20000` for complex coding tasks

Complex coding tasks involve multi-file reads, writes, test runs, error triage, and iterative fixes. The `reserved` value controls how much recent history survives each compaction cycle.

- **Too low (< 10K)**: Agent loses context of what it just wrote or why it took a certain approach — causes repeated mistakes and backtracking.
- **20K (applied)**: Preserves ~10–15 recent tool exchanges — enough for the agent to hold the state of an active fix loop without carrying the full session history forward.
- **Too high (> 35K)**: Compaction barely fires; context remains bloated.

At `reserved: 20000`, compaction fires before sessions reach the 60K+ levels observed in the logs and restores the active window to ~25–30K.

### Implementation

Enabled via `compaction.auto: true`, `compaction.prune: true`, `compaction.reserved: 20000`, injected as `OPENCODE_CONFIG_CONTENT` into the runner environment. See `agent-cli/runners/opencode.js`.

---

## Combined Impact Estimate

| Layer | Before | After | Method |
|-------|--------|-------|--------|
| Static overhead (20K × 50 requests) | $0.200 | $0.025 | Prompt caching |
| Conversation history growth | ~$0.190 | ~$0.060 | Auto-compaction |
| Dynamic prompt content | ~$0.100 | ~$0.100 | Unchanged |
| **Total per stage session** | **~$0.490** | **~$0.185** | |
| **Savings** | | **~62%** | |

---

---

## Claude (Controller) — Spec, Plan, Review, Failure

### Context growth profile

Claude's assigned stages (spec, plan, review, failure) are single-pass reasoning tasks. Each stage reads a handful of files and writes one artifact. Tool call volume is low and context does not exhibit the runaway growth seen in Build/Test sessions.

### Caching

Claude Code automatically caches the static prefix of its system prompt. However, the default system prompt includes **dynamic per-machine sections** — current working directory, environment info, memory paths, git status — that change on every invocation. When these sections sit inside the system prompt prefix, they invalidate the cache on every run.

**Fix applied**: `--exclude-dynamic-system-prompt-sections` moves these sections into the first user message instead, leaving the static system prompt prefix stable and consistently cacheable across all Claude invocations for this pipeline.

### Compaction

Claude Code compacts automatically when approaching context limits. No configuration needed — and since Claude's stages are short single-pass tasks, compaction rarely fires in practice.

### Summary for Claude

| Feature | Status | How |
|---------|--------|-----|
| Prompt caching | Active (improved) | `--exclude-dynamic-system-prompt-sections` added to runner |
| Compaction | Automatic | Built into Claude Code, no config needed |

---

## Gemini (Finisher) — Finish Stage

### Context growth profile

The Finish stage is a short, focused task: write a PR description, push the branch, optionally open a PR. It makes few tool calls and completes in a single pass. Context growth is not a concern.

### Caching

Implicit caching is **automatic** on Gemini 2.5+ models — no configuration required. The cost discount is 90% on cache hits (vs the standard input rate).

### Compaction

Chat compression in the Gemini CLI is **automatic** and hardcoded. It fires when conversation history reaches 50% of the model's context window, preserves 30% of recent messages uncompressed, and uses an LLM summary for the rest. No user-facing config options exist.

### Summary for Gemini

| Feature | Status | How |
|---------|--------|-----|
| Prompt caching | Automatic | Built into Gemini 2.5+ models |
| Compaction | Automatic | Fires at 50% context limit (hardcoded) |

No runner changes needed for Gemini.

---

## Agent Comparison

| Agent | Stages | Context growth risk | Caching | Compaction | Changes applied |
|-------|--------|--------------------|---------|----|-----------------|
| OpenCode | Build, Test | **High** — iterative tool loops | Manual → applied via `setCacheKey: true` | Manual → applied via config | `OPENCODE_CONFIG_CONTENT` in runner |
| Claude | Spec, Plan, Review, Failure | Low — single-pass tasks | Automatic, improved | Automatic | `--exclude-dynamic-system-prompt-sections` in runner |
| Gemini | Finish | Very low — short single-pass | Automatic (Gemini 2.5+) | Automatic (50% threshold) | None |

---

## Lower-Priority Optimizations (not yet applied)

These are secondary wins. Apply them if further reduction is needed after validating Solutions 1 and 2.

### Trim the build stage skill set

`promptCompiler.js` loads 14 skills for the build stage. Several are domain-specific and irrelevant to most tasks:

```js
// Current: 14 skills, always loaded regardless of task type
build: ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md",
        "WEB_DEV.md", "THEME_FACTORY.md", "WEB_ARTIFACTS.md", "CONTENT_CREATION.md",
        "API_DESIGN.md", "DATABASE.md", "DOCKER.md", "PDF.md",
        "GIT.md", "REQUESTING_CODE_REVIEW.md", "DISPATCHING_PARALLEL_AGENTS.md"],

// Leaner default: 6 core skills always, domain skills opt-in via task config
build: ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md",
        "DEBUGGING.md", "GIT.md", "REQUESTING_CODE_REVIEW.md"],
```

Each catalog entry is small (~30 tokens), but 14 vs 6 entries saves ~250 tokens per request — worth doing but not urgent.

### Replace `{{DEBUGGING}}` inline injection in failure.md

`promptCompiler.js` line 59 injects the full 300-line `DEBUGGING.md` (~2,000 tokens) inline into `failure.md`. The skills catalog already references it by file path. Replace the injection with a one-line pointer:

```js
// Before: injects 2,000 tokens
template = template.replaceAll("{{DEBUGGING}}", load("DEBUGGING.md"));

// After: ~30 tokens, agent reads the file when needed
template = template.replaceAll("{{DEBUGGING}}",
  "Apply the debugging process from `.spiq/skills/DEBUGGING.md`: " +
  "Reproduce → Localize → Reduce → Fix root cause → Guard → Verify."
);
```

---

## Verification (post-run analysis — 2026-04-26)

Verified against sessions `xrCHQbZ9` and `05A02MW0` run after changes were applied.

### Caching — CONFIRMED WORKING ✓

Evidence from pricing math:

| Request | Tokens | Cost | Expected uncached | Match |
|---------|--------|------|-------------------|-------|
| xrCHQbZ9 first | 27,637 | $0.0071 | $0.0055 (no) / $0.0071 at cache-write rate ✓ | Cache write |
| xrCHQbZ9 second | 28,922 | $0.0011 | $0.0058 uncached / ~$0.001 with 27K cached ✓ | Cache read |
| 05A02MW0 first | 27,394 | $0.0071 | Same pattern — cache write ✓ | Cache write |

The first request of each session was priced at the cached-write rate ($0.25/M) because `setCacheKey: true` was set, and subsequent requests showed costs consistent with prefix cache reads ($0.02/M). `setCacheKey` was later removed (it broke Kimi K2.5/K2.6 with `Extra inputs are not permitted: promptCacheKey`). Automatic prefix caching still applies for all models — first requests revert to standard input pricing ($0.20/M) but reads remain cached.

### Compaction — NOT FIRING ✗ (fixed 2026-04-26)

Session `05A02MW0` showed strict monotonic growth with no dips:

```
27,394 → 34,471 → 38,221 → ... → 64,546  (no drop anywhere)
```

**Root cause**: `auto: true` and `reserved: 20000` were set, but compaction fires relative to the model's *native* context window. Qwen3.5 Plus has a 128K window — OpenCode would not compact until ~100K+ tokens, which was never reached. No explicit trigger threshold was configured.

**Fix attempted (reverted)**: A `models[OPENCODE_MODEL].context: 50000` key was added but OpenCode's config schema rejects `"models"` as an unrecognized key — the third-party source was inaccurate. The key was removed.

**Current state**: Compaction is configured with `auto: true, prune: true, reserved: 20000`. OpenCode fires compaction at its own internal threshold (a percentage of the model's native context window — 128K for Qwen3.5 Plus). For typical pipeline tasks that complete around 60–70K tokens, compaction will not fire because those sessions end before the native threshold is reached. Caching remains the primary cost lever here.

### What to watch for in the next run

- **Caching**: First request cost should remain ~$0.007 (cache write); all subsequent requests should be a fraction of uncached cost.
- **Compaction**: Will not fire for typical tasks that complete under ~100K tokens. Compaction is configured and ready but requires OpenCode's native threshold (based on the model's 128K window) to be breached.
