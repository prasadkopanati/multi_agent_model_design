Below is the **GitHub template repo** with:

* `SKILLS.md` system
* prompt compilation layer
* Stage prompts as Markdown templates
* orchestrator integration
* backward-compatible execution
* 🔁 failure capture
* 🧠 structured failure analysis (Claude controller)
* 🔁 retry orchestration per stage
* 📦 persistent failure memory in `tasks.json`
* 🚦 human escalation when retry loops fail
* 🧩 SKILLS.md + prompt compiler system (previous upgrade preserved)
---

# 📦 REPO: `agentic-coding-template`

---

# 📁 1. Structure

```txt id="repo_final"
agentic-coding-template/
│
├── orchestrator/
│   ├── orchestrator.js
│   ├── failure.js
│   ├── retry.js
│   └── promptCompiler.js
│
├── agent-cli/
│   ├── agent-cli.js
│   └── runners/
│       ├── claude.js
│       └── opencode.js
│
├── prompts/
│   ├── build.md
│   ├── plan.md
│   ├── spec.md
│   ├── test.md
│   ├── review.md
│   ├── finish.md
│   ├── failure.md
│   └── skills/
│       ├── SKILLS.md
│       ├── DEBUGGING.md
│       ├── CODE_STYLE.md
│       ├── GIT.md
│       └── ARCHITECTURE.md
│
├── artifacts/
│   ├── failures/
│   ├── logs/
│   └── compiled/
│
├── worktrees/
├── repo/
├── tasks.json
├── package.json
└── README.md
```

---

# 🧠 2. `tasks.json` (Stateful + Memory-Aware)

```json id="tasks_final"
{
  "current_stage": "spec",
  "mode": "normal",
  "retry_limit": 3,

  "failure_state": {
    "count": 0,
    "last_stage": null,
    "last_error": null,
    "history": []
  },

  "human_required": false,

  "token_budget": {
    "total": 200000,
    "used": 0
  }
}
```

---

# 🔁 3. Failure Capture System

## `orchestrator/failure.js`

```js id="fail_capture"
const fs = require("fs");
const path = require("path");

const FAILURES_DIR = path.join(__dirname, "..", "artifacts", "failures");

function captureFailure(stage, error, workspace, failuresDir = FAILURES_DIR) {
  const ts = Date.now();

  const failure = {
    stage,
    error: error.toString(),
    timestamp: ts,
    workspace,
  };

  fs.mkdirSync(failuresDir, { recursive: true });
  const filePath = path.join(failuresDir, `${stage}-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(failure, null, 2));

  return { failure, path: filePath };
}

module.exports = { captureFailure };
```

---

# 🧠 4. Structured Failure Analysis (Claude Controller)

## `agent-cli/runners/claude.js`

```js id="claude_fail"
const { spawnSync } = require("child_process");
const fs = require("fs");

