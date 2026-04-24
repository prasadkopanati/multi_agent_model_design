const fs = require("fs");
const path = require("path");

function captureFailure(stage, error, workspace, failuresDir) {
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
