const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_BIN = path.join(__dirname, "..", "..", "node_modules", ".bin");

function runOpenCode(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const result = spawnSync("opencode", [
    "run",
    "--dangerously-skip-permissions",
    "-m", "opencode/qwen3.5-plus",
    "Execute the stage instructions."
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
  if (result.status !== 0) throw new Error(`opencode exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenCode };
