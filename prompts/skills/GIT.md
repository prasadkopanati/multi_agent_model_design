---
name: git-workflow-and-versioning
description: Structures git workflow practices. Use when making any code change. Use when committing, branching, resolving conflicts, or when you need to organize work across multiple parallel streams.
---

# Git Workflow and Versioning

## Core Rules

1. **Commit early, commit often.** Each successful increment gets its own commit. Never accumulate large uncommitted changes.
2. **Atomic commits.** One logical change per commit. No mixing features, fixes, and refactors.
3. **Descriptive messages.** Explain the why, not the what. Format: `<type>(<scope>): <description>`
4. **Separate concerns.** Formatting ≠ behavior. Refactors ≠ features. Submit separately.
5. **Size your changes.** ~100 lines is easy to review. ~300 is acceptable. >1000 — split it.

## Commit Message Types

`feat` | `fix` | `refactor` | `test` | `docs` | `chore`

## Branch Naming

```
feature/<description>   fix/<description>   chore/<description>   refactor/<description>
```

Keep branches short-lived — merge within 1–3 days. Long-lived branches accumulate merge risk.

## Co-Authored-By (Mandatory)

Every commit must include this trailer in the message body:

```
Co-Authored-By: <Your Agent Name> <your-agent-email@agenticspiq.local>
```

Use the name and email matching your runner's `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`. Never omit this.

## Pre-Commit Hygiene

Before every commit:
- `git diff --staged` — check exactly what you're committing
- Scan for secrets: `git diff --staged | grep -i "password\|secret\|api_key\|token"`
- Run tests
- Run lint and type check

**Never use `git add -A` or `git add .`** — stage specific files by name to avoid accidentally including secrets or out-of-scope files.

## Red Flags

- Commit messages like "fix", "update", "misc"
- Formatting changes mixed with behavior changes
- `.env` or secret files staged
- `.spiq/` added to `.gitignore` — breaks agent access to pipeline state
- Force-pushing to shared branches
- Large uncommitted changes accumulating

## Verification

- [ ] Each commit does one logical thing
- [ ] Message explains the why and follows type conventions
- [ ] Tests pass before committing
- [ ] No secrets in the diff
- [ ] Co-Authored-By trailer present on every commit
- [ ] `.gitignore` covers `node_modules/`, `dist/`, `.env`
