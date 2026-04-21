const { spawnSync } = require("child_process");
const fs = require("fs");

function runOpenCode(stage, input, output, workspace) {
  const systemPrompt = fs.readFileSync(input, "utf-8");

  const result = spawnSync("opencode", [
    "-p",
    "--model", "qwen3.5-27b",
    "--system", systemPrompt,
  ], {
    cwd: workspace,
    input: fs.readFileSync(input),
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`opencode exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenCode };
