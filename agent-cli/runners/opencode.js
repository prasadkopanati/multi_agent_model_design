const { spawnSync } = require("child_process");
const fs = require("fs");

function runOpenCode(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const result = spawnSync("opencode", [
    "run",
    "--dangerously-skip-permissions",
    "-m", "Qwen3dot5-local/Qwen3dot5-27B-Opus46",
    "Execute the stage instructions."
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
  });


  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`opencode exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenCode };
