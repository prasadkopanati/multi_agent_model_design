const fs = require("fs");
const path = require("path");

const FAILURES_DIR = path.join(__dirname, "..", "artifacts", "failures");

function captureFailure(stage, error, workspace, failuresDir = FAILURES_DIR) {
  const ts = Date.now();

  const failure = {
    stage,
    error: error.toString(),
    timestamp: ts,
    workspace,
  };

  fs.mkdirSync(failuresDir, { recursive: true });
  const filePath = path.join(failuresDir, `${stage}-${ts}.json`);
  fs.writeFileSync(filePath, JSON.stringify(failure, null, 2));

  return { failure, path: filePath };
}

module.exports = { captureFailure };
