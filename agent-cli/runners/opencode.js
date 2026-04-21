const { execSync } = require("child_process");
const fs = require("fs");

function runOpenCode(stage, input, output) {
  const prompt = fs.readFileSync(`prompts/${stage}.md`, "utf-8");

  const cmd = `
    opencode -p \
      --model qwen3.5-27b \
      --system "${prompt.replace(/"/g, '\\"')}" \
      < ${input} > ${output}
  `;

  execSync(cmd, { stdio: "inherit" });
}

module.exports = { runOpenCode };
