const { execSync } = require("child_process");
const { compilePrompt } = require("./promptCompiler");
const { captureFailure } = require("./failure");
const fs = require("fs");

const DEFAULT_AGENTS = {
  spec: "claude",
  plan: "claude",
  review: "claude",
  build: "opencode",
  test: "opencode"
};

function getAgentForStage(stage) {
  const envVar = `AGENT_${stage.toUpperCase()}`;
  return process.env[envVar] || DEFAULT_AGENTS[stage];
}

function runStage(stage, workspace, context = {}, retry = 0) {
  try {
    const prompt = compilePrompt(stage, context);

    const inputFile = `artifacts/compiled/${stage}.md`;
    fs.writeFileSync(inputFile, prompt);

    const agent = getAgentForStage(stage);

    execSync(
      `agent-cli --agent ${agent} --stage ${stage} --input ${inputFile} --workspace ${workspace}`,
      { stdio: "inherit" }
    );

  } catch (err) {
    const { failure } = captureFailure(stage, err, workspace);

    // Lazy require to avoid circular dependency
    const { retryStage } = require("./retry");
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
