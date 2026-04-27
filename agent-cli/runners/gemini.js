const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const POLICY_FILE = path.join(__dirname, "..", "..", "policies", "yolo-allow-shell.toml");

function runGemini(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
  const result = spawnSync("gemini", [
    "--approval-mode", "yolo",
    "--policy", POLICY_FILE,
    "--model", model,
    "-p", ""
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME:              "Gemini Agent",
      GIT_AUTHOR_EMAIL:             "gemini-agent@agenticspiq.local",
      GEMINI_CLI_TRUST_WORKSPACE:   "true",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`gemini exited with status ${result.status}`);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, result.stdout);
}

module.exports = { runGemini };
