# Model Selection Guide

> Last updated: 2026-04-26

This guide documents the recommended model choices for each agent stage in the multi-agent pipeline, along with rationale and configuration instructions.

---

## Pipeline Overview

| Stage | Agent | Env Var | Current Default |
|-------|-------|---------|-----------------|
| Spec | Claude (Controller) | `CLAUDE_MODEL` | `sonnet` |
| Plan | Claude (Controller) | `CLAUDE_MODEL` | `sonnet` |
| Build | OpenCode (Executor) | `OPENCODE_MODEL` | `opencode/qwen3.5-plus` |
| Test | OpenCode (Executor) | `OPENCODE_MODEL` | `opencode/qwen3.5-plus` |
| Review | Claude (Controller) | `CLAUDE_MODEL` | `sonnet` |
| Finish | Gemini (Finisher) | `GEMINI_MODEL` | `gemini-2.5-flash-preview` |
| Failure | Claude (Controller) | `CLAUDE_MODEL` | `sonnet` |

---

## Anthropic (Claude) — Spec, Plan, Review

These three stages are reasoning-heavy: spec writing requires deep requirements analysis, planning requires dependency ordering and task decomposition, and review requires five-axis judgment (correctness, readability, architecture, security, performance). Invest in the strongest model here — errors in spec and plan propagate through the entire pipeline.

### Recommended Models

| Rank | Model ID | Notes |
|------|----------|-------|
| 1 | `claude-opus-4-7` | Most capable; best for complex spec writing and architectural review |
| 2 | `claude-sonnet-4-6` | Current default (`sonnet`); strong reasoning at lower cost and latency |
| 3 | `claude-opus-4-5` | Previous Opus generation; capable fallback if 4-7 cost is a concern |
| 4 | `claude-haiku-4-5-20251001` | Only viable for lightweight review or rapid plan validation; too constrained for spec |

### Stage-by-Stage Recommendation

| Stage | Recommended Model | Rationale |
|-------|-------------------|-----------|
| `AGENT_SPEC` | `claude-opus-4-7` | Spec errors cascade — invest here |
| `AGENT_PLAN` | `claude-sonnet-4-6` | Task decomposition is structured; Sonnet handles it well at lower cost |
| `AGENT_REVIEW` | `claude-opus-4-7` | Security and architecture review benefit from Opus's deeper judgment |
| `AGENT_FAILURE` | `claude-sonnet-4-6` | Quick root-cause summaries don't need Opus-level reasoning |

### Configuration

```bash
# .env — per-stage model overrides not yet supported; single model applies to all Claude stages
CLAUDE_MODEL=opus   # shorthand; maps to latest Opus
# or
CLAUDE_MODEL=claude-opus-4-7   # full model ID
```

> **Note:** If cost is a constraint, use `claude-sonnet-4-6` for all Claude stages — it handles plan and failure analysis well. Reserve `claude-opus-4-7` for spec and review only when pipeline quality is the priority.

---

## OpenCode — Build, Test

Build and Test stages involve code generation, iterative fix loops, test writing, and verification. These stages prioritize coding precision, ability to follow constrained diffs, and reliability in agentic loops.

### Recommended Models

| Rank | Model ID | Best Stage | Notes |
|------|----------|------------|-------|
| 1 | `opencode/gpt-5.3-codex` | Build | Codex-optimized; best precision for spec-to-code translation and constrained diffs |
| 2 | `opencode/gpt-5.1-codex` | Test | Proven codex variant; strong at test pattern following and fix loops |
| 3 | `opencode/qwen3.6-plus` | Both | Upgraded successor to current default; strong balance of coding performance and cost |
| 4 | `opencode/deepseek-v4-pro` | Build | Deep reasoning for complex build tasks and failure recovery with large context |
| 5 | `opencode/mimo-v2.5-pro` | Test | Tuned for agentic coding loops; strong at iterative test-fix cycles |
| 6 | `opencode/kimi-k2.6` | Both | Latest Kimi with 3× usage limits; reliable pattern-follower for build and test |

### Stage-by-Stage Recommendation

| Stage | Recommended Model | Rationale |
|-------|-------------------|-----------|
| `AGENT_BUILD` | `opencode/gpt-5.3-codex` | Codex variants are designed for precise, constrained code generation |
| `AGENT_TEST` | `opencode/gpt-5.1-codex` | Codex + test pattern strength; use `opencode/mimo-v2.5-pro` as fallback for long fix loops |

### Configuration

```bash
# .env
OPENCODE_MODEL=opencode/gpt-5.3-codex
```

> **Cost-effective default:** `opencode/qwen3.6-plus` is a direct upgrade to the current `qwen3.5-plus` default. Use it as a single model for both Build and Test if you want a simple, affordable configuration.

---

## OpenClaude — Alt Controller (any stage)

