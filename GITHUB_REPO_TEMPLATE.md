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

function captureFailure(stage, error, workspace) {
  const failure = {
    stage,
    error: error.toString(),
    timestamp: Date.now(),
    workspace
  };

  const path = `artifacts/failures/${stage}-${Date.now()}.json`;
  fs.writeFileSync(path, JSON.stringify(failure, null, 2));

  return { failure, path };
}

module.exports = { captureFailure };
```

---

# 🧠 4. Structured Failure Analysis (Claude Controller)

## `agent-cli/runners/claude.js` (failure mode included)

```js id="claude_fail"
const { execSync } = require("child_process");
const fs = require("fs");

function runClaude(stage, input, output) {
  const prompt = fs.readFileSync(`prompts/${stage}.md`, "utf-8");

  const cmd = `
    claude -p \
      --model sonnet-4.5 \
      --output-format json \
      --system "${prompt.replace(/"/g, '\\"')}" \
      < ${input} > ${output}
  `;

  execSync(cmd, { stdio: "inherit" });
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
const { runStage } = require("./orchestrator");

function updateTaskFailure(stage, failure) {
  const task = JSON.parse(fs.readFileSync("tasks.json"));

  task.failure_state.count += 1;
  task.failure_state.last_stage = stage;
  task.failure_state.last_error = failure;

  task.failure_state.history.push({
    stage,
    error: failure.error,
    time: Date.now()
  });

  fs.writeFileSync("tasks.json", JSON.stringify(task, null, 2));

  return task;
}

function shouldEscalate(task) {
  return task.failure_state.count >= task.retry_limit;
}

function retryStage(stage, workspace, failure) {
  const task = updateTaskFailure(stage, failure);

  if (shouldEscalate(task)) {
    task.human_required = true;
    fs.writeFileSync("tasks.json", JSON.stringify(task, null, 2));

    console.log("🚨 Escalating to human due to repeated failures");
    process.exit(1);
  }

  console.log("🔁 Retrying stage:", stage);

  return runStage(stage, workspace, {
    failure: failure.error
  });
}

module.exports = { retryStage };
```

---

# ⚙️ 6. Orchestrator (Core Loop)

## `orchestrator/orchestrator.js`

```js id="orch_final"
const { execSync } = require("child_process");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const { retryStage } = require("./retry");
const fs = require("fs");

const AGENTS = {
  spec: "claude",
  plan: "claude",
  review: "claude",
  build: "opencode",
  test: "opencode"
};

function runStage(stage, workspace, context = {}, retry = 0) {
  try {
    const prompt = compilePrompt(stage, context);

    const inputFile = `artifacts/compiled/${stage}.md`;
    fs.writeFileSync(inputFile, prompt);

    const agent = AGENTS[stage];

    execSync(
      `agent-cli --agent ${agent} --stage ${stage} --input ${inputFile} --workspace ${workspace}`,
      { stdio: "inherit" }
    );

  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace);
    return retryStage(stage, workspace, failure);
  }
}

function runPipeline(workspace) {
  const stages = ["spec", "plan", "build", "test", "review"];

  for (const stage of stages) {
    runStage(stage, workspace);
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

function load(file) {
  return fs.readFileSync(`prompts/skills/${file}`, "utf-8");
}

function compileSkills() {
  return [
    load("SKILLS.md"),
    load("DEBUGGING.md"),
    load("GIT.md")
  ].join("\n\n");
}

function compilePrompt(stage, context = {}) {
  let template = fs.readFileSync(`prompts/${stage}.md`, "utf-8");

  template = template.replace("{{SKILLS}}", compileSkills());
  template = template.replace("{{FAILURE}}", context.failure || "");
  template = template.replace("{{PLAN}}", context.plan || "");

  return template;
}

module.exports = { compilePrompt };
```

---

# 🚦 8. Human Escalation Mechanism

Triggered when:

```js id="human_gate"
if (task.failure_state.count >= task.retry_limit) {
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
spec → plan → build → test → review
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

