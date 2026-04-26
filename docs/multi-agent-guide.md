# agenticspiq: Usage Guide

A comprehensive guide to using the `agenticspiq` system — an agentic coding workflow that orchestrates multiple AI agents through a deterministic, multi-stage pipeline.

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Prerequisites & Setup](#prerequisites--setup)
4. [User Inputs Required](#user-inputs-required)
5. [Running the Pipeline](#running-the-pipeline)
6. [Stage-by-Stage Walkthrough](#stage-by-stage-walkthrough)
7. [Configuration Options](#configuration-options)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This system orchestrates **three CLI agents** through a **six-stage pipeline**:

| Agent | Model | Role |
|-------|-------|------|
| **Controller (Claude)** | Claude Sonnet 4.6 | Spec, plan, review, failure analysis |
| **Executor (OpenCode)** | Qwen3.5-plus | Build, test, fix loops |
| **Finisher (Gemini)** | Gemini 2.5 Flash Preview | Final delivery — PR creation, merge, cleanup |

### Core Design Principle

> **Separate thinking from doing.** Controller decides. Executor executes. Orchestrator enforces.

---

## System Architecture

```
orchestrator.js
      │
      ├── Claude Code (Controller)
      │     ├── spec
      │     ├── plan
      │     ├── review
      │     └── failure-analysis
      │
      ├── OpenCode (Executor)
      │     ├── build
      │     ├── test
      │     └── fix loops
      │
      └── Gemini (Finisher)
            └── finish
```

### Pipeline Stages

```
spec → plan → build → test → review → finish
```

| Stage | Agent | Description |
|-------|-------|-------------|
| `spec` | Claude | Clarify requirements, then generate structured specification |
| `plan` | Claude | Break work into verifiable tasks with dependency ordering |
| `build` | OpenCode | Incremental TDD implementation + structured review request |
| `test` | OpenCode | Test verification with confirmed pass/fail output |
| `review` | Claude | Five-axis code review — PASS/FAIL verdict |
| `finish` | Gemini | Final verification, delivery summary, PR/merge/cleanup |

---

## Prerequisites & Setup

### 1. Install CLI Agents

You need two CLI tools installed and configured:

#### Claude CLI (Controller)
```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Authenticate (one-time setup)
claude login
```

#### OpenCode CLI (Executor)
```bash
# Install OpenCode CLI
npm install -g opencode

opencode login   # or set OPENCODE_API_KEY in your environment
```

#### Gemini CLI (Finisher)
```bash
# Install Gemini CLI
npm install -g @google/gemini-cli

gemini   # first run will prompt for Google account authentication
```

**Note:** All three CLIs handle authentication themselves — no manual API key configuration required beyond the initial login flow.

### 2. Clone and Install `agenticspiq`

```bash
git clone <repo-url> agenticspiq
cd agenticspiq

# Copy environment template
cp .env.example .env

# Install dependencies
npm install
```

### 3. Build and Link the Global Package

This makes the `agenticspiq` command available system-wide.

```bash
# Configure a user-local npm prefix (one-time, avoids needing sudo)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global

# Add to your shell profile (~/.zshrc or ~/.bashrc):
export PATH="$HOME/.npm-global/bin:$PATH"

# Reload your shell
source ~/.zshrc   # or open a new terminal

# Register the global command
npm link
```

Verify the command is available:
```bash
which agenticspiq
# → ~/.npm-global/bin/agenticspiq
```

> **Re-linking after updates:** If you pull new changes to the repo, run `npm link` again from the repo root to keep the symlink current. No reinstall needed — it links directly to your local clone.

### 4. Verify Installation

```bash
# Test Claude CLI
claude --version

# Test OpenCode CLI
opencode --version

# Test agenticspiq
agenticspiq --help   # will error on unknown flag, but confirms the binary resolves
```

---

## User Inputs Required

### A. One-Time Configuration

#### Environment Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|--------|
| `AGENT_SPEC` | Agent for spec stage | `claude` |
| `AGENT_PLAN` | Agent for plan stage | `claude` |
| `AGENT_BUILD` | Agent for build stage | `opencode` |
| `AGENT_TEST` | Agent for test stage | `opencode` |
| `AGENT_REVIEW` | Agent for review stage | `claude` |
| `AGENT_FINISH` | Agent for finish stage | `gemini` |
| `AGENT_FAILURE` | Agent for failure analysis | `claude` |
| `FINISH_ACTION` | Delivery action for finish stage | `pr` |

`FINISH_ACTION` values: `pr` (create pull request), `merge` (merge directly), `keep` (push branch only), `discard` (delete branch).

```bash
# Example .env file
AGENT_SPEC=claude
AGENT_PLAN=claude
AGENT_BUILD=opencode
AGENT_TEST=opencode
AGENT_REVIEW=claude
AGENT_FINISH=gemini
AGENT_FAILURE=claude
FINISH_ACTION=pr
```

### B. Per-Run User Inputs

#### 1. Initial Prompt / Feature Request (`req.md`)

The system reads your feature request from `req.md` in the project root. `init-workspace.sh` creates a template automatically — fill it in before running `agenticspiq`.

```markdown
# Feature Request

## Objective
What do you want to build?

## Target Users
Who will use this?

## Core Features
List the key functionality.

## Acceptance Criteria
How will you know it is done?

## Tech Stack
Preferred technologies.

## Constraints
Boundaries and limitations.
```

| Section | Description | Example |
|---------|-------------|--------|
| **Objective** | What you want to build | "A REST API for task management" |
| **Target Users** | Who will use it | "Frontend developers integrating task features" |
| **Core Features** | Key functionality | "CRUD operations, user authentication, task filtering" |
| **Acceptance Criteria** | Definition of done | "API passes all integration tests" |
| **Tech Stack** | Preferred technologies | "Node.js, Express, PostgreSQL" |
| **Constraints** | Boundaries and limitations | "Must be serverless-compatible" |

`agenticspiq` will exit with an error if `req.md` is missing.

#### 2. Spec Review (After Spec Stage)

The system will generate `SPEC.md`. You must:
- Review the generated specification
- Confirm it matches your requirements
- Request changes if needed

#### 3. Plan Review (After Plan Stage)

The system will generate a task breakdown. You should:
- Review the proposed tasks
- Verify acceptance criteria are clear
- Approve before proceeding to build

#### 4. Interactive Prompts (During Build/Test)

The executor may ask for clarification on:
- Ambiguous requirements
- Unexpected edge cases
- Test failures requiring human judgment

---

## Running the Pipeline

### Global command (recommended)

Once linked, run from any workspace directory:

```bash
cd /your/project
agenticspiq
```

`--workspace` defaults to the current directory. Override explicitly:

```bash
agenticspiq --workspace /path/to/project
```

### Full Pipeline — local invocation

```bash
# From the repo root
npm start

# Or directly:
node orchestrator/orchestrator.js --workspace ./path/to/workspace
```

### Single Stage Execution

```bash
node orchestrator/orchestrator.js runStage <stage> <workspace>

# Examples:
node orchestrator/orchestrator.js runStage spec ./myproject
node orchestrator/orchestrator.js runStage build ./myproject
```

### Direct agent-cli Invocation

```bash
# Run spec stage with Claude
./agent-cli/agent-cli.js \
  --agent claude \
  --stage spec \
  --workspace ./myproject

# Run build stage with OpenCode
./agent-cli/agent-cli.js \
  --agent opencode \
  --stage build \
  --workspace ./myproject
```

---

## Stage-by-Stage Walkthrough

### Stage 1: `/spec`

**Agent:** Claude (Controller)

**Purpose:** Generate a structured specification before any code is written.

**User Inputs:**
- Feature description / user story
- Target users and use cases
- Core features list
- Tech stack preferences
- Known constraints

**Output:** `SPEC.md` in project root

**Example Interaction:**
```
System: Please describe the feature you want to build.
You: A user authentication system with JWT tokens, password reset, and OAuth2 support.

System: Who are the target users?
You: Mobile app developers integrating authentication.

System: Any tech stack preferences?
You: Node.js backend, PostgreSQL for storage.
```

---

### Stage 2: `/plan`

**Agent:** Claude (Controller)

**Purpose:** Break the spec into small, verifiable tasks with acceptance criteria.

**User Inputs:**
- Review of generated task list
- Any adjustments to scope or priorities

**Output:** `tasks/plan.md` and `tasks/todo.md`

**Example Output:**
```
Task 1: Set up database schema for users
  Acceptance: Migration runs without errors
  
Task 2: Implement user registration endpoint
  Acceptance: POST /auth/register returns 201 with user token
  
Task 3: Implement JWT token generation
  Acceptance: Token validates correctly with secret key
```

---

### Stage 3: `/build`

**Agent:** OpenCode (Executor)

**Purpose:** Implement tasks incrementally using TDD.

**User Inputs:**
- Task selection (if not auto-selecting)
- Responses to clarification questions

**Output:** Implemented code, committed per task

**Process:**
1. Select next pending task
2. Write failing test first
3. Implement minimal code to pass
4. Commit with message: `agent: build <task-name>`

---

### Stage 4: `/test`

**Agent:** OpenCode (Executor)

**Purpose:** Verify implementation against acceptance criteria.

**User Inputs:**
- Review of test results
- Approval or request for fixes

**Output:** Test report, pass/fail status

---

### Stage 5: `review`

**Agent:** Claude (Controller)

**Purpose:** Five-axis code review before delivery. Produces a PASS/FAIL verdict with categorized findings.

**Review Axes:**
1. Correctness
2. Readability
3. Architecture
4. Security
5. Performance

**User Inputs:** None (automated). If verdict is FAIL, a retry cycle is triggered using the `receiving-code-review` skill to triage and address findings.

**Output:** Structured review report with PASS/FAIL verdict, Critical/Important/Suggestion counts, and file:line references.

---

### Stage 6: `finish`

**Agent:** Gemini (Finisher)

**Purpose:** Complete the development lifecycle after a PASS verdict — final verification, delivery summary, and workspace cleanup.

**Process:**
1. Run the final test suite and confirm it passes
2. Produce a delivery summary from spec, commits, and review verdict
3. Execute the delivery action set by `FINISH_ACTION`:
   - `pr` — create a pull request (default)
   - `merge` — merge directly into main
   - `keep` — push branch without merging
   - `discard` — delete branch (prints what will be lost first)
4. Clean up the workspace

**User Inputs:** None (automated). Set `FINISH_ACTION` before the run to control delivery behavior.

**Output:** PR URL, merge confirmation, or branch status depending on `FINISH_ACTION`.

---

## Configuration Options

### Override Agent Selection

```bash
# Override build agent for a single run
AGENT_BUILD=my-custom-agent npm start
```

### Adjust Retry Limit

Edit `tasks.json`:

```json
{
  "retry_limit": 5,  // Default is 3
  ...
}
```

### Token Budget Management

```json
{
  "token_budget": {
    "total": 500000,  // Increase budget
    "used": 0
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Agent not found" Error

**Cause:** CLI agent not installed or not in PATH.

**Solution:**
```bash
# Verify installation
which claude
which opencode

# Reinstall if needed
npm install -g @anthropic-ai/claude-code
```

#### 2. Authentication Errors

**Cause:** CLI not authenticated or session expired.

**Solution:**
```bash
# Re-authenticate Claude CLI
claude login

# OpenCode CLI is pre-configured — check your setup if issues persist
```

#### 3. Stage Stuck in Retry Loop

**Cause:** Repeated failures exceeding retry limit.

**Solution:**
- Check `artifacts/failures/` for error details
- Review failure analysis output
- Manually fix the issue
- Reset state in `tasks.json`

```json
{
  "failure_state": {
    "count": 0,
    "last_stage": null,
    "last_error": null,
    "history": []
  },
  "human_required": false
}
```

#### 4. Git Worktree Issues

**Cause:** Conflicts with existing worktrees.

**Solution:**
```bash
# List worktrees
git worktree list

# Remove stale worktrees
git worktree remove worktrees/wt-<id>
```

---

## Summary Checklist

### Before Running

- [ ] Claude CLI installed (`npm install -g @anthropic-ai/claude-code`)
- [ ] Claude CLI authenticated (`claude login`)
- [ ] OpenCode CLI installed (`npm install -g opencode`) and authenticated
- [ ] Gemini CLI installed (`npm install -g @google/gemini-cli`) and authenticated
- [ ] `agenticspiq` linked globally (`npm link` from repo root)
- [ ] `~/.npm-global/bin` on your `PATH`
- [ ] `.env` file created from `.env.example`
- [ ] `FINISH_ACTION` set to desired delivery method (`pr`, `merge`, `keep`, or `discard`)
- [ ] Workspace directory ready
- [ ] Feature request / user story prepared

### During Execution

- [ ] Review generated SPEC.md before proceeding
- [ ] Review task breakdown before build
- [ ] Respond to any interactive prompts during build/test
- [ ] Pipeline advances automatically through test → review → finish on success
- [ ] Check the PR URL or branch status printed after the finish stage completes

---

## Quick Reference

```bash
# --- Setup (one-time) ---
npm install
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
# add to ~/.zshrc: export PATH="$HOME/.npm-global/bin:$PATH"
npm link

# --- Run ---
agenticspiq                                 # from any workspace dir
agenticspiq --workspace /path/to/project   # explicit workspace

# --- Local alternatives ---
npm start                                   # workspace = .
node orchestrator/orchestrator.js --workspace ./workspace

# --- Single stage ---
node orchestrator/orchestrator.js runStage <stage> ./workspace

# --- Inspect state ---
cat tasks.json
ls -la artifacts/failures/

# --- Reset failure state ---
node -e "require('fs').writeFileSync('tasks.json', JSON.stringify({...require('./tasks.json'), failure_state: {count: 0, last_stage: null, last_error: null, history: []}, human_required: false}, null, 2))"
```

---

## Support

For issues or questions:
1. Check `artifacts/logs/` for execution logs
2. Review `CLAUDE.md` for system design details
3. Examine `README.md` for architecture overview

---

*Last updated: 2026-04-21*
