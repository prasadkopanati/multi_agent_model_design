# Adding a New Agent to agenticspiq

This guide walks through every file you need to touch to add a new agent to the system, using `openclaude` as the worked example throughout.

---

## What Is an Agent?

In this system an agent is a **CLI binary + a runner module + an env var**:

| Piece | Purpose |
|-------|---------|
| Binary | The external CLI tool that processes the prompt (e.g. `claude`, `opencode`, `openclaude`) |
| Runner module | `agent-cli/runners/<name>.js` — spawns the binary, passes the prompt, writes JSON output |
| Env var | `<NAME>_MODEL` — controls which model the binary selects at runtime |

The orchestrator calls agents by name via `agent-cli/agent-cli.js`. That dispatcher maps a name string to the corresponding runner, so every new agent must be registered there and in all the supporting infrastructure files.

---

## Files to Update

There are **6 files** to update and **1 new file** to create.

### 1. Create `agent-cli/runners/<name>.js`

This is the only new file. Model it on the runner that most closely resembles your agent. For `openclaude`, the `claude.js` runner is the right template because both use the same CLI flag conventions.

**`agent-cli/runners/openclaude.js`** (new file):

```js
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin");

function runOpenClaude(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const model = process.env.OPENCLAUDE_MODEL || "sonnet";
  const result = spawnSync("openclaude", [
    "--dangerously-skip-permissions",
    "-p", "Execute the stage instructions above.",
    "--model", model,
    "--output-format", "json",
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH:             `${AGENTICSPIQ_BIN}${path.delimiter}${process.env.PATH}`,
      GIT_AUTHOR_NAME:  "OpenClaude Agent",
      GIT_AUTHOR_EMAIL: "claude-agent@agenticspiq.local",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`openclaude exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenClaude };
```

Key things to change for a different agent:
- The binary name in `spawnSync("openclaude", ...)` → your binary name
- The env var read: `process.env.OPENCLAUDE_MODEL` → `process.env.<NAME>_MODEL`
- The error message string
- The export name

> **Note on flags:** The flags above (`--dangerously-skip-permissions`, `--output-format json`, etc.) are Claude Code / OpenClaude-specific. For a genuinely different binary (e.g. `opencode`, `gemini`) you will need to look at the existing runner for that binary to understand what flags it uses — they differ significantly.

---

### 2. `agent-cli/agent-cli.js` — dispatcher

Three additions:

**a) Import the new runner** (after the existing runner imports):
```js
const { runOpenClaude } = require("./runners/openclaude");
```

**b) Update the usage error string** (line 24) to include the new agent name:
```js
console.error("Usage: agent-cli --agent <claude|opencode|gemini|openclaude> ...");
```

**c) Add a dispatch branch** before the final `else`:
```js
} else if (agent === "openclaude") {
  runOpenClaude(stage, input || defaultInput, output || defaultOutput, workspace);
}
```

---

### 3. `utils/config-test.js` — configuration validator

Four additions:

**a) Import:**
```js
const { runOpenClaude } = require("../agent-cli/runners/openclaude");
```

**b) Default model** in `MODEL_DEFAULTS`:
```js
openclaude: "sonnet",
```

**c) Env var name** in `MODEL_VARS`:
```js
openclaude: "OPENCLAUDE_MODEL",
```

**d) Runner reference** in `RUNNERS`:
```js
openclaude: runOpenClaude,
```

`config-test.js` uses these three maps to verify that each `AGENT_*`-assigned agent is reachable. If your agent needs special binary-availability-only handling (like `opencode` does at line 72), add a conditional branch in the `for (const agent of agentTypes)` loop.

---

### 4. `utils/doctor.js` — system health check

Two additions:

**a) Add the env var to `REQUIRED_ENV`** so `.env` validation catches a missing value:
```js
const REQUIRED_ENV = ["CLAUDE_MODEL", "OPENCODE_MODEL", "GEMINI_MODEL", "OPENCLAUDE_MODEL"];
```

**b) Add a tool check to `TOOLS`** so `doctor` confirms the binary is installed:
```js
{ name: "openclaude", cmd: ["openclaude", "--version"] },
```

---

### 5. `.env` — model selection

Add a model variable alongside the others:
```
# OpenClaude model (openclaude --model <value>)
OPENCLAUDE_MODEL=sonnet
```

To route a pipeline stage to the new agent, set the corresponding `AGENT_*` variable:
```
AGENT_SPEC=openclaude
AGENT_PLAN=openclaude
```

All possible stage keys: `AGENT_SPEC`, `AGENT_PLAN`, `AGENT_BUILD`, `AGENT_TEST`, `AGENT_REVIEW`, `AGENT_FINISH`, `AGENT_FAILURE`.

---

### 6. `CLAUDE.md` — project documentation

Three spots:

- **Agent table** (System Overview section): add a row for the new agent with its role, env var, and default model.
- **Key Files table**: add a row for `agent-cli/runners/<name>.js`.
- **Agent Contract section**: update the `--agent` usage hint.
- **Model Configuration table**: add a row for the new `<NAME>_MODEL` env var.

---

## Checklist Summary

```
[ ] agent-cli/runners/<name>.js          — new runner file
[ ] agent-cli/agent-cli.js               — import + usage string + dispatch branch
[ ] utils/config-test.js                 — import + MODEL_DEFAULTS + MODEL_VARS + RUNNERS
[ ] utils/doctor.js                      — REQUIRED_ENV + TOOLS entry
[ ] .env                                 — <NAME>_MODEL variable
[ ] CLAUDE.md                            — agent table + key files + usage hint + model table
```

---

## Verification

After making the changes, run:

```bash
# 1. Verify the dispatch wiring
node agent-cli/agent-cli.js --agent openclaude --stage spec --workspace /tmp/test-ws

# 2. Verify binary detection
node utils/doctor.js

# 3. Verify config-test picks up the new agent
#    Set AGENT_SPEC=openclaude in .env first, then:
node utils/config-test.js

# 4. Confirm unknown-agent guard still works
node agent-cli/agent-cli.js --agent badname --stage spec
# → should print: Unknown agent: badname
```

The binary check in `doctor.js` will show a failure (`✗`) if the binary is not on PATH — that is expected and correct behavior for an optional agent that is not installed. The pipeline itself will throw at runtime with a clear error if it tries to invoke an agent whose binary is missing.

---

## Notes

- The orchestrator's `DEFAULT_AGENTS` (in `orchestrator/orchestrator.js`) does **not** need to change. Default stage assignments stay as-is; the new agent is an opt-in choice via `.env`.
- `orchestrator/workspace-config.js`, `promptCompiler.js`, and `retry.js` have no agent-name references and do not need to change.
- OpenClaude is an open-source Claude Code fork (`@gitlawb/openclaude`) that supports OpenAI-compatible APIs, Gemini, Ollama, GitHub Models, and other providers. Because it shares Claude Code's CLI flag conventions, its runner is an exact copy of `claude.js` with only the binary name and env var changed.
