const fs = require("fs");

function captureFailure(stage, error, workspace) {
  const failure = {
    stage,
    error: error.toString(),
    timestamp: Date.now(),
    workspace
  };

  const path = `artifacts/failures/${stage}-${Date.now()}.json`;
  fs.writeFileSync(path, JSON.stringify(failure, null, 2));

  return { failure, path };
}

module.exports = { captureFailure };
