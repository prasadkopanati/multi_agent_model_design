# Session Summary — 2026-04-25

## Overview

This session focused on three areas: pipeline state documentation, agent skill expansion, and agent git identity. All changes were applied to the `agenticspiq` module at `/Users/kris/code/personal/multi_agent_model_design`.

---

## 1. Build Failure Simulation & Recovery Guide

**Problem:** No documentation existed for what `tasks.json` looks like during a build failure or how to restart the pipeline from the build stage.

**Delivered:**
- `docs/build-failure-recovery-guide.md` — two sample `tasks.json` states (mid-failure with retries remaining; escalated after `retry_limit` exceeded), three restart scenarios (automatic resume, post-escalation human reset, force-restart), and a key files table.

**Key insight:** `current_stage` is written at the *start* of each stage (before execution), so a failure always leaves it pointing at the failed stage. Resume is automatic on re-run. Escalation triggers when `failure_state.history.filter(h => h.stage === stage).length > retry_limit` (default 3), i.e., on the 4th failure.

---

## 2. Build Phase Bug Fixes

### Fix 1: Git not initialized in workspace
**Problem:** Build agent ran `git commit` but the workspace had no `.git` directory.  
**Fix:** `utils/scaffold.js` — added `git init` (conditional on `.git` not existing) inside `ensureDirs()`. Added `spawnSync` import.

### Fix 2: Playwright resolved to workspace instead of agenticspiq module
**Problem:** Build agent ran in `cwd: workspace`, so `require('playwright')` failed to resolve agenticspiq's installed copy and the agent ran `npm install playwright` in the workspace instead.  
**Fix:** `agent-cli/runners/opencode.js` — extracted `AGENTICSPIQ_NODE_MODULES` constant; added `NODE_PATH` to the subprocess env alongside the existing `PATH` extension.

### Fix 3: Skill frontmatter triggered agent skill systems
**Problem:** Compiled prompts included raw YAML frontmatter (`---name: test-driven-development---`) from skill files. Agents like kimi and OpenCode interpreted this as skill invocation directives, resulting in `Error: Skill "test-driven-development" not found. Available skills: none`.  
**Fix:** `orchestrator/promptCompiler.js` — added `stripFrontmatter()` function; updated `load()` to strip `---...---` blocks before injecting skill content into prompts.

---

## 3. Skill Library Expansion

### Compatibility audit
- **`BROWSER_TESTING.md`** — rewrote the setup section to be agent-agnostic. Chrome DevTools MCP installation moved to an "Option 2 (Claude Code only)" note. Playwright promoted as the primary method (works in all three agents).

### New web skills (previous session, confirmed)
| File | Skill name | Covers |
|---|---|---|
| `WEB_DEV.md` | `web-development` | Semantic HTML, CSS custom properties, vanilla JS, responsive, a11y |
| `THEME_FACTORY.md` | `theme-factory` | CSS design tokens, light/dark mode, brand themes, flash prevention |
| `WEB_ARTIFACTS.md` | `web-artifacts` | Self-contained static deliverables, file:// protocol, delivery checklist |
| `CONTENT_CREATION.md` | `content-creation` | UI copy, microcopy, error messages, SEO metadata, tone guide |

### New backend & infrastructure skills (this session)
| File | Skill name | Covers |
|---|---|---|
| `API_DESIGN.md` | `api-design` | REST conventions, versioning, OpenAPI, error envelope, pagination, auth headers, idempotency |
| `API_TESTING.md` | `api-testing` | supertest (Node), pytest+httpx (Python), curl, auth testing, DB isolation, contract testing |
| `DATABASE.md` | `database-development` | Schema design, Knex/Prisma migrations, parameterized queries, transactions, N+1 fix, indexing, pooling |
| `DOCKER.md` | `docker-and-containers` | Multi-stage Dockerfile, .dockerignore, docker-compose, health checks, secrets hygiene, image sizing |