OpenClaude is a drop-in alternative to Claude Code. It speaks the OpenAI-compatible API, so it can route to Gemini, Ollama, local llama.cpp servers, or any OpenAI-compatible endpoint. Assign it to any stage by setting the corresponding `AGENT_*` variable to `openclaude`.

### When to Use OpenClaude

| Scenario | Notes |
|----------|-------|
| Local model (llama.cpp, Ollama) | Set `OPENCLAUDE_MODEL` to the local model name; point base URL to localhost |
| Alternative cloud provider | Useful for avoiding rate limits on the Claude API or mixing providers |
| Cost reduction on lighter stages | Run plan/failure analysis on a smaller local model |

### Recommended Models

| Rank | Model ID | Notes |
|------|----------|-------|
| 1 | `sonnet` | Default; maps to Claude Sonnet 4.6 via OpenAI-compatible endpoint |
| 2 | `opus` | Max reasoning via OpenAI-compatible endpoint |
| 3 | _(any Ollama tag)_ | e.g. `qwen3:30b-a3b`, `llama3.3:70b` — see openclaude-context-size-guide.md |

### Configuration

```bash
# .env
OPENCLAUDE_MODEL=sonnet       # or a local model tag

# Assign openclaude to a stage (validated: claude | opencode | gemini | openclaude)
AGENT_BUILD=openclaude
```

> See [openclaude-context-size-guide.md](openclaude-context-size-guide.md) for token optimisation when running against local models.

---

## Gemini — Finish

The Finish stage handles PR creation, branch management, and delivery cleanup. It is largely templated work — PR body generation, branch operations, merge decisions — where reliability and speed matter more than maximum reasoning capability.

### Recommended Models

| Rank | Model ID | Notes |
|------|----------|-------|
| 1 | `gemini-2.5-flash` | Fast, cost-effective, handles routine PR/merge/cleanup reliably — best production default |
| 2 | `gemini-2.5-pro` | Best reasoning for nuanced PR descriptions and edge-case delivery logic |
| 3 | `gemini-2.5-flash-preview` | Current default; preview track gives early access to improvements |
| 4 | `gemini-2.0-flash` | Stable, proven, lower cost — good fallback if 2.5 is unavailable or unstable |

### Stage-by-Stage Recommendation

| Stage | Recommended Model | Rationale |
|-------|-------------------|-----------|
| `AGENT_FINISH` | `gemini-2.5-flash` | Speed and cost matter most here; Finish is templated work |

### Configuration

```bash
# .env
GEMINI_MODEL=gemini-2.5-flash
FINISH_ACTION=pr   # pr | merge | keep | discard
```

> Use `gemini-2.5-pro` only if you need richer PR descriptions or the Finish stage is handling complex merge decisions.

---

## Recommended Production Configuration

Balanced quality and cost across all stages:

```bash
# .env

# Agent routing
AGENT_SPEC=claude
AGENT_PLAN=claude
AGENT_BUILD=opencode
AGENT_TEST=opencode
AGENT_REVIEW=claude
AGENT_FINISH=gemini
AGENT_FAILURE=claude

# Model selection
CLAUDE_MODEL=claude-opus-4-7        # Spec + Review; use claude-sonnet-4-6 to reduce cost
OPENCODE_MODEL=opencode/gpt-5.3-codex  # Build; swap to opencode/qwen3.6-plus for lower cost
GEMINI_MODEL=gemini-2.5-flash       # Finish

# Finish action
FINISH_ACTION=pr
```

### Budget-Conscious Alternative

```bash
CLAUDE_MODEL=claude-sonnet-4-6
OPENCODE_MODEL=opencode/qwen3.6-plus
GEMINI_MODEL=gemini-2.5-flash
```

---

## Model Decision Tree

```
Choosing a model for a stage?
    │
    ├── High reasoning required? (spec, review)
    │     └── Use claude-opus-4-7
    │
    ├── Structured reasoning, cost-sensitive? (plan, failure)
    │     └── Use claude-sonnet-4-6
    │
    ├── Code generation, constrained diffs? (build)
    │     └── Use opencode/gpt-5.3-codex
    │         └── Budget option: opencode/qwen3.6-plus
    │
    ├── Test writing, fix loops? (test)
    │     └── Use opencode/gpt-5.1-codex
    │         └── Long loops: opencode/mimo-v2.5-pro
    │
    └── PR creation, delivery, cleanup? (finish)
          └── Use gemini-2.5-flash
              └── Complex PRs: gemini-2.5-pro
```

---

## Sources

- [OpenCode Models Documentation](https://opencode.ai/docs/models/)
- [OpenCode Zen — Curated Models](https://opencode.ai/docs/zen/)
- [OpenCode Go — Low Cost Models](https://opencode.ai/go)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
