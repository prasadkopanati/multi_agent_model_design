const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin");

function runClaude(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const result = spawnSync("claude", [
    "--dangerously-skip-permissions",
    "-p", "Execute the stage instructions above.",
    "--model", "sonnet",
    "--output-format", "json",
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH: `${AGENTICSPIQ_BIN}${path.delimiter}${process.env.PATH}`,
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`claude exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runClaude };
