const { execSync } = require("child_process");
const fs = require("fs");

function runClaude(stage, input, output) {
  const prompt = fs.readFileSync(`prompts/${stage}.md`, "utf-8");

  const cmd = `
    claude -p \
      --model sonnet-4.5 \
      --output-format json \
      --system "${prompt.replace(/"/g, '\\"')}" \
      < ${input} > ${output}
  `;

  execSync(cmd, { stdio: "inherit" });
}

module.exports = { runClaude };
