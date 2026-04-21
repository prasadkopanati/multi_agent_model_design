#!/usr/bin/env node
const { spawnSync } = require("child_process");
const path = require("path");

const args = process.argv.slice(2);
const hasWorkspace = args.some(a => a === "--workspace" || a.startsWith("--workspace="));
if (!hasWorkspace) {
  args.push("--workspace", process.cwd());
}

const result = spawnSync(
  process.execPath,
  [path.join(__dirname, "../orchestrator/orchestrator.js"), ...args],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
