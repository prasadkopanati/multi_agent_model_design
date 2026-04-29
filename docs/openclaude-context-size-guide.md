# OpenClaude Context Size: Tool Definitions Problem and Fix

## Background

OpenClaude is an open-source fork of Claude Code that supports OpenAI-compatible APIs, Gemini,
Ollama, and local inference servers (e.g. llama.cpp). When used as an executor in the
agenticspiq pipeline, it is invoked in non-interactive print mode (`-p`) against a compiled
stage prompt.

Like Claude Code, OpenClaude injects a large built-in system prompt before every request. This
system prompt includes full JSON schema descriptions for every tool it knows about — `Bash`,
`Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Agent`, `TodoRead`,
`TodoWrite`, notebook tools, and more. Each tool description with its parameter schemas can
cost 1,000–3,000 tokens. With the full tool set, the system prompt alone consumed **~35,000
tokens** per request.

---

## The Symptom

When using a local llama.cpp model as the openclaude backend, the build agent appeared to
start up and read skill files — but never produced any output files (no `index.html`,
`style.css`, `script.js`, etc.).

The llama.cpp server log confirmed the request size:

```
slot update_slots: id 0 | task 750 | new prompt, n_ctx_slot = 262144, n_tokens = 36232
```

The compiled build stage prompt itself is only **~1,200 tokens** (build.md template +
skills catalog). The remaining ~35,000 tokens were OpenClaude's built-in system prompt
describing tools the executor doesn't need.

### Why This Causes Failures

Even when the model's context window is large (262K in the log above), an oversized system
prompt causes two problems:

1. **Attention dilution** — the actual task instructions are buried in 35K tokens of
   irrelevant tool schemas. The model processes them but gives them proportionally less
   weight, degrading instruction-following quality.

2. **Slow processing** — each request requires the model to prefill ~35K tokens before
   generating a single output token. On modest hardware this can take tens of seconds per
   turn, and the KV cache must hold all of it in memory.

The model was technically capable of producing output; it just couldn't reliably attend to
the right parts of the prompt given the noise volume.

---

## The Fix: `--tools` Flag

OpenClaude's `--tools` flag controls which tools are described in the system prompt. By
specifying only the tools an executor stage actually uses, the system prompt size drops
dramatically.

**Change in `agent-cli/runners/openclaude.js`:**

```js
const EXECUTOR_TOOLS = "Bash,Read,Write,Edit,Glob,Grep";

const result = spawnSync("openclaude", [
  "--dangerously-skip-permissions",
  "-p", "Execute the stage instructions above.",
  "--model", model,
  "--output-format", "json",
  "--tools", EXECUTOR_TOOLS,   // ← added
], { ... });
```

**Result:**

| | Prompt tokens |
|---|---|
| Before (`--tools` absent) | ~36,000 |
| After (`--tools "Bash,Read,Write,Edit,Glob,Grep"`) | ~21,800 |
| **Saved** | **~14,200 tokens** |

The llama.cpp log after the fix:

```
slot update_slots: id 0 | task 965 | new prompt, n_ctx_slot = 262144, n_tokens = 21795
```

After this change the build agent began producing files and executing tasks as expected.

### Tool Selection Rationale

The six tools chosen cover everything a build/test/fix executor needs:

| Tool | Purpose |
|---|---|
| `Bash` | Run commands — git, npm, test runners, linters |
| `Read` | Read existing source files |
| `Write` | Create new files |
| `Edit` | Modify existing files with targeted edits |
| `Glob` | Find files by pattern |
| `Grep` | Search file contents |

`WebFetch`, `WebSearch`, `Agent`, `TodoRead`, `TodoWrite`, and notebook tools are never
needed by an executor and are excluded.

---

## Diagnosing Context Size

To measure what OpenClaude is actually sending to the model, watch the llama.cpp server
log during a run:

```
slot update_slots: id 0 | task NNN | new prompt, n_ctx_slot = ..., n_tokens = XXXX
```

`n_tokens` is the total prompt token count including system prompt + user message. Compare
this against:

```bash
# Approximate size of the compiled stage prompt alone
node -e "
const { compilePrompt } = require('./orchestrator/promptCompiler');
const p = compilePrompt('build', { selectedSkills: [] });
console.log('chars:', p.length, '  approx tokens:', Math.round(p.length / 4));
"
```

The difference between `n_tokens` and this estimate is OpenClaude's system prompt overhead.

---

## Further Reductions (Not Yet Applied)

### 1. `--bare` flag (~2–5K additional tokens saved)

```js
"--bare",
```

Prevents OpenClaude from loading:
- CLAUDE.md files found in the workspace (can be large if the project has one)
- Auto-memory from previous sessions
- Hooks, LSP, plugin sync, attribution, background prefetches

`--bare` sets `CLAUDE_CODE_SIMPLE=1` internally, which simplifies the base system prompt
further. Low risk for executor stages — none of these features are needed.

**Caution:** `--bare` enforces strict API-key-only auth for Anthropic. For local
OpenAI-compatible servers this has no effect since those use their own credential mechanism.

### 2. Trim to four tools (`Bash,Read,Write,Edit`) (~1–2K additional tokens saved)

`Glob` and `Grep` are convenience wrappers around `find` and `grep`, which are accessible
via `Bash`. Removing them saves two more tool schema descriptions.

```js
const EXECUTOR_TOOLS = "Bash,Read,Write,Edit";
```

Trade-off: the model may write slightly more verbose bash invocations for file discovery.

### 3. `--disable-slash-commands` (~1K additional tokens saved)

Removes the skill invocation system description from the system prompt. The executor doesn't
use slash commands.

```js
"--disable-slash-commands",
```

### 4. Custom `--system-prompt` (aggressive — ~10–15K additional tokens saved)

Replacing OpenClaude's entire base system prompt with a minimal hand-crafted one would give
maximum control. However, this requires manually maintaining tool descriptions and risks
breaking tool call formatting if the model expects a specific schema format. Not recommended
unless hitting a hard token budget.

---

## Summary

| Change | Tokens saved | Risk |
|---|---|---|
| `--tools "Bash,Read,Write,Edit,Glob,Grep"` ✓ applied | ~14,200 | None |
| `--bare` | ~2,000–5,000 | Low |
| Drop Glob + Grep | ~1,000–2,000 | Low |
| `--disable-slash-commands` | ~1,000 | None |
| Custom `--system-prompt` | ~10,000–15,000 | High |

The applied fix (`--tools`) alone reduced the prompt from ~36K to ~21K tokens, which was
sufficient to restore correct executor behaviour. The remaining options are available if the
target model has a tighter context budget.
