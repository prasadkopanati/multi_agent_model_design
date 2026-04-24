const path = require("path");

function makeWorkspaceConfig(workspace) {
  const stateDir = path.join(workspace, ".spiq");
  return {
    workspace,
    stateDir,
    compiledDir: path.join(stateDir, "artifacts", "compiled"),
    outputDir:   path.join(stateDir, "artifacts", "output"),
    failuresDir: path.join(stateDir, "artifacts", "failures"),
    tasksFile:   path.join(stateDir, "tasks.json"),
    reqFile:     path.join(stateDir, "req.md"),
    specFile:    path.join(stateDir, "SPEC.md"),
    planFile:    path.join(stateDir, "tasks", "plan.md"),
    planDir:     path.join(stateDir, "tasks"),
  };
}

module.exports = { makeWorkspaceConfig };