### Agent × domain skill matrix (top 2 per agent)
| Domain | Claude Code | OpenCode | Gemini CLI |
|---|---|---|---|
| Web dev | WEB_DEV + BROWSER_TESTING (MCP+Playwright) | WEB_DEV + BROWSER_TESTING (Playwright via NODE_PATH) | WEB_DEV + BROWSER_TESTING (Playwright) |
| API dev | API_DESIGN + API_TESTING | API_DESIGN + API_TESTING | API_DESIGN + API_TESTING |
| Database dev | DATABASE (Knex/Prisma + MCP) | DATABASE (npx knex/prisma via PATH) | DATABASE (npx knex/prisma) |
| Cloud dev | DOCKER (full shell) | DOCKER (docker CLI) | DOCKER (docker CLI) |

### Stage wiring (`promptCompiler.js`)
```js
build:  [..., "API_DESIGN.md", "DATABASE.md", "DOCKER.md", "GIT.md"]
test:   [..., "API_TESTING.md"]
```
All stages verified to compile cleanly with no frontmatter leaking.

---

## 4. Agent Git Identity

**Problem:** All agents committed under the user's global git identity — no agent attribution in git history.

**Approach:** Three-layer system using git's Author vs Committer distinction.

### Layer 1 — Per-runner `GIT_AUTHOR_*` env vars
Each runner now injects author identity into the subprocess env:

| Runner | GIT_AUTHOR_NAME | GIT_AUTHOR_EMAIL |
|---|---|---|
| `runners/claude.js` | `Claude Code Agent` | `claude-agent@agenticspiq.local` |
| `runners/opencode.js` | `OpenCode Agent` | `opencode-agent@agenticspiq.local` |
| `runners/gemini.js` | `Gemini Agent` | `gemini-agent@agenticspiq.local` |

`GIT_COMMITTER_*` left unset → falls back to user's global git config. Result: agent is Author, user is Committer.

### Layer 2 — Repo-level git config fallback (`scaffold.js`)
After `git init`, sets `user.name = agenticspiq-agent` and `user.email = agent@agenticspiq.local` as workspace-local config. Prevents "Author identity unknown" failures in bare CI environments.

### Layer 3 — `Co-Authored-By` trailer in `GIT.md`
New "Agent Attribution" section instructs agents to append a `Co-Authored-By:` trailer to every commit body.

### GitHub Contributors behaviour
- **Current (.local emails):** Agent name visible in git log and GitHub commit view as plain text; no linked profile/avatar; does NOT increment the Contributors widget count.
- **Upgrade path:** Replace `.local` email with a GitHub Bot account noreply address (`{id}+{botname}@users.noreply.github.com`) to get full profile integration. Code is identical — only the email string changes.

### Verified git log output
```
Author:    Claude Code Agent <claude-agent@agenticspiq.local>
Committer: Kris <kris@example.com>

    feat: add user authentication

    Co-Authored-By: Claude Code Agent <claude-agent@agenticspiq.local>
```

---

## Files Modified This Session

| File | Change |
|---|---|
| `utils/scaffold.js` | Added `git init` + `git config` fallback identity |
| `agent-cli/runners/opencode.js` | Added `NODE_PATH` + `GIT_AUTHOR_*` env vars |
| `agent-cli/runners/claude.js` | Added `GIT_AUTHOR_*` env vars |
| `agent-cli/runners/gemini.js` | Added `env` block with `GIT_AUTHOR_*` |
| `orchestrator/promptCompiler.js` | Added `stripFrontmatter()`; wired new skills into build/test stages |
| `prompts/skills/BROWSER_TESTING.md` | Made agent-agnostic; Playwright as primary, MCP as optional |
| `prompts/skills/GIT.md` | Added Agent Attribution section |
| `prompts/skills/SKILLS.md` | Updated index with all new skills |
| `docs/build-failure-recovery-guide.md` | New file — build failure states and restart commands |

## Files Created This Session

| File | Purpose |
|---|---|
| `prompts/skills/API_DESIGN.md` | REST API design skill |
| `prompts/skills/API_TESTING.md` | HTTP API testing skill |
| `prompts/skills/DATABASE.md` | Database development skill |
| `prompts/skills/DOCKER.md` | Containerisation skill |
