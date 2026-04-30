# agenticspiq

A deterministic, multi-stage coding workflow powered by three CLI agents:

| Agent | CLI | Default model | Role |
|---|---|---|---|
| **Controller** | Claude Code | `sonnet` (Claude Sonnet 4.6) | Spec, research, plan, review, failure analysis |
| **Executor** | OpenCode | `opencode/qwen3.5-plus` | Build, test, fix loops |
| **Finisher** | Gemini CLI | `gemini-2.5-flash-preview` | Final delivery (finish stage) |
| **Alt Controller** | OpenClaude | `sonnet` | Drop-in alternative controller; supports OpenAI-compatible, Gemini, Ollama providers |

The system is orchestrated via Node.js and improves over time via a structured failure-analysis loop.

> **Core principle:** Separate **thinking** from **doing** — the Controller decides, the Executor executes, the Orchestrator enforces.

---

## 🚀 Get Started

### Prerequisites

| Tool | Install |
|---|---|
| [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) | `npm install -g @anthropic-ai/claude-code` |
| [OpenCode CLI](https://opencode.ai) | `npm install -g opencode` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `npm install -g @google/gemini-cli` |
| Node.js ≥ 18 | [nodejs.org](https://nodejs.org) |
| Git | [git-scm.com](https://git-scm.com) |

Log in to all CLIs before first use:
```bash
claude login
opencode login   # or set OPENCODE_API_KEY in your environment
gemini           # first run will prompt for Google account auth
```

### Install agenticspiq

```bash
# Clone and install
git clone <repo-url> agenticspiq
cd agenticspiq
npm install

# Configure a user-local npm prefix (skip if already done)
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
# Add to ~/.zshrc or ~/.bashrc:
# export PATH="$HOME/.npm-global/bin:$PATH"
source ~/.zshrc   # or restart your terminal

# Link globally
npm link
```

### Run on a new project

```bash
mkdir my-project && cd my-project
agenticspiq
# agenticspiq creates .spiq/ and prompts you to describe your feature request.
# Fill it in, save, then re-run.
agenticspiq
```

### Run on an existing project

```bash
cd /path/to/existing-project
agenticspiq
# agenticspiq detects any REQUIREMENTS.md / SPEC.md / BRIEF.md and asks if you
# want to use it as your feature request.
```

Or point at a specific requirements document directly:

```bash
agenticspiq --req docs/requirements.md
# Copies docs/requirements.md to .spiq/req.md and starts the pipeline immediately.
```

Or pipe requirements via stdin:

```bash
echo "Build a REST API with JWT auth and a PostgreSQL backend" | agenticspiq
```

### On first run, agenticspiq will

1. Create `.spiq/` in your workspace (all framework state is isolated here)
2. Source or create `req.md` from your requirements document
3. Run the pipeline: **spec → research → plan → build → test → review → finish**
4. Pause after spec, research, and plan for your approval before continuing

Add `.spiq/` to your project's `.gitignore`:
```bash
echo ".spiq/" >> .gitignore
```

---

## ⚙️ Configuration

### `.env` — agent and model selection

Copy and edit the `.env` file in the agenticspiq installation directory:

```bash
# Agent selection per stage (claude | opencode | gemini | openclaude)
AGENT_SPEC=claude
AGENT_RESEARCH=claude
AGENT_PLAN=claude
AGENT_BUILD=opencode
AGENT_TEST=opencode
AGENT_REVIEW=claude
AGENT_FIX=opencode
AGENT_FINISH=gemini
AGENT_FAILURE=claude

# Model per agent CLI
CLAUDE_MODEL=sonnet                    # Claude Code --model flag (e.g. sonnet, opus, haiku)
OPENCODE_MODEL=opencode/qwen3.5-plus   # OpenCode -m flag
GEMINI_MODEL=gemini-2.5-flash-preview  # Gemini CLI --model flag
OPENCLAUDE_MODEL=sonnet                # OpenClaude model (supports OpenAI-compatible, Gemini, Ollama)

# Finish stage delivery action (pr | merge | keep | discard)
FINISH_ACTION=pr

# Research stage API keys (all optional — skip any service you don't have a key for)
TAVILY_API_KEY=tvly-...                # Web search (https://app.tavily.com)
FIRECRAWL_API_KEY=fc-...              # Page fetch & crawl (https://firecrawl.dev)
APIFY_TOKEN=apify_api_...             # Platform scraping (https://console.apify.com)
GITHUB_TOKEN=ghp_...                  # Optional: raises GitHub API rate limit from 60 to 5000 req/hr
```

Override a single model for one run:
```bash
CLAUDE_MODEL=opus agenticspiq --workspace /my/project
```

---

## 🔄 Pipeline

```
spec → research → plan → build → test → review → finish
```

| Stage | Agent | Approval required | Output |
|---|---|---|---|
| spec | Claude (Controller) | ✅ yes — reviews SPEC.md | `.spiq/SPEC.md` |
| research | Claude (Controller) | ✅ yes — review + optional feedback | `.spiq/research.md` |
| plan | Claude (Controller) | ✅ yes — reviews tasks/plan.md | `.spiq/tasks/plan.md` |
| build | OpenCode (Executor) | no | committed code + review request |
| test | OpenCode (Executor) | no | verified test results |
| review | Claude (Controller) | no | PASS/FAIL verdict |
| finish | Gemini (Finisher) | no | PR / merge / branch kept |

Artifacts from each stage are stored in `.spiq/` and passed as context to the next stage.

### Research Stage

After the spec is approved, a dedicated research agent runs before planning begins. It searches Tavily, Firecrawl, and Apify to gather the technical context the executor needs — API documentation, SDK signatures, auth patterns, code samples, rate limits, and qualified GitHub reference implementations.

The research agent applies a **quality filter to GitHub repos: ≥ 100 stars AND ≥ 10 forks**. Repos below this threshold are discarded without mention.

At the end of the research stage you are shown the path to `research.md` and prompted:

```
Approve research and continue to plan? [y/N/feedback text]
```

- **`y`** — continue to plan
- **`n`** or empty — re-run research with no additional guidance
- **any other text** — injected as feedback into the next research run (e.g. `"need more detail on the Stripe webhook auth flow"`)

This loop repeats until you approve. The plan agent and the executor both read `research.md` as their primary technical reference.

---

## 📂 Workspace layout

agenticspiq creates a single hidden directory in your workspace:

```
your-project/
└── .spiq/
    ├── req.md              ← your feature requirements
    ├── SPEC.md             ← generated by spec stage
    ├── research.md         ← generated by research stage (primary artifact)
    ├── research/           ← per-topic deep-dive files (created when a topic needs >500 words)
    ├── tasks.json          ← pipeline state
    ├── tasks/
    │   ├── plan.md         ← generated by plan stage
    │   └── todo.md
    └── artifacts/
        ├── compiled/       ← compiled stage prompts
        ├── output/         ← raw agent output (JSON)
        ├── failures/       ← failure records for analysis
        └── logs/
```

Your existing project structure is **never touched** outside of `.spiq/`.

---

## 🧩 Architecture

```
bin/agenticspiq.js
      │
      ├── utils/scaffold.js          ← first-run setup (.spiq/, req.md, skills/)
      │
      └── orchestrator/orchestrator.js
            │
            ├── Claude Code (Controller)
            │     ├── spec     → .spiq/SPEC.md
            │     ├── research → .spiq/research.md  [approval loop with feedback]
            │     ├── plan     → .spiq/tasks/plan.md
            │     ├── review   → PASS/FAIL verdict
            │     └── failure-analysis
            │
            ├── OpenCode (Executor)
            │     ├── build  → code + review request
            │     ├── test   → verified test results
            │     └── fix loops (up to retry_limit)
            │
            └── Gemini (Finisher)
                  └── finish → PR / merge / branch kept
```

### Key modules

| Path | Purpose |
|---|---|
| `orchestrator/orchestrator.js` | Pipeline state machine |
| `orchestrator/workspace-config.js` | All path resolution (always `.spiq/`-relative) |
| `orchestrator/failure.js` | Failure capture and persistence |
| `orchestrator/retry.js` | Retry logic with escalation |
| `orchestrator/promptCompiler.js` | Template → compiled prompt |
| `agent-cli/agent-cli.js` | CLI dispatcher for agent runners |
| `agent-cli/runners/claude.js` | Claude Code runner |
| `agent-cli/runners/opencode.js` | OpenCode runner |
| `agent-cli/runners/gemini.js` | Gemini runner |
| `agent-cli/runners/openclaude.js` | OpenClaude runner (OpenAI-compatible, Gemini, Ollama) |
| `utils/scaffold.js` | First-run workspace initialisation |
| `prompts/*.md` | Stage prompt templates |
| `prompts/skills/` | Reusable skill modules |

---

## 🔁 Failure Analysis Loop

Instead of blind retries, the system uses structured analysis:

```
failure → Claude analyzes → { root_cause, fix_strategy, affected_files, confidence }
        → injected into next build attempt
```

A stage is retried up to `retry_limit` (default: 3) times before escalating to human review.

---

## 🧑‍💻 Human-in-the-Loop

Triggered automatically when:
- Spec, research, or plan stage completes (approval prompt)
- Research approval supports typed feedback to guide a re-run
- A stage exceeds `retry_limit` failures (escalation)

---

## 🧠 Model Strategy

| Role | Default | Override via |
|---|---|---|
| Controller (spec/research/plan/review/failure) | Claude Sonnet 4.6 (`sonnet`) | `CLAUDE_MODEL` |
| Executor (build/test/fix) | Qwen3.5-plus (`opencode/qwen3.5-plus`) | `OPENCODE_MODEL` |
| Finisher (finish) | Gemini 2.5 Flash Preview | `GEMINI_MODEL` |
| Alt Controller (any stage) | `sonnet` | `OPENCLAUDE_MODEL` |

To switch the controller to Opus for a harder task:
```bash
CLAUDE_MODEL=opus agenticspiq
```

---

## 🔒 Safety Constraints

- Max diff size: ~300 lines
- File scope restriction: `src/`, `tests/`
- Token budget enforcement per task
- Timeout per stage

---

## 🪝 Git Integration

Each stage can commit its artifacts:

```
agent: spec complete
agent: plan complete
agent: build complete
```

Git worktrees can be used for isolated execution per task (see `worktrees/` in the architecture above).

---

## ⚠️ Design Principles

1. **Strict role separation** — Controller never writes code; Executor never plans
2. **Artifact-driven state** — No hidden memory; everything persisted in `.spiq/`
3. **Constrained execution** — Minimal diffs, explicit fix scopes
4. **Failure-guided iteration** — Structured analysis guides each retry

---

## 📈 Future Enhancements

- CI auto-fix loop
- Failure memory dataset for fine-tuning
- Dynamic model routing based on task complexity
- True parallel subprocess dispatch (infrastructure for `dispatching-parallel-agents` skill)

---

> **Claude decides. OpenCode executes. The orchestrator enforces.**
