const fs   = require("fs");
const os   = require("os");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { runClaude }   = require("../agent-cli/runners/claude");
const { runOpenCode } = require("../agent-cli/runners/opencode");
const { runGemini }   = require("../agent-cli/runners/gemini");

const STAGE_AGENTS = ["AGENT_SPEC", "AGENT_PLAN", "AGENT_BUILD", "AGENT_TEST", "AGENT_REVIEW", "AGENT_FINISH", "AGENT_FAILURE"];

const MODEL_DEFAULTS = {
  claude:   "sonnet",
  opencode: "opencode/qwen3.5-plus",
  gemini:   "gemini-2.5-flash-preview",
};

const MODEL_VARS = {
  claude:   "CLAUDE_MODEL",
  opencode: "OPENCODE_MODEL",
  gemini:   "GEMINI_MODEL",
};

const RUNNERS = {
  claude:   runClaude,
  opencode: runOpenCode,
  gemini:   runGemini,
};

const TEST_PROMPT = 'Reply with only the word "ok".\n';

async function checkConfig() {
  const agentTypes = new Set(
    STAGE_AGENTS
      .map(v => process.env[v])
      .filter(Boolean)
  );

  if (agentTypes.size === 0) {
    console.log("No AGENT_* variables set. Nothing to check.");
    return true;
  }

  console.log("Checking agent configuration...\n");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spiq-check-"));
  const inputFile  = path.join(tmpDir, "prompt.md");
  const outputFile = path.join(tmpDir, "output.json");

  fs.writeFileSync(inputFile, TEST_PROMPT);

  const results = [];

  for (const agent of agentTypes) {
    const runner = RUNNERS[agent];
    if (!runner) {
      results.push({ agent, model: "?", ok: false, error: `Unknown agent type: ${agent}` });
      continue;
    }

    const model = process.env[MODEL_VARS[agent]] || MODEL_DEFAULTS[agent];

    try {
      runner("check", inputFile, outputFile, tmpDir);
      results.push({ agent, model, ok: true });
    } catch (err) {
      results.push({ agent, model, ok: false, error: err.message });
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });

  const agentCol  = Math.max(...results.map(r => r.agent.length), 6);
  const modelCol  = Math.max(...results.map(r => r.model.length), 5);

  for (const r of results) {
    const mark  = r.ok ? "✓" : "✗";
    const label = r.ok ? "responded" : `Error: ${r.error}`;
    console.log(`  ${mark}  ${r.agent.padEnd(agentCol)}  ${r.model.padEnd(modelCol)}  — ${label}`);
  }

  const failures = results.filter(r => !r.ok);
  console.log();
  if (failures.length === 0) {
    console.log("All agents responded. Configuration looks good.");
    return true;
  }

  const word = failures.length === 1 ? "agent" : "agents";
  console.log(`${failures.length} ${word} failed. Fix .env before running the pipeline.`);
  return false;
}

module.exports = { checkConfig };
