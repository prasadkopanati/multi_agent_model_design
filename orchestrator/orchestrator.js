const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { spawnSync } = require("child_process");
const fs = require("fs");
const readline = require("readline");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const { retryStage } = require("./retry");
const { makeWorkspaceConfig } = require("./workspace-config");

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

function updateCurrentStage(stage, cfg) {
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    task.current_stage = stage;
    fs.writeFileSync(cfg.tasksFile, JSON.stringify(task, null, 2));
  } catch {
    // non-fatal; tasks.json observability is best-effort
  }
}

function readOutputArtifact(stage, cfg) {
  try {
    return fs.readFileSync(path.join(cfg.outputDir, `${stage}.json`), "utf-8");
  } catch {
    return null;
  }
}

function executeStage(stage, workspace, context = {}, cfg) {
  const prompt = compilePrompt(stage, context);

  fs.mkdirSync(cfg.compiledDir, { recursive: true });
  fs.mkdirSync(cfg.outputDir,   { recursive: true });
  const inputFile  = path.join(cfg.compiledDir, `${stage}.md`);
  fs.writeFileSync(inputFile, prompt);

  const agent      = getAgentForStage(stage);
  const outputFile = path.join(cfg.outputDir, `${stage}.json`);
  const agentCli   = path.join(__dirname, "..", "agent-cli", "agent-cli.js");

  console.log(`▶ Running stage: ${stage} [${agent}]`);

  const result = spawnSync(
    process.execPath,
    [agentCli, "--agent", agent, "--stage", stage, "--input", inputFile, "--output", outputFile, "--workspace", workspace],
    { stdio: "inherit" }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`agent-cli exited with status ${result.status}`);
}

function runStage(stage, workspace, context = {}, cfg) {
  try {
    executeStage(stage, workspace, context, cfg);
  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace, cfg.failuresDir);
    return retryStage(stage, workspace, failure, runStage, executeStage, cfg);
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

function writePlanArtifacts(cfg, rawOutput) {
  try {
    const text = extractText(rawOutput);
    fs.mkdirSync(cfg.planDir, { recursive: true });
    fs.writeFileSync(cfg.planFile, text);
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

function promptApproval(stage, cfg) {
  const artifactPath = stage === "spec" ? cfg.specFile
                     : stage === "plan" ? cfg.planFile
                     : "(see .spiq/artifacts/output/)";
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log(`\n📋 ${stage.toUpperCase()} complete. Review: ${artifactPath}`);
    rl.question(`Approve and continue to next stage? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function readRequest(cfg) {
  if (!fs.existsSync(cfg.reqFile)) {
    console.error(`Error: req.md not found at ${cfg.reqFile}`);
    console.error("Run agenticspiq again — it will prompt you to set up requirements.");
    process.exit(1);
  }
  return fs.readFileSync(cfg.reqFile, "utf-8");
}

async function runPipeline(workspace) {
  const cfg = makeWorkspaceConfig(workspace);
  const request = readRequest(cfg);
  let context = { request, specFile: cfg.specFile, planFile: cfg.planFile, planDir: cfg.planDir };

  for (const { stage, contextKey, requiresApproval } of PIPELINE) {
    updateCurrentStage(stage, cfg);
    runStage(stage, workspace, context, cfg);

    const output = readOutputArtifact(stage, cfg);
    if (output) {
      if (stage === "plan")   writePlanArtifacts(cfg, output);
      if (stage === "review") printReviewSummary(output);
      if (contextKey) context = { ...context, [contextKey]: output };
    }

    if (requiresApproval) {
      const approved = await promptApproval(stage, cfg);
      if (!approved) {
        console.log(`⛔ Pipeline stopped at ${stage}. Edit .spiq/req.md and re-run.`);
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