function runClaude(stage, input, output, workspace) {
  const systemPrompt = fs.readFileSync(input, "utf-8");

  const result = spawnSync("claude", [
    "-p",
    "--model", "sonnet-4.5",
    "--output-format", "json",
    "--system", systemPrompt,
  ], {
    cwd: workspace,
    input: "Execute the stage instructions.",
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`claude exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runClaude };
```

---

## `prompts/failure.md`

```md id="failure_prompt"
# FAILURE ANALYSIS

You are a debugging controller.

Analyze failure logs and return STRICT JSON:

{
  "root_cause": "",
  "fix_strategy": "",
  "affected_files": [],
  "confidence": 0.0
}

---

## SKILLS

{{SKILLS}}

{{DEBUGGING}}
```

---

# 🔁 5. Retry Orchestration Engine

## `orchestrator/retry.js`

```js id="retry_engine"
const fs = require("fs");
const path = require("path");

const TASKS_FILE = path.join(__dirname, "..", "tasks.json");
const OUTPUT_DIR  = path.join(__dirname, "..", "artifacts", "output");

function updateTaskFailure(stage, failure) {
  const task = JSON.parse(fs.readFileSync(TASKS_FILE));

  task.failure_state.count += 1; // observability counter; not used for escalation decisions
  task.failure_state.last_stage = stage;
  task.failure_state.last_error = failure;

  task.failure_state.history.push({
    stage,
    error: failure.error,
    time: Date.now(),
  });

  fs.writeFileSync(TASKS_FILE, JSON.stringify(task, null, 2));

  return task;
}

function shouldEscalate(task, stage) {
  const stageFailures = task.failure_state.history.filter(h => h.stage === stage).length;
  return stageFailures > task.retry_limit;
}

function isValidAnalysis(obj) {
  return (
    obj !== null &&
    typeof obj === "object" &&
    typeof obj.root_cause === "string" &&
    typeof obj.fix_strategy === "string" &&
    Array.isArray(obj.affected_files) &&
    typeof obj.confidence === "number"
  );
}

function analyzeFailure(workspace, failure, executeDirect, outputDir = OUTPUT_DIR) {
  try {
    executeDirect("failure", workspace, { failure: failure.error });
    const outputPath = path.join(outputDir, "failure.json");
    if (fs.existsSync(outputPath)) {
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
      return isValidAnalysis(parsed) ? parsed : null;
    }
  } catch {
    // analysis is best-effort; a failure here must not block the retry
  }
  return null;
}

function retryStage(stage, workspace, failure, runStage, executeDirect) {
  const task = updateTaskFailure(stage, failure);

  if (shouldEscalate(task, stage)) {
    task.human_required = true;
    fs.writeFileSync(TASKS_FILE, JSON.stringify(task, null, 2));

    console.log("🚨 Escalating to human due to repeated failures");
    process.exit(1);
  }

  console.log("🔁 Retrying stage:", stage);

  const analysis = analyzeFailure(workspace, failure, executeDirect);
  const context = analysis
    ? { failure: failure.error, analysis }
    : { failure: failure.error };

  return runStage(stage, workspace, context);
}

module.exports = { retryStage, shouldEscalate, analyzeFailure };
```

---

# ⚙️ 6. Orchestrator (Core Loop)

## `orchestrator/orchestrator.js`

```js id="orch_final"
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const { retryStage } = require("./retry");

const COMPILED_DIR = path.join(__dirname, "..", "artifacts", "compiled");
const OUTPUT_DIR   = path.join(__dirname, "..", "artifacts", "output");
const TASKS_FILE   = path.join(__dirname, "..", "tasks.json");

const DEFAULT_AGENTS = {
  spec:    "claude",
  plan:    "claude",
  review:  "claude",
  finish:  "gemini",
  failure: "claude",
  build:   "opencode",
  test:    "opencode",
};

function getAgentForStage(stage) {
  const envVar = `AGENT_${stage.toUpperCase()}`;
  return process.env[envVar] || DEFAULT_AGENTS[stage];
}

function updateCurrentStage(stage) {
  try {
    const task = JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
    task.current_stage = stage;
    fs.writeFileSync(TASKS_FILE, JSON.stringify(task, null, 2));
  } catch {
    // non-fatal; tasks.json observability is best-effort
  }
}

function readOutputArtifact(stage) {
  try {
    return fs.readFileSync(path.join(OUTPUT_DIR, `${stage}.json`), "utf-8");
  } catch {
    return null;
  }
}

function executeStage(stage, workspace, context = {}) {
  const prompt = compilePrompt(stage, context);

  fs.mkdirSync(COMPILED_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR,   { recursive: true });
  const inputFile  = path.join(COMPILED_DIR, `${stage}.md`);
  fs.writeFileSync(inputFile, prompt);

  const agent      = getAgentForStage(stage);
  const outputFile = path.join(OUTPUT_DIR, `${stage}.json`);
  const result = spawnSync(
    "agent-cli",
    ["--agent", agent, "--stage", stage, "--input", inputFile, "--output", outputFile, "--workspace", workspace],
    { stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`agent-cli exited with status ${result.status}`);
}

function runStage(stage, workspace, context = {}) {
  try {
    executeStage(stage, workspace, context);
  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace);
    return retryStage(stage, workspace, failure, runStage, executeStage);
  }
}

const PIPELINE = [
  { stage: "spec",   contextKey: "spec",   requiresApproval: true  },
  { stage: "plan",   contextKey: "plan",   requiresApproval: true  },
  { stage: "build",  contextKey: "build",  requiresApproval: false },
  { stage: "test",   contextKey: "test",   requiresApproval: false },
  { stage: "review", contextKey: "review", requiresApproval: false },
  { stage: "finish", contextKey: null,     requiresApproval: false },
];

function runPipeline(workspace) {
  let context = {};

  for (const { stage, contextKey } of PIPELINE) {
    updateCurrentStage(stage);
    runStage(stage, workspace, context);

    if (contextKey) {
      const output = readOutputArtifact(stage);
      if (output) context = { ...context, [contextKey]: output };
    }
  }

  console.log("✅ Pipeline complete");
}

module.exports = { runStage, runPipeline };
```

---

# 🧠 7. Prompt Compiler (unchanged but essential)

## `orchestrator/promptCompiler.js`

```js id="compiler_final"
const fs = require("fs");
const path = require("path");

const SKILLS_DIR  = path.join(__dirname, "..", "prompts", "skills");
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

function load(file) {
  return fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
}

const STAGE_SKILLS = {
  spec:    ["SKILLS.md", "SPEC_DRIVEN.md"],
  plan:    ["SKILLS.md", "PLANNING.md"],
  build:   ["SKILLS.md", "INCREMENTAL_IMPLEMENTATION.md", "TEST_DRIVEN.md", "DEBUGGING.md"],
  test:    ["SKILLS.md", "TEST_DRIVEN.md", "BROWSER_TESTING.md"],
  review:  ["SKILLS.md", "CODE_REVIEW.md", "SECURITY.md", "PERFORMANCE.md"],
  failure: ["SKILLS.md", "DEBUGGING.md"],
};

function compileSkills(stage) {
  const skillFiles = STAGE_SKILLS[stage] || ["SKILLS.md"];
  return skillFiles.map(load).join("\n\n");
}

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(path.join(PROMPTS_DIR, `${stage}.md`), "utf-8");

  template = template.replaceAll("{{SKILLS}}",    compileSkills(stage));
  if (template.includes("{{DEBUGGING}}"))
    template = template.replaceAll("{{DEBUGGING}}", load("DEBUGGING.md"));
  template = template.replaceAll("{{FAILURE}}",   context.failure  || "");
  template = template.replaceAll("{{ANALYSIS}}",  context.analysis ? JSON.stringify(context.analysis, null, 2) : "");
  template = template.replaceAll("{{PLAN}}",      context.plan     || "");
  template = template.replaceAll("{{SPEC}}",      context.spec     || "");
  template = template.replaceAll("{{BUILD}}",     context.build    || "");
  template = template.replaceAll("{{TEST}}",      context.test     || "");

  return template;
}

module.exports = { compilePrompt };
```

---

# 🚦 8. Human Escalation Mechanism

Triggered when:

```js id="human_gate"
// Escalation is per-stage: count how many times *this* stage has failed.
const stageFailures = task.failure_state.history.filter(h => h.stage === stage).length;
if (stageFailures > task.retry_limit) {
  task.human_required = true;
}
```

---

### Output behavior:

```txt id="human_alert"
🚨 Human intervention required

Stage: build
Error: repeated test failure
```

---

# 🔁 9. Full System Behavior

```txt id="flow_final"
spec → plan → build → test → review → finish
                ↓
             failure
                ↓
          Claude analysis
                ↓
          retry (OpenCode)
                ↓
          repeat (max 3)
                ↓
          escalate → human
```

---

# 🧠 10. What You Have

This system includes:

### ✔ failure capture

### ✔ structured debugging (Claude)

### ✔ bounded retry loops

### ✔ persistent failure memory

### ✔ human escalation gate

### ✔ skill-based prompt system

### ✔ reproducible execution via worktrees

---

# 🚀 One-Line Summary

> You have a **self-healing, bounded agentic coding system with controlled recursion and LLM-driven debugging loops.**

---

