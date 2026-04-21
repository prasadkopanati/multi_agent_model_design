const { spawnSync } = require("child_process");
const fs = require("fs");

function runGemini(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const result = spawnSync("gemini", [
    "--approval-mode", "yolo",
    "--model", model,
    "-p", ""
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gemini exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runGemini };
