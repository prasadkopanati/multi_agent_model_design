# Session Persistence & Prompt Vault Guide

A guide to the session archiving system that records every completed pipeline run — capturing the initial requirement, the winning prompt, and a full session summary — in a human-readable file inside `prompt_vault/`.

---

## Table of Contents

1. [Overview](#overview)
2. [How It Works](#how-it-works)
3. [The prompt_vault Directory](#the-prompt_vault-directory)
4. [Vault File Format](#vault-file-format)
5. [Spec Evolution Detection](#spec-evolution-detection)
6. [Workspace Reset Prompt](#workspace-reset-prompt)
7. [Using the Vault](#using-the-vault)
8. [Implementation Details](#implementation-details)
9. [Future Improvements](#future-improvements)

---

## Overview

Every time `agenticspiq` completes a pipeline run, it automatically archives a session record before exiting. This record answers three questions:

- **What was asked?** — The initial requirement as written in `.spiq/req.md`
- **What actually drove execution?** — The "winning prompt": the structured `SPEC.md` if it meaningfully evolved from the requirement, or the requirement itself if not
- **How did the run go?** — Stage completion, failure counts, retry history, and duration

These records accumulate in `prompt_vault/` at the workspace root and persist across runs, resets, and tool reinstalls.

### Why This Matters

Prompt engineering insight decays. The requirement that produced a clean first-pass build is rarely documented; the spec that navigated three build failures to a passing review is never saved. Over time you lose track of:

- Which phrasings reliably produce clean specs
- How requirements that needed rework differed from requirements that didn't
- What the controller actually built from (often the spec, not the raw requirement)

The vault captures this information automatically, at zero cost to the developer.

---

## How It Works

After the `finish` stage completes and `tasks.json` is updated to `current_stage: "complete"`, the orchestrator runs two steps before exiting:

```
finish stage completes
        │
        ▼
updateCurrentStage("complete")
        │
        ▼
persistSession()              ← always runs, non-fatal
  ├── read req.md + SPEC.md
  ├── detect spec evolution
  ├── build session summary from tasks.json
  └── write prompt_vault/YYYY-MM-DD_HH-MM-SS.md
        │
        ▼
"Clean .spiq/ for next run? [y/N]"
  ├── y → resetWorkspace()
  └── N → leave .spiq/ as-is
        │
        ▼
"✅ Pipeline complete."
```

The archive step is **non-fatal**: if it fails (e.g. disk full, permission error), a warning is printed and the pipeline still exits cleanly. The vault file is always written before the reset prompt, so it exists regardless of the user's answer.

---

## The prompt_vault Directory

`prompt_vault/` lives at the workspace root, alongside `.spiq/`:

```
<workspace>/
├── .spiq/              ← pipeline state (ephemeral, reset between runs)
├── prompt_vault/       ← session records (persistent)
│   ├── 2026-04-28_14-32-07.md
│   ├── 2026-04-29_09-10-00.md
│   └── 2026-04-30_11-45-22.md
└── src/
```

**Why not inside `.spiq/`?**  
`.spiq/` is designed to be ephemeral — the workspace reset clears it, and the finisher agent may clean it up after delivery. The vault is a long-term record and must survive both.

**Why not in `~/.agenticspiq/` or the tool directory?**  
Session records are project-specific. Co-locating them with the project means they travel with the repo, are visible to teammates, and survive tool reinstalls. A developer cloning the repo can review prior sessions without any extra setup.

**Version control:** You can commit `prompt_vault/` to track the project's prompt history, or add it to `.gitignore` if you prefer to keep it local. The scaffold does not make this choice for you.

---

## Vault File Format

Each file is named `YYYY-MM-DD_HH-MM-SS.md` using local time. The format is lexicographically sortable — `ls prompt_vault/` in a terminal gives you chronological order.

### Sections

#### `# Session Record — YYYY-MM-DD HH:MM:SS`

Top-level heading with the completion timestamp.

---

#### `## Initial Requirement`

Verbatim content of `.spiq/req.md` at archive time. This is the raw input as the user wrote it — before any controller interpretation.

---

#### `## Session Summary`

A metadata table followed by an optional failure history:

```
| Field              | Value                                     |
|--------------------|-------------------------------------------|
| Stages completed   | spec → plan → build → test → review → finish |
| Total failures     | 3                                         |
| Failures by stage  | build: 2, test: 1                         |
| Pipeline started   | 2026-04-28 14-20-11                        |
| Pipeline completed | 2026-04-28 14-32-07                        |
| Duration           | 11m 56s                                   |
```

If any failures occurred, a **Failure History** table follows:

```
| # | Stage | Error                                                           | Time     |
|---|-------|-----------------------------------------------------------------|----------|
| 1 | build | TypeError: Cannot read properties of undefined (reading 'map') | 14:22:04 |
| 2 | build | SyntaxError: Unexpected token '<' in JSON at position 0         | 14:25:31 |
| 3 | test  | AssertionError: expected 200 to equal 201                       | 14:29:18 |
```

Error messages are truncated at 80 characters. Full error records are in `.spiq/artifacts/failures/`.

---

#### `## Winning Prompt (SPEC.md)` or `## Spec Evolution Note`

**When SPEC.md meaningfully evolved from req.md:** This section contains the verbatim SPEC.md with a note showing the length ratio and confirming structural sections were detected. This is the effective prompt — the controller's structured interpretation that the executor actually built from.

**When SPEC.md did not meaningfully evolve:** This section is replaced by a `## Spec Evolution Note` explaining that the initial requirement served as the effective prompt. SPEC.md is omitted to avoid duplicating near-identical content.

**When SPEC.md is missing at archive time:** A note is written and the section is skipped.

---

#### `## Metadata`

A JSON block for machine parsing:

```json
{
  "workspace": "/absolute/path/to/workspace",
  "vault_file": "2026-04-28_14-32-07.md",
  "spec_evolved": true,
  "spec_length_ratio": 2.3
}
```

| Field | Description |
|---|---|
| `workspace` | Absolute path to the workspace root |
| `vault_file` | Filename of this record |
| `spec_evolved` | `true` if the Winning Prompt section contains SPEC.md |
| `spec_length_ratio` | `spec.length / req.length`, or `null` if either is missing |

---

## Spec Evolution Detection

The "winning prompt" determination uses a two-signal heuristic. **Both signals must pass** for `spec_evolved: true`.

### Signal 1: Length Ratio

```
spec.length / req.length > 1.4
```

The spec must be at least 40% longer than the requirement by character count. This filters out cases where the spec agent made only trivial reformatting changes.

The 1.4× threshold was chosen conservatively: a brief requirement that becomes a moderately detailed spec should pass, but a near-verbatim echo should not.

### Signal 2: Structural Markers

The spec must contain at least 2 of the following H2 headings — the canonical sections that `SPEC_DRIVEN.md` instructs the controller to include:

- `## Objective`
- `## Commands`
- `## Project Structure`
- `## Code Style`
- `## Testing Strategy`
- `## Boundaries`
- `## Success Criteria`
- `## Assumption Register`

This rules out cases where the spec is long but unstructured — e.g., the controller elaborated on the requirement as prose without adding a testable spec.

### Interpreting the Result

| `spec_evolved` | Interpretation |
|---|---|
| `true` | SPEC.md is the prompt that drove the build. The requirement alone would not have been sufficient. |
| `false` | The requirement was clear enough that the spec added little structure. Either is a valid reference for reuse. |
| `spec_length_ratio < 1.0` | The controller wrote a shorter spec than the requirement — unusual; may indicate the requirement had excessive preamble. |

---

## Workspace Reset Prompt

After archiving, the orchestrator asks:

```
Clean .spiq/ for next run? [y/N]
```

**Default is `N`** (press Enter to keep). You must explicitly type `y` to reset.

### What `y` clears

| Cleared | Preserved |
|---|---|
| `tasks.json` → reset to initial state | `req.md` |
| `SPEC.md` | `skills/` directory |
| `tasks/plan.md` | Directory structure + `.gitkeep` files |
| `tasks/todo.md` | |
| `artifacts/output/*.json` | |
| `artifacts/compiled/*.md` | |
| `artifacts/failures/*.json` | |

`req.md` is preserved intentionally: you may want to re-run against the same requirement (e.g., after a failed first attempt, or to compare results with a different model configuration).

### When to answer `y`

- Starting a new, unrelated feature
- Moving to a different task in the same repo
- The prior run produced incorrect artifacts you do not want influencing the next spec stage
- You want a clean slate before sharing the workspace with a teammate

### When to answer `N`

- You want to review the last run's artifacts before starting the next
- Debugging a failure from the prior run (artifacts are still needed)
- Resuming a partially-completed pipeline
- You're not sure — it's always safe to keep artifacts and reset manually later

### Manual reset

You can reset at any time without running a full pipeline:

```bash
node -e "
const { makeWorkspaceConfig } = require('./orchestrator/workspace-config');
const { resetWorkspace } = require('./utils/reset-workspace');
const cfg = makeWorkspaceConfig(process.cwd());
resetWorkspace(process.cwd(), cfg);
console.log('.spiq/ reset.');
"
```

---

## Using the Vault

### View recent sessions

```bash
ls -lt prompt_vault/          # most recent first
cat prompt_vault/$(ls prompt_vault/ | tail -1)   # oldest
cat prompt_vault/$(ls prompt_vault/ | head -1)   # most recent (lexicographic sort)
```

Since filenames are `YYYY-MM-DD_HH-MM-SS.md`, `ls` sorts them chronologically. To get the most recent:

```bash
ls prompt_vault/ | sort | tail -1
```

### Find sessions by keyword

```bash
grep -l "authentication" prompt_vault/*.md   # sessions mentioning authentication
grep -A5 "## Initial Requirement" prompt_vault/2026-04-28*.md   # req from a specific date
```

### Extract all winning prompts

```bash
awk '/^## Winning Prompt/,/^---/' prompt_vault/*.md
```

### Compare requirements across runs

```bash
grep -A20 "## Initial Requirement" prompt_vault/*.md | grep -v "^--$"
```

### Check spec evolution across runs

```bash
grep '"spec_evolved"' prompt_vault/*.md
# output: 2026-04-28_14-32-07.md:  "spec_evolved": true,
#         2026-04-29_09-10-00.md:  "spec_evolved": false,
```

---

## Implementation Details

| File | Role |
|------|------|
| `utils/persist-session.js` | Core archiving utility — reads artifacts, computes summary, writes vault file |
| `utils/reset-workspace.js` | Workspace reset — clears generated artifacts, rewrites `tasks.json` |
| `orchestrator/orchestrator.js` | Integration point — calls `persistSession` then prompts for reset after `current_stage: complete` |
| `prompts/skills/SESSION_PERSISTENCE.md` | Reference skill — documents vault behavior for agents |

### `persist-session.js` exports

| Export | Signature | Description |
|---|---|---|
| `persistSession(workspace, cfg)` | `(string, WorkspaceConfig) → string` | Writes vault file, returns absolute path |
| `specDiffersFromReq(req, spec)` | `(string, string) → boolean` | Two-signal heuristic |
| `buildSessionSummary(cfg)` | `(WorkspaceConfig) → SessionSummary` | Reads tasks.json, computes stage/failure metrics |

### `reset-workspace.js` exports

| Export | Signature | Description |
|---|---|---|
| `resetWorkspace(workspace, cfg)` | `(string, WorkspaceConfig) → void` | Clears artifacts, resets tasks.json |

### WorkspaceConfig paths used

Both utilities consume the `cfg` object from `makeWorkspaceConfig(workspace)`:

| cfg key | Path |
|---|---|
| `cfg.reqFile` | `.spiq/req.md` |
| `cfg.specFile` | `.spiq/SPEC.md` |
| `cfg.tasksFile` | `.spiq/tasks.json` |
| `cfg.outputDir` | `.spiq/artifacts/output/` |
| `cfg.compiledDir` | `.spiq/artifacts/compiled/` |
| `cfg.failuresDir` | `.spiq/artifacts/failures/` |
| `cfg.planDir` | `.spiq/tasks/` |
| `cfg.stateDir` | `.spiq/` |

---

## Future Improvements

### 1. Vault index file (`prompt_vault/INDEX.md`)

A running index of all sessions — one line per record with date, duration, failure count, and spec_evolved flag — would allow `cat prompt_vault/INDEX.md` to give a project's full pipeline history at a glance without reading individual files.

**Implementation note:** `persistSession` would append a row to `INDEX.md` after writing the session file. The index should be append-only to avoid rewriting the full file on each run.

---

### 2. `agenticspiq vault` CLI subcommand

A dedicated subcommand for vault operations:

```bash
agenticspiq vault list              # tabular view of all sessions
agenticspiq vault show              # cat the most recent session
agenticspiq vault show 2026-04-28   # sessions from a specific date
agenticspiq vault prompts           # extract all winning prompts
agenticspiq vault clean             # delete all vault records (with confirmation)
```

**Implementation note:** Add a `vault` case to `bin/agenticspiq.js`'s command dispatch. Each subcommand reads from `prompt_vault/` using the metadata JSON block for structured filtering.

---

### 3. Cross-project vault aggregation

Currently each workspace has its own `prompt_vault/`. A future tool could aggregate records across projects to identify which prompt patterns consistently produce clean first-pass builds vs. which tend to require retries.

**Implementation note:** This would require a central index at `~/.agenticspiq/vault-index.json` that each `persistSession` call updates with `{ workspace, vault_file, spec_evolved, failure_count, duration }`. A separate `agenticspiq vault global` command would read this index.

---

### 4. Spec evolution threshold tuning

The current heuristic (1.4× length ratio, ≥2 structural headings) was chosen conservatively. For projects that consistently write detailed requirements, the length ratio threshold may produce too many `spec_evolved: false` results. For projects that write minimal requirements, the opposite.

**Implementation note:** Allow threshold override via `.env`:

```
VAULT_LENGTH_RATIO_THRESHOLD=1.6
VAULT_MIN_HEADING_MATCHES=3
```

`persist-session.js` would read these at startup with fallback to the hardcoded defaults.

---

### 5. Failure pattern analysis across sessions

The failure history in each vault file is per-run. A future analysis pass could cluster failures across sessions by stage and error pattern to identify systemic issues — e.g., "build stage fails on JSON parsing in 60% of runs."

**Implementation note:** This is an analysis feature, not a data-capture feature — the data already exists in the vault. It would require a separate script that reads all vault files, parses the failure history tables, and groups by normalized error message.

---

### 6. `.gitignore` integration

Currently the user decides whether to commit `prompt_vault/`. The scaffold could offer a choice:

```
Track prompt_vault/ in git? [y/N]  (recommended for team projects)
```

If `N`, it appends `prompt_vault/` to the workspace `.gitignore`.

**Implementation note:** Add a `configureVault(workspace)` call to `utils/scaffold.js` after `ensureRequirements`. The prompt only fires once — a `.vault-configured` sentinel file in `.spiq/` prevents re-prompting on subsequent scaffold runs.

---

### 7. Token budget tracking in vault

`tasks.json` has a `token_budget` field (`{ total: 200000, used: 0 }`) but `used` is not currently incremented by any stage. When token tracking is implemented, the vault file should include the final `used / total` ratio in the Session Summary table.

**Implementation note:** No changes to `persist-session.js` needed — `buildSessionSummary` already reads `tasks.json` in full. Add `token_usage` to the rendered table when `tasks.failure_state` is extended to include it.
