# `agenticspiq changemodel` Guide

## Overview

Model configuration in agenticspiq is stored in `.env`. Before this command existed, changing which model an agent uses — or which agent handles a pipeline stage — required manually opening `.env`, knowing the exact variable name, and editing the right line.

The `changemodel` command replaces that friction with a first-class CLI interface that has two modes:

- **Interactive wizard** — a numbered menu showing all current values, with prompts to change any of them
- **Non-interactive one-liner** — direct assignment for scripting and quick changes

---

## Usage

### Interactive mode

```bash
agenticspiq changemodel
agenticspiq --changemodel
```

Launches the wizard. All 12 configurable items are shown with their current values. Select one by number, enter the new value, and it is written to `.env` immediately. The wizard loops so multiple changes can be made in a single session. Quit with `q` or press Enter at the selection prompt.

### Non-interactive mode

```bash
# Change a model — use the friendly agent name as the key
agenticspiq changemodel claude=opus
agenticspiq changemodel opencode=opencode/qwen3.5-plus
agenticspiq changemodel gemini=gemini-2.5-pro
agenticspiq changemodel openclaude=sonnet

# Change a stage-to-agent assignment
agenticspiq changemodel build=openclaude
agenticspiq changemodel plan=claude
agenticspiq changemodel finish=gemini

# Full env var names are also accepted
agenticspiq changemodel CLAUDE_MODEL=opus
agenticspiq changemodel AGENT_BUILD=openclaude
agenticspiq changemodel GEMINI_MODEL=auto
```

The command prints a confirmation line and exits 0 on success, or exits 1 with an error message on invalid input.

---

## What Can Be Changed

The command manages 12 settings, grouped into two categories:

### Models — which model each agent CLI passes to its binary

| Alias | Env Var | What it controls |
|-------|---------|-----------------|
| `claude` | `CLAUDE_MODEL` | Model passed to the `claude` binary |
| `opencode` | `OPENCODE_MODEL` | Model passed to the `opencode` binary |
| `gemini` | `GEMINI_MODEL` | Model passed to the `gemini` binary |
| `openclaude` | `OPENCLAUDE_MODEL` | Model passed to the `openclaude` binary |

Model values are free-form strings — any non-empty value is accepted. Examples: `sonnet`, `opus`, `gemini-2.5-pro`, `opencode/qwen3.5-plus`, `auto`.

### Stage → Agent — which agent runs each pipeline stage

| Alias | Env Var | Default |
|-------|---------|---------|
| `spec` | `AGENT_SPEC` | `claude` |
| `plan` | `AGENT_PLAN` | `claude` |
| `build` | `AGENT_BUILD` | `opencode` |
| `test` | `AGENT_TEST` | `opencode` |
| `review` | `AGENT_REVIEW` | `claude` |
| `fix` | `AGENT_FIX` | `opencode` |
| `finish` | `AGENT_FINISH` | `gemini` |
| `failure` | `AGENT_FAILURE` | `claude` |

Agent values are validated — only `claude`, `opencode`, `gemini`, and `openclaude` are accepted.

---

## Interactive Wizard Example

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  agenticspiq — model configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Models
  [ 1]  claude       CLAUDE_MODEL        = sonnet
  [ 2]  opencode     OPENCODE_MODEL      = opencode/glm-5.1
  [ 3]  gemini       GEMINI_MODEL        = auto
  [ 4]  openclaude   OPENCLAUDE_MODEL    = Qwen3dot5-27B-Opus46

  Stage → Agent
  [ 5]  spec         AGENT_SPEC          = claude
  [ 6]  plan         AGENT_PLAN          = claude
  [ 7]  build        AGENT_BUILD         = openclaude
  [ 8]  test         AGENT_TEST          = openclaude
  [ 9]  review       AGENT_REVIEW        = claude
  [10]  fix          AGENT_FIX           = openclaude
  [11]  finish       AGENT_FINISH        = gemini
  [12]  failure      AGENT_FAILURE       = claude

  Select item to change [1-12, or q to quit]: 1
  CLAUDE_MODEL (current: sonnet): opus
  ✓ CLAUDE_MODEL = opus

  [table redisplays with updated value]
  Select item to change [1-12, or q to quit]: q
  Configuration saved to .env
