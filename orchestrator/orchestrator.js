const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const { retryStage } = require("./retry");

const COMPILED_DIR = path.join(__dirname, "..", "artifacts", "compiled");
const OUTPUT_DIR   = path.join(__dirname, "..", "artifacts", "output");

const DEFAULT_AGENTS = {
  spec:   "claude",
  plan:   "claude",
  review: "claude",
  build:  "opencode",
  test:   "opencode",
};

function getAgentForStage(stage) {
  const envVar = `AGENT_${stage.toUpperCase()}`;
  return process.env[envVar] || DEFAULT_AGENTS[stage];
}

function readOutputArtifact(stage) {
  try {
    return fs.readFileSync(path.join(OUTPUT_DIR, `${stage}.json`), "utf-8");
  } catch {
    return null;
  }
}

function runStage(stage, workspace, context = {}) {
  try {
    const prompt = compilePrompt(stage, context);

    fs.mkdirSync(COMPILED_DIR, { recursive: true });
    const inputFile = path.join(COMPILED_DIR, `${stage}.md`);
    fs.writeFileSync(inputFile, prompt);

    const agent = getAgentForStage(stage);

    const outputFile = path.join(OUTPUT_DIR, `${stage}.json`);
    const result = spawnSync(
      "agent-cli",
      ["--agent", agent, "--stage", stage, "--input", inputFile, "--output", outputFile, "--workspace", workspace],
      { stdio: "inherit" }
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`agent-cli exited with status ${result.status}`);

  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace);
    return retryStage(stage, workspace, failure, runStage);
  }
}

// Stage sequence and which output key each stage's artifact maps to for the next stage.
const PIPELINE = [
  { stage: "spec",   contextKey: "spec"  },
  { stage: "plan",   contextKey: "plan"  },
  { stage: "build",  contextKey: "build" },
  { stage: "test",   contextKey: "test"  },
  { stage: "review", contextKey: null    },
];

function runPipeline(workspace) {
  let context = {};

  for (const { stage, contextKey } of PIPELINE) {
    runStage(stage, workspace, context);

    if (contextKey) {
      const output = readOutputArtifact(stage);
      if (output) context = { ...context, [contextKey]: output };
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

  runPipeline(values.workspace);
}
