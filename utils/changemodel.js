"use strict";
const fs       = require("fs");
const path     = require("path");
const readline = require("readline");
const dotenv   = require("dotenv");

const VALID_AGENTS = ["claude", "opencode", "gemini", "openclaude"];

const CONFIGURABLE = [
  { label: "claude",      envVar: "CLAUDE_MODEL",     group: "Models",         validate: "any"   },
  { label: "opencode",    envVar: "OPENCODE_MODEL",    group: "Models",         validate: "any"   },
  { label: "gemini",      envVar: "GEMINI_MODEL",      group: "Models",         validate: "any"   },
  { label: "openclaude",  envVar: "OPENCLAUDE_MODEL",  group: "Models",         validate: "any"   },
  { label: "spec",        envVar: "AGENT_SPEC",        group: "Stage → Agent",  validate: "agent" },
  { label: "plan",        envVar: "AGENT_PLAN",        group: "Stage → Agent",  validate: "agent" },
  { label: "build",       envVar: "AGENT_BUILD",       group: "Stage → Agent",  validate: "agent" },
  { label: "test",        envVar: "AGENT_TEST",        group: "Stage → Agent",  validate: "agent" },
  { label: "review",      envVar: "AGENT_REVIEW",      group: "Stage → Agent",  validate: "agent" },
  { label: "fix",         envVar: "AGENT_FIX",         group: "Stage → Agent",  validate: "agent" },
  { label: "finish",      envVar: "AGENT_FINISH",      group: "Stage → Agent",  validate: "agent" },
  { label: "failure",     envVar: "AGENT_FAILURE",     group: "Stage → Agent",  validate: "agent" },
];

function readEnvValues(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

function updateEnvFile(envPath, key, value) {
  let content = "";
  try { content = fs.readFileSync(envPath, "utf-8"); } catch { /* new file */ }

  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, `${key}=${value}`);
  } else {
    content = content.endsWith("\n") || content === ""
      ? `${content}${key}=${value}\n`
      : `${content}\n${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content);
}

function validateValue(item, value) {
  if (!value || value.trim() === "") return "Value cannot be empty.";
  if (item.validate === "agent" && !VALID_AGENTS.includes(value)) {
    return `Invalid agent "${value}". Valid: ${VALID_AGENTS.join(", ")}`;
  }
  return null;
}

function printTable(envValues) {
  const SEP = "━".repeat(56);
  console.log("\n" + SEP);
  console.log("  agenticspiq — model configuration");
  console.log(SEP + "\n");

  let num = 1;
  let lastGroup = null;
  for (const item of CONFIGURABLE) {
    if (item.group !== lastGroup) {
      console.log(`  ${item.group}`);
      lastGroup = item.group;
    }
    const current = envValues[item.envVar] ?? "(not set)";
    const numPad   = String(num).padStart(2);
    const labelPad = item.label.padEnd(11);
    const varPad   = item.envVar.padEnd(18);
    console.log(`  [${numPad}]  ${labelPad}  ${varPad}  = ${current}`);
    num++;
  }
  console.log();
}

async function ask(rl, question) {
  return new Promise(resolve => rl.question(question, a => resolve(a.trim())));
}

async function runInteractive(envPath) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const envValues = readEnvValues(envPath);
    printTable(envValues);

    const sel = await ask(rl, `  Select item to change [1-${CONFIGURABLE.length}, or q to quit]: `);
    if (sel === "q" || sel === "Q" || sel === "") { rl.close(); break; }

    const idx = parseInt(sel, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= CONFIGURABLE.length) {
      console.log(`  Invalid selection.\n`);
      continue;
    }

    const item = CONFIGURABLE[idx];
    const current = envValues[item.envVar] ?? "(not set)";
    const hint = item.validate === "agent" ? ` [${VALID_AGENTS.join("|")}]` : "";

    const newVal = await ask(rl, `  ${item.envVar} (current: ${current})${hint}: `);
    if (newVal === "") { console.log("  No change.\n"); continue; }

    const err = validateValue(item, newVal);
    if (err) { console.log(`  Error: ${err}\n`); continue; }

    updateEnvFile(envPath, item.envVar, newVal);
    console.log(`  ✓ ${item.envVar} = ${newVal}\n`);
  }

  console.log("  Configuration saved to .env\n");
}

function runDirect(envPath, assignment) {
  const eqIdx = assignment.indexOf("=");
  if (eqIdx === -1) {
    console.error(`Error: expected format key=value, got "${assignment}"`);
    console.error(`Run agenticspiq changemodel to see configurable items.`);
    process.exit(1);
  }

  const rawKey = assignment.slice(0, eqIdx).trim();
  const value  = assignment.slice(eqIdx + 1).trim();

  // Resolve: friendly alias or full env var name
  let item = CONFIGURABLE.find(c => c.label === rawKey)
          || CONFIGURABLE.find(c => c.envVar === rawKey);

  if (!item) {
    console.error(`Error: unknown key "${rawKey}".`);
    console.error(`Run agenticspiq changemodel to see configurable items.`);
    process.exit(1);
  }

  const err = validateValue(item, value);
  if (err) { console.error(`Error: ${err}`); process.exit(1); }

  updateEnvFile(envPath, item.envVar, value);
  console.log(`✓ ${item.envVar} = ${value}`);
}

async function changeModel(envPath, args = []) {
  if (args.length > 0) {
    runDirect(envPath, args[0]);
    return;
  }
  await runInteractive(envPath);
}

module.exports = { changeModel };
