#!/usr/bin/env node

const { runClaude } = require("./runners/claude");
const { runOpenCode } = require("./runners/opencode");

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      parsed[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const { agent, stage, input, output, workspace } = args;

  if (!agent || !stage) {
    console.error("Usage: agent-cli --agent <claude|opencode> --stage <stage> [--input <file>] [--output <file>] [--workspace <path>]");
    process.exit(1);
  }

  const defaultInput = `artifacts/compiled/${stage}.md`;
  const defaultOutput = `artifacts/output/${stage}.json`;

  try {
    if (agent === "claude") {
      runClaude(stage, input || defaultInput, output || defaultOutput);
    } else if (agent === "opencode") {
      runOpenCode(stage, input || defaultInput, output || defaultOutput);
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
