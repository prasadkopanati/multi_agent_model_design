const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AGENTICSPIQ_NODE_MODULES = path.join(__dirname, "..", "..", "node_modules");
const AGENTICSPIQ_BIN = path.join(AGENTICSPIQ_NODE_MODULES, ".bin");

const OPENCODE_MODEL = process.env.OPENCODE_MODEL || "opencode/qwen3.5-plus";

const OPENCODE_CONFIG = JSON.stringify({
  compaction: {
    auto: true,
    prune: true,
    reserved: 20000,
  },
});

function runOpenCode(stage, input, output, workspace) {
  const prompt = fs.readFileSync(input, "utf-8");
  const result = spawnSync("opencode", [
    "run",
    "--dangerously-skip-permissions",
    "--model", OPENCODE_MODEL,
    "Execute the stage instructions."
  ], {
    cwd: workspace,
    input: prompt,
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      PATH:                    `${AGENTICSPIQ_BIN}${path.delimiter}${process.env.PATH}`,
      NODE_PATH:               `${AGENTICSPIQ_NODE_MODULES}${path.delimiter}${process.env.NODE_PATH || ""}`,
      GIT_AUTHOR_NAME:         "OpenCode Agent",
      GIT_AUTHOR_EMAIL:        "opencode-agent@agenticspiq.local",
      OPENCODE_CONFIG_CONTENT: OPENCODE_CONFIG,
    },
  });


  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`opencode exited with status ${result.status}`);

  fs.writeFileSync(output, result.stdout);
}

module.exports = { runOpenCode };
