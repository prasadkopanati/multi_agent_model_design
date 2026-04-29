const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin");

// Minimal tool set for executor stages — keeps the built-in system prompt small
// so local models with limited context windows (e.g. llama.cpp at ~36K tokens)
// have room to generate code. OpenClaude's full tool set can consume 30-35K tokens
// in system prompt descriptions alone, leaving no budget for output.
const EXECUTOR_TOOLS = "Bash,Read,Write,Edit,Glob,Grep";

function runOpenClaude(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const model = process.env.OPENCLAUDE_MODEL || "sonnet";
  const result = spawnSync("openclaude", [
    "--dangerously-skip-permissions",
    "-p", "Execute the stage instructions above.",
    "--model", model,
    "--output-format", "json",
    "--tools", EXECUTOR_TOOLS,
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH:             `${AGENTICSPIQ_BIN}${path.delimiter}${process.env.PATH}`,
      GIT_AUTHOR_NAME:  "OpenClaude Agent",
      GIT_AUTHOR_EMAIL: "claude-agent@agenticspiq.local",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`openclaude exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenClaude };
