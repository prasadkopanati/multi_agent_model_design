#!/usr/bin/env node

const { parseArgs } = require("node:util");
const path          = require("path");
const fs            = require("fs");
const { runClaude } = require("./runners/claude");
const { runOpenCode } = require("./runners/opencode");
const { runGemini } = require("./runners/gemini");

const { values: args } = parseArgs({
  options: {
    agent:     { type: "string" },
    stage:     { type: "string" },
    input:     { type: "string" },
    output:    { type: "string" },
    workspace: { type: "string" },
  },
});

function main() {
  const { agent, stage, input, output, workspace } = args;

  if (!agent || !stage) {
    console.error("Usage: agent-cli --agent <claude|opencode|gemini> --stage <stage> [--input <file>] [--output <file>] [--workspace <path>]");
    process.exit(1);
  }

  const stateDir     = workspace ? path.join(workspace, ".spiq") : process.cwd();
  const defaultInput  = path.join(stateDir, "artifacts", "compiled", `${stage}.md`);
  const defaultOutput = path.join(stateDir, "artifacts", "output",   `${stage}.json`);

  try {
    if (agent === "claude") {
      runClaude(stage, input || defaultInput, output || defaultOutput, workspace);
    } else if (agent === "opencode") {
      runOpenCode(stage, input || defaultInput, output || defaultOutput, workspace);
    } else if (agent === "gemini") {
      runGemini(stage, input || defaultInput, output || defaultOutput, workspace);
    } else {
      console.error(`Unknown agent: ${agent}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error running ${agent} for stage ${stage}:`, err.message);
    process.exit(1);
  }
}

main();
