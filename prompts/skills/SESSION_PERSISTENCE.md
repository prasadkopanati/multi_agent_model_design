---
name: session-persistence
description: Documents how completed pipeline sessions are automatically archived to prompt_vault/. Read when the finish stage references the vault, when a user asks about prior sessions, or when referencing a prior winning prompt.
---

# Session Persistence

## Overview

When a pipeline run completes (`current_stage: "complete"`), the orchestrator automatically archives a session record to `prompt_vault/` in the workspace root. This happens before the process exits, regardless of whether the user resets `.spiq/`.

The vault persists across runs and is co-located with the project. It is not inside `.spiq/` and is not cleared by a workspace reset.

## Vault Location

```
<workspace>/
├── .spiq/             ← pipeline state (ephemeral)
├── prompt_vault/      ← session records (persistent)
│   ├── 2026-04-28_14-32-07.md
│   └── 2026-04-29_09-10-00.md
└── src/
```

## Vault File Format

Each file is named `YYYY-MM-DD_HH-MM-SS.md` (local time). Sections:

| Section | Contents |
|---|---|
| **Initial Requirement** | Verbatim content of `.spiq/req.md` |
| **Session Summary** | Stage list, failure counts, duration table |
| **Failure History** | Per-failure table (stage, truncated error, time) — omitted if no failures |
| **Winning Prompt (SPEC.md)** | Verbatim SPEC.md — present when spec is meaningfully evolved |
| **Spec Evolution Note** | Present instead of Winning Prompt when spec did not evolve |
| **Metadata** | JSON block: workspace path, filename, spec_evolved flag, length ratio |

## Spec Evolution Detection

The "winning prompt" is `SPEC.md` when both signals pass:

1. `spec.length / req.length > 1.4` — spec is at least 40% longer than req
2. Spec contains ≥2 of the canonical H2 headings: `Objective`, `Commands`, `Project Structure`, `Code Style`, `Testing Strategy`, `Boundaries`, `Success Criteria`, `Assumption Register`

If either signal fails, the vault records the initial requirement as the effective prompt and notes that SPEC.md showed no meaningful evolution.

## Workspace Reset

After archiving, the orchestrator prompts:

```
Clean .spiq/ for next run? [y/N]
```

**Default is N.** The user must explicitly type `y` to reset.

**When `y`:** Clears generated artifacts (SPEC.md, plan.md, todo.md, all `artifacts/output/`, `artifacts/compiled/`, `artifacts/failures/` files) and resets `tasks.json` to initial state. Preserves `req.md` and `skills/`.

**When `N`:** `.spiq/` is left untouched.

Advise the user to answer `y` when: starting a new feature, moving to a different task, or when the prior run produced incorrect artifacts that should not influence the next run.

Advise the user to answer `N` when: debugging a prior failure, reviewing the last run's artifacts, or resuming a partially-completed pipeline.

## Referencing Prior Sessions

If the user asks "what did we build last time?" or "show me the winning prompt from the last run", read the most recent file in `prompt_vault/` (sort by filename — the datetime format is lexicographically ordered).

To find sessions where a specific approach was used, grep across `prompt_vault/*.md` for keywords in the Initial Requirement or Winning Prompt sections.
