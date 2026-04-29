"use strict";
const fs        = require("fs");
const path      = require("path");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const REQUIRED_ENV = ["CLAUDE_MODEL", "OPENCODE_MODEL", "GEMINI_MODEL"];
const TOOLS = [
  { name: "claude",   cmd: ["claude", "--version"] },
  { name: "opencode", cmd: ["opencode", "--version"] },
  { name: "gemini",   cmd: ["gemini", "--version"] },
];

const COL = 36;
function row(label, ok, detail = "") {
  const mark = ok ? "✓" : "✗";
  const pad  = label.padEnd(COL);
  return `  ${mark}  ${pad}${detail}`;
}

function checkTool(tool) {
  try {
    const r = spawnSync(tool.cmd[0], tool.cmd.slice(1), { stdio: "pipe" });
    if (r.error) return { ok: false, detail: r.error.message };
    if (r.status !== 0) return { ok: false, detail: `exit ${r.status}` };
    const ver = (r.stdout?.toString() || "").split("\n")[0].trim();
    return { ok: true, detail: ver || "available" };
  } catch (err) {
    return { ok: false, detail: err.message };
  }
}

function checkDotEnv(envFile) {
  if (!fs.existsSync(envFile)) return { ok: false, detail: ".env not found" };
  const content = fs.readFileSync(envFile, "utf-8");
  const missing = REQUIRED_ENV.filter(k => !content.includes(k + "="));
  if (missing.length > 0) return { ok: false, detail: `missing: ${missing.join(", ")}` };
  return { ok: true, detail: "all required vars present" };
}

function checkWorkspace(workspace) {
  const spiqDir = path.join(workspace, ".spiq");
  if (!fs.existsSync(spiqDir)) return { ok: false, detail: ".spiq/ not found — run agenticspiq first" };

  const tasksFile = path.join(spiqDir, "tasks.json");
  if (!fs.existsSync(tasksFile)) return { ok: false, detail: "tasks.json missing" };

  try {
    const task = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    const stage = task.current_stage || "none";
    const humanRequired = task.human_required ? " ⚠ human_required=true" : "";
    return { ok: !task.human_required, detail: `current_stage=${stage}${humanRequired}` };
  } catch {
    return { ok: false, detail: "tasks.json unparseable" };
  }
}

function checkGit(workspace) {
  const r = spawnSync("git", ["-C", workspace, "rev-parse", "--git-dir"], { stdio: "pipe" });
  if (r.status !== 0) return { ok: false, detail: "not a git repository" };

  const statusR = spawnSync("git", ["-C", workspace, "status", "--porcelain"], { stdio: "pipe" });
  const dirty = (statusR.stdout?.toString() || "").trim();
  return { ok: true, detail: dirty ? `${dirty.split("\n").length} uncommitted change(s)` : "clean" };
}

function checkWorktree(workspace) {
  const spiqDir = path.join(workspace, ".spiq");
  const tasksFile = path.join(spiqDir, "tasks.json");
  if (!fs.existsSync(tasksFile)) return null;

  let branch = null;
  try {
    const task = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    branch = task.worktree_branch || null;
  } catch { return null; }

  if (!branch) return null;

  const worktreePath = path.join(spiqDir, "worktree");
  const exists = fs.existsSync(worktreePath);
  return { ok: exists, detail: `branch=${branch} ${exists ? "(exists)" : "(missing — may need cleanup)"}` };
}

function checkEventLog(workspace) {
  const logFile = path.join(workspace, ".spiq", "artifacts", "logs", "pipeline.jsonl");
  if (!fs.existsSync(logFile)) return { ok: true, detail: "no log yet" };

  const lines = fs.readFileSync(logFile, "utf-8").trim().split("\n").filter(Boolean);
  const last = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;
  return {
    ok: true,
    detail: `${lines.length} event(s)${last ? `, last: ${last.type} at ${last.ts}` : ""}`,
  };
}

async function runDoctor(workspace) {
  const SEP = "━".repeat(54);
  console.log("\n" + SEP);
  console.log("  agenticspiq doctor — system health check");
  console.log(SEP + "\n");

  const envFile = path.join(__dirname, "..", ".env");
  let allOk = true;
  const problems = [];

  function report(label, { ok, detail }) {
    console.log(row(label, ok, detail));
    if (!ok) { allOk = false; problems.push(label); }
  }

  console.log("CLI Tools");
  for (const tool of TOOLS) {
    report(tool.name, checkTool(tool));
  }

  console.log("\nConfiguration");
  report(".env", checkDotEnv(envFile));

  const gitCheck = checkGit(workspace);
  report("git repository", gitCheck);

  console.log("\nWorkspace");
  report(".spiq/ state", checkWorkspace(workspace));

  const worktreeCheck = checkWorktree(workspace);
  if (worktreeCheck) report("worktree", worktreeCheck);

  report("event log", checkEventLog(workspace));

  console.log("\n" + SEP);

  if (allOk) {
    console.log("  All checks passed. Ready to run.\n");
  } else {
    console.log(`  ${problems.length} issue(s) found: ${problems.join(", ")}`);
    console.log("  Fix the issues above before running the pipeline.\n");
  }
}

module.exports = { runDoctor };