```

---

## How `.env` Is Updated

`updateEnvFile(envPath, key, value)` in `utils/changemodel.js`:

1. Reads the entire `.env` file as a string
2. Searches for an existing uncommented assignment line using `/^KEY=.*$/m`
3. If found — replaces that line in place, preserving all comments, blank lines, and surrounding content
4. If not found — appends `KEY=value` at the end of the file
5. Writes the file back

The regex only matches uncommented lines (no leading `#`), so commented-out alternatives like `#GEMINI_MODEL=gemini-2.5-flash-preview` are not touched.

---

## Error Handling

| Input | Error |
|-------|-------|
| `agenticspiq changemodel spec=badagent` | `Error: Invalid agent "badagent". Valid: claude, opencode, gemini, openclaude` |
| `agenticspiq changemodel foo=bar` | `Error: unknown key "foo". Run agenticspiq changemodel to see configurable items.` |
| `agenticspiq changemodel claude=` | `Error: Value cannot be empty.` |
| `agenticspiq changemodel noequals` | `Error: expected format key=value, got "noequals"` |

---

## Files Changed by This Feature

| File | Change |
|------|--------|
| `utils/changemodel.js` | New utility — `CONFIGURABLE` map, `updateEnvFile`, `readEnvValues`, `runInteractive`, `runDirect`, exported `changeModel` |
| `bin/agenticspiq.js` | Added `changemodel` / `--changemodel` handler block after the `doctor` handler |

---

## Verification

```bash
# Non-interactive: change claude model
agenticspiq changemodel claude=opus
grep "CLAUDE_MODEL=" .env        # → CLAUDE_MODEL=opus

# Non-interactive: via full env var name
agenticspiq changemodel OPENCODE_MODEL=opencode/qwen3.5-plus
grep "OPENCODE_MODEL=" .env       # → OPENCODE_MODEL=opencode/qwen3.5-plus

# Non-interactive: stage assignment
agenticspiq changemodel build=claude
grep "AGENT_BUILD=" .env          # → AGENT_BUILD=claude

# Error: invalid agent
agenticspiq changemodel spec=badagent
# → Error: Invalid agent "badagent". Valid: claude, opencode, gemini, openclaude
# exit code 1

# Error: unknown key
agenticspiq changemodel foo=bar
# → Error: unknown key "foo"
# exit code 1

# Confirm config still valid after changes
agenticspiq check

# Interactive mode
agenticspiq changemodel
# (wizard launches)
```

---

## Future Improvements

### Preset profiles

Named presets that set multiple values in one command:

```bash
agenticspiq changemodel --preset fast
# sets: CLAUDE_MODEL=haiku, AGENT_BUILD=opencode, AGENT_TEST=opencode

agenticspiq changemodel --preset quality
# sets: CLAUDE_MODEL=opus, AGENT_BUILD=claude, AGENT_TEST=claude
```

Presets would be defined in a `changemodel.presets.json` at the project root or as a section in `package.json`, making them team-shareable.

### Show default values alongside current values

The interactive table currently shows the `.env` value. Showing the compiled effective value (env var → `.env` value → hardcoded default) would make it clearer what actually runs when a key is unset:

```
  [ 1]  claude   CLAUDE_MODEL   = sonnet  (default: sonnet)
  [ 3]  gemini   GEMINI_MODEL   = (not set → default: gemini-3-flash-preview)
```

This requires reading the `MODEL_DEFAULTS` from `utils/config-test.js` or a shared constants file.

### Validate model names against known lists

Model values are currently free-form. A per-agent known-model list (even if partial) could warn the user when a value looks wrong:

```bash
agenticspiq changemodel claude=claude-4-typo
# ⚠ "claude-4-typo" is not a known Claude model. Proceed anyway? [y/N]
```

Maintaining the lists would require periodic updates as models are released, so this is opt-in with a `--force` override.

### `agenticspiq changemodel --show` flag

A read-only display mode that prints the current configuration table and exits without prompting, useful for scripting:

```bash
agenticspiq changemodel --show
```

Currently the only way to see all current values is to launch the interactive wizard and immediately quit.

### Apply changes to a specific `.env` path

The command always targets the project-root `.env`. Supporting `--env <path>` would allow managing configuration for multiple workspaces without changing the project default:

```bash
agenticspiq changemodel claude=opus --env /path/to/other-project/.env
```

### Integration with `agenticspiq doctor`

After a `changemodel` call, automatically run a lightweight config validation (equivalent to `agenticspiq check`) and report whether the new configuration is valid, without requiring a separate command.
