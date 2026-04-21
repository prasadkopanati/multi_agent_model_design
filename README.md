# agenticspiq

A deterministic, multi-stage coding workflow powered by two CLI agents:

* **Controller (reasoning + planning):** Claude Code using Claude Sonnet 4.5
* **Executor (code + iteration):** OpenCode using Qwen3.5-27B

The system is orchestrated via Node.js, uses Git worktrees for isolation, and improves over time via a failure analysis loop.

---

## 🧠 Core Idea

> Separate **thinking** from **doing**

| Layer        | Responsibility                       |
| ------------ | ------------------------------------ |
| Controller   | Spec, plan, review, failure analysis |
| Executor     | Build, test, fix loops               |
| Orchestrator | State machine, routing, retries      |
| Git          | Isolation, history, PR lifecycle     |

---

## 🔄 Workflow

```
/spec → /plan → /build → /test → /review → /ship
```

### Stage Ownership

| Stage            | Agent    |
| ---------------- | -------- |
| /spec            | Claude   |
| /plan            | Claude   |
| /build           | OpenCode |
| /test            | OpenCode |
| /review          | Claude   |
| failure-analysis | Claude   |

---

## 🧩 Architecture

```
orchestrator.js
      │
      ├── Claude Code (Controller)
      │     ├── spec
      │     ├── plan
      │     ├── review
      │     └── failure-analysis
      │
      └── OpenCode (Executor)
            ├── build
            ├── test
            └── fix loops
```

---

## 📂 Project Structure

```
agentic-system/
├── orchestrator/        # State machine, failure capture, retry logic
├── agent-cli/           # CLI entry point and agent runners
├── prompts/             # Stage prompts and skills modules
│   ├── *.md            # Stage templates (spec, plan, build, test, review)
│   └── skills/         # Reusable skill modules
├── commands/            # Command definitions with skill mappings
├── skills/              # Detailed skill documentation
├── artifacts/           # Generated outputs
│   ├── compiled/       # Compiled prompts
│   ├── failures/       # Failure records
│   └── logs/           # Execution logs
├── worktrees/          # Git worktrees for isolation
├── repo/               # Working repository
├── tasks.json          # State management
├── .env.example        # Environment variable template
└── README.md
```

---

## 🧾 State Management (`tasks.json`)

Single source of truth:

```json
{
  "current_stage": "spec",
  "mode": "normal",
  "retry_limit": 3,
  "token_budget": {
    "total": 200000,
    "used": 0
  },
  "human_required": false
}
```

---

## ⚙️ Agent Contract

All agents are invoked via:

```bash
agent-cli run \
  --stage <stage> \
  --model <model> \
  --input <file> \
  --output <file> \
  --workspace <path>
```

---

## 🔁 Failure Analysis Loop (Proto Fine-Tuning)

Instead of blind retries:

```
failure → analyze → structured summary → guided fix
```

### Example Output

```json
{
  "root_cause": "Missing null check",
  "fix_scope": ["src/api.js"],
  "strategy": "Add guard clause",
  "confidence": 0.82
}
```

This is injected into the next `/build` step.

---

## 🔁 Retry Logic

* Max retries per stage: `3`
* Max fix loops: `3`
* Same failure twice → escalate

---

## 🎯 Skills & Commands

### Command-Skill Mapping

Each command invokes specific skills as defined in `commands/`:

| Command | Primary Skill(s) | Additional Skills |
|---------|------------------|--------------------|
| `/spec` | spec-driven-development | — |
| `/plan` | planning-and-task-breakdown | — |
| `/build` | incremental-implementation, test-driven-development | debugging-and-error-recovery (on failure) |
| `/test` | test-driven-development | browser-testing-with-devtools (browser issues) |
| `/review` | code-review-and-quality | security-and-hardening, performance-optimization |

### Available Skills

Skills are documented in `skills/` directory:

**Core Workflow:**
- spec-driven-development
- planning-and-task-breakdown
- incremental-implementation
- test-driven-development
- debugging-and-error-recovery
- code-review-and-quality

