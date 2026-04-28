"use strict";
const fs   = require("fs");
const path = require("path");

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
  fs.writeFileSync(cfg.tasksFile, JSON.stringify(INITIAL_TASKS, null, 2));

  for (const f of ["SPEC.md"]) {
    const p = path.join(cfg.stateDir, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
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
