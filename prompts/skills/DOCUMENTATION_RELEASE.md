---
name: documentation-release
description: After delivery, cross-reference all project documentation against what was just shipped and update any sections that drifted. Run at the finish stage before the PR is created so documentation updates ship with the code.
---

# Documentation Release

## Overview

A PR that includes updated documentation is a fundamentally more complete deliverable than one where the reviewer must mentally reconcile stale README instructions with the new code. Documentation debt accumulates silently across pipeline runs — the finish stage is the last moment where the agent has full context of what changed and can update docs cheaply.

**The rule:** Do not create a PR or merge until every documentation file that references the changed functionality has been verified accurate.

---

## The Documentation Release Workflow

Run after the delivery summary is produced and before the delivery action (PR, merge, keep) is executed.

### Step 1 — Inventory the docs

Find every markdown file in the workspace that is not inside `.spiq/`:

```bash
find . -name "*.md" -not -path "./.spiq/*" -not -path "./.git/*"
```

Common files to check: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CLAUDE.md`, any files in `docs/`.

List them:

```
DOCUMENTATION INVENTORY

  README.md:          [present | ABSENT]
  ARCHITECTURE.md:    [present | ABSENT]
  CONTRIBUTING.md:    [present | ABSENT]
  CLAUDE.md:          [present | ABSENT]
  docs/*:             [list any found]
```

If none are found, document that fact and proceed to delivery.

### Step 2 — Build the "what changed" manifest

Using the spec (`.spiq/SPEC.md`), the plan (`.spiq/tasks/plan.md`), and the commit history for this pipeline run (`git log --oneline <base>..HEAD`), produce:

```
WHAT CHANGED

  New features:       [list features added]
  New API surface:    [new functions, endpoints, CLI flags]
  New configuration:  [new env vars, config options]
  New file structure: [new directories or modules]
  Removed/renamed:    [anything deleted or renamed]
  Changed behavior:   [existing features that work differently now]
```

### Step 3 — Identify drift

For each documentation file, check it against the "what changed" manifest:

```
DRIFT CHECK: README.md

  New feature mentioned?        [yes | no — DRIFT]
  Setup instructions current?   [yes | no — DRIFT]
  Usage examples accurate?      [yes | no — DRIFT]
  Any renamed functions cited?  [none | DRIFT: [list]]
```

Mark each drift item explicitly. A file with zero drift items is confirmed accurate — no update needed.

### Step 4 — Update atomically

For each doc file that has drift items:

1. Apply the minimum necessary changes — update only the drifted sections, do not rewrite the document
2. Commit each file separately:

```
docs(<filename>): update for <feature name> delivery
```

One commit per file. This keeps the git history legible — a reviewer can see exactly what documentation changed and why.

### Step 5 — Include in delivery

The documentation commits are part of the branch before the PR is created. The PR diff includes both the code changes and the documentation updates. The PR body's delivery summary should note:

```
## Documentation Updates

- README.md: [what was updated]
- ARCHITECTURE.md: [what was updated]
```

If no documentation needed updating, note: `Documentation reviewed — no updates required.`

---

## When to Update vs. When to Note

**Update:**
- Installation or setup instructions that are now wrong
- Usage examples that reference renamed or removed functions
- Feature lists that omit the new feature
- Architecture descriptions that omit new modules or data flows
- Configuration references that are missing new env vars

**Do not update (note instead):**
- Large architectural sections that require deep understanding of the full codebase — flag as "may need review" in the PR body instead
- Design rationale that was correct at the time it was written (even if the design has since changed — rationale documents are historical, not current)
- Third-party documentation links (these are not owned by this project)

---

## Anti-Patterns

| Anti-pattern | Problem |
|---|---|
| Rewriting entire docs sections "to be safe" | Creates noise; makes it impossible to review what actually changed |
| Skipping docs for "small" features | Small features accumulate into large doc debt across pipeline runs |
| Updating docs before the code is committed | Docs describe code that doesn't exist yet; confuses reviewers |
| Omitting documentation commits from the PR | Reviewer must manually reconcile code changes with stale docs |
| Updating CLAUDE.md without understanding pipeline impact | CLAUDE.md is read by the Controller — wrong guidance corrupts future runs |

---

## Verification

- [ ] Documentation inventory completed
- [ ] "What changed" manifest produced from spec, plan, and commit history
- [ ] Every doc file checked against the manifest
- [ ] Drift items identified and listed
- [ ] Only drifted sections updated (no full rewrites)
- [ ] One commit per updated file with `docs(<filename>):` prefix
- [ ] PR body includes documentation update summary