**Specialized:**
- frontend-ui-engineering
- api-and-interface-design
- security-and-hardening
- performance-optimization
- browser-testing-with-devtools
- ci-cd-and-automation
- git-workflow-and-versioning
- documentation-and-adrs
- shipping-and-launch
- source-driven-development
- context-engineering

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Agent Configuration
# Set custom CLI agents for each stage (defaults shown)
AGENT_SPEC=claude        # Controller: spec generation
AGENT_PLAN=claude        # Controller: task planning
AGENT_BUILD=opencode     # Executor: code implementation
AGENT_TEST=opencode      # Executor: test execution
AGENT_REVIEW=claude      # Controller: code review
AGENT_FAILURE=claude     # Controller: failure analysis
```

**Usage:**
```bash
# Use defaults (from .env or hardcoded)
node orchestrator/orchestrator.js

# Override specific agent
AGENT_BUILD=my-custom-agent node orchestrator/orchestrator.js
```

---

## 🧑‍💻 Human-in-the-Loop

Triggered when:

* ambiguity in spec
* repeated failures
* low confidence (< 0.7)
* security-sensitive changes

### Flow

```
Executor stuck → Orchestrator → Claude → Human → Resume
```

---

## 🤖 YOLO Mode (Autonomous)

```json
{ "mode": "yolo" }
```

### Behavior

| Feature        | Normal | YOLO   |
| -------------- | ------ | ------ |
| Human prompts  | yes    | no     |
| Auto-merge     | no     | yes    |
| Risk tolerance | low    | higher |

### Safeguards

* diff limits
* restricted paths
* tests must pass
* review must pass

---

## 🔒 Safety Constraints

* Max diff size (e.g. 300 lines)
* File scope restriction (`src/`, `tests/`)
* Token budget enforcement
* Timeout per stage

---

## 🪝 Git Integration

### Worktrees

```
git worktree add worktrees/wt-<id> -b feature/<id>
```

### Commit per Stage

```
agent: spec complete
agent: build complete
```

### PR Creation

via GitHub CLI

---

## 🔁 CI Feedback Loop (Optional Next Step)

```
PR → CI → fail → failure-analysis → fix → push
```

Not required for MVP, but critical at scale.

---

## 🧠 Model Strategy

### Controller

* Primary → Claude Sonnet 4.5
* Fallback → Gemini Pro 3
* Backup → GLM 5.1

### Executor

* Default → Qwen3.5-27B
* Heavy tasks → Kimi K2.5
* Fallback → GLM 5.1

---

## ⚠️ Design Principles

1. **Strict role separation**

   * Controller never writes code
   * Executor never plans

2. **Artifact-driven state**

   * No hidden memory
   * Everything persisted

3. **Constrained execution**

   * Minimal diffs
   * Explicit fix scopes

4. **Failure-guided iteration**

   * Learn without fine-tuning

---

## 🚀 Running the System

### Option A: Global CLI (recommended)

Install `agenticspiq` once, then invoke it from any project directory:

```bash
# 1. Clone the repo and install dependencies
git clone <repo-url> agenticspiq
cd agenticspiq
npm install

# 2. Configure a user-local npm prefix (skip if already done)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global

# Add to your shell profile (~/.zshrc or ~/.bashrc):
# export PATH="$HOME/.npm-global/bin:$PATH"
source ~/.zshrc   # or restart your terminal

# 3. Link the package globally
npm link

# 4. Run from any workspace directory
cd /your/project
agenticspiq
```

`agenticspiq` automatically sets `--workspace` to the current directory.
Pass it explicitly to override:

```bash
agenticspiq --workspace /path/to/project
```

### Option B: Local invocation

```bash
npm install
npm start                                   # runs with --workspace .
node orchestrator/orchestrator.js --workspace /path/to/project
```

---

## 📈 Future Enhancements

* CI auto-fix loop
* failure memory dataset
* dynamic model routing
* parallel task execution
* fine-tuning pipeline

---

## 🧠 Key Insight

> Reliability doesn’t come from more agents.
> It comes from **clear roles, strict contracts, and controlled feedback loops**.

---

## 🏁 Summary

This system provides:

* deterministic multi-agent workflow
* CLI-based modular agents
* Git-native execution model
* self-improving feedback loop
* minimal architecture with scalability

---

## 🧠 One-Line Takeaway

> **Claude decides. OpenCode executes. The orchestrator enforces.**

---

If you want, I can next:

* turn this into a **GitHub template repo with working scripts**, or
* add **CI + auto-fix loop directly into this README + codebase**
