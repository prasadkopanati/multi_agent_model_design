const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin");

function runOpenClaude(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const model = process.env.OPENCLAUDE_MODEL || "sonnet";
  const result = spawnSync("openclaude", [
    "--dangerously-skip-permissions",
    "-p", "Execute the stage instructions above.",
    "--model", model,
    "--output-format", "json",
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
