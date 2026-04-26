# Context Optimization Guide

> Last updated: 2026-04-26

This guide documents the root causes of context bloat in OpenCode (Executor) sessions, the cost impact, and the solutions applied.

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

Enabled via `setCacheKey: true` in the `opencode` provider options, injected as `OPENCODE_CONFIG_CONTENT` into the runner environment. See `agent-cli/runners/opencode.js`.

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

## Verification

After these changes, observe the next session's usage logs:

1. **Caching active**: Input token cost should drop sharply after the first request. Some providers report `cached_tokens` alongside `input_tokens` in API responses — check OpenCode logs for this.

2. **Compaction active**: Input token counts should no longer grow monotonically. Expect a sudden dip (compaction fired) followed by slow growth resuming from a lower baseline (~25–30K), rather than reaching 60K+.

3. **Cost check**: Total session input tokens should be materially lower than the ~2.5M observed in session `NSUv0Nz7`.
