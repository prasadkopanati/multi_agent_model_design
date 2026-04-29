"use strict";
const fs   = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const INITIAL_TASKS = {
  current_stage: null,
  mode: "normal",
  retry_limit: 3,
  failure_state: { count: 0, last_stage: null, last_error: null, history: [] },
  human_required: false,
  token_budget: { total: 200000, used: 0 },
};

function clearDir(dir, ext) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f === ".gitkeep") continue;
    if (!ext || f.endsWith(ext)) {
      try { fs.unlinkSync(path.join(dir, f)); } catch { /* best-effort */ }
    }
  }
}

function resetWorkspace(workspace, cfg) {
  // Read worktree branch before overwriting tasks.json
  let worktreeBranch = null;
  try {
    const task = JSON.parse(fs.readFileSync(cfg.tasksFile, "utf-8"));
    worktreeBranch = task.worktree_branch || null;
  } catch { /* non-fatal */ }

  // Tear down git worktree if one was created for this run
  if (cfg.worktreePath && fs.existsSync(cfg.worktreePath)) {
    try {
      spawnSync("git", ["-C", workspace, "worktree", "remove", "--force", cfg.worktreePath], { stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  // Delete the feature branch if it still exists (it was merged or discarded by finish)
  if (worktreeBranch) {
    try {
      spawnSync("git", ["-C", workspace, "branch", "-D", worktreeBranch], { stdio: "pipe" });
    } catch { /* best-effort */ }
  }

  // Reset tasks.json
  fs.writeFileSync(cfg.tasksFile, JSON.stringify(INITIAL_TASKS, null, 2));

  // Delete pipeline-state markdown files
  for (const f of ["SPEC.md"]) {
    const p = path.join(cfg.stateDir, f);
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* best-effort */ }
  }

  // Delete carry-over files from previous pipeline runs
  for (const p of [cfg.brainstormFile, cfg.handoffFile]) {
    if (p && fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* best-effort */ }
  }

  for (const f of ["plan.md", "todo.md"]) {
    const p = path.join(cfg.planDir, f);
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* best-effort */ }
  }

  clearDir(cfg.outputDir,   ".json");
  clearDir(cfg.compiledDir, ".md");
  clearDir(cfg.failuresDir, ".json");
}

module.exports = { resetWorkspace };
