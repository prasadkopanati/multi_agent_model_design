const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { spawnSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");
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
  const agentCli = path.join(__dirname, "..", "agent-cli", "agent-cli.js");

  console.log(`▶ Running stage: ${stage} [${agent}]`);

  const result = spawnSync(
    process.execPath,
    [agentCli, "--agent", agent, "--stage", stage, "--input", inputFile, "--output", outputFile, "--workspace", workspace],
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

function extractText(rawOutput) {
  try {
    const parsed = JSON.parse(rawOutput);
    return parsed.result ?? parsed.content ?? parsed.text ?? rawOutput;
  } catch {
    return rawOutput;
  }
}

function printReviewSummary(rawOutput) {
  try {
    const text = extractText(rawOutput);
    const match = text.match(/REVIEW SUMMARY[\s\S]*$/m);
    if (match) console.log("\n" + match[0].trim());
  } catch {
    // non-fatal; summary is best-effort
  }
}

function writePlanArtifacts(workspace, rawOutput) {
  try {
    const text = extractText(rawOutput);
    const tasksDir = path.join(workspace, "tasks");
    fs.mkdirSync(tasksDir, { recursive: true });
    fs.writeFileSync(path.join(tasksDir, "plan.md"), text);
  } catch {
    // non-fatal; executor will also attempt this directly
  }
}

// Stage sequence and which output key each stage's artifact maps to for the next stage.
const PIPELINE = [
  { stage: "spec",   contextKey: "spec",  requiresApproval: true  },
  { stage: "plan",   contextKey: "plan",  requiresApproval: true  },
  { stage: "build",  contextKey: "build", requiresApproval: false },
  { stage: "test",   contextKey: "test",  requiresApproval: false },
  { stage: "review", contextKey: null,    requiresApproval: false },
];

const APPROVAL_ARTIFACTS = {
  spec: "SPEC.md",
  plan: "tasks/plan.md",
};

function promptApproval(stage, workspace) {
  const artifact = APPROVAL_ARTIFACTS[stage];
  const artifactPath = artifact ? path.join(workspace, artifact) : "(see artifacts/output/)";
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n📋 ${stage.toUpperCase()} complete. Review: ${artifactPath}`);
    rl.question(`Approve and continue to next stage? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function readRequest(workspace) {
  const reqFile = path.join(workspace, "req.md");
  if (!fs.existsSync(reqFile)) {
    console.error(`Error: req.md not found in ${workspace}`);
    console.error("Create req.md with your feature request before running agenticspiq.");
    process.exit(1);
  }
  return fs.readFileSync(reqFile, "utf-8");
}

async function runPipeline(workspace) {
  const request = readRequest(workspace);
  let context = { request };

  for (const { stage, contextKey, requiresApproval } of PIPELINE) {
    updateCurrentStage(stage);
    runStage(stage, workspace, context);

    const output = readOutputArtifact(stage);
    if (output) {
      if (stage === "plan")   writePlanArtifacts(workspace, output);
      if (stage === "review") printReviewSummary(output);
      if (contextKey) context = { ...context, [contextKey]: output };
    }

    if (requiresApproval) {
      const approved = await promptApproval(stage, workspace);
      if (!approved) {
        console.log(`⛔ Pipeline stopped at ${stage}. Revise req.md and re-run.`);
        process.exit(0);
      }
    }
  }

  console.log("✅ Pipeline complete");
}

module.exports = { runStage, runPipeline };

if (require.main === module) {
  const { parseArgs } = require("node:util");
  const { values } = parseArgs({
    options: { workspace: { type: "string" } },
  });

  if (!values.workspace) {
    console.error("Usage: node orchestrator/orchestrator.js --workspace <path>");
    process.exit(1);
  }

  runPipeline(values.workspace).catch(err => {
    console.error("Pipeline error:", err.message);
    process.exit(1);
  });
}
